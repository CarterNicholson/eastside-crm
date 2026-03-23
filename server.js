import express from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Ensure data directory exists (for users/sessions — still JSON for now)
try { mkdirSync(join(__dirname, 'data'), { recursive: true }); } catch {}

const USERS_FILE = join(__dirname, 'data', 'users.json');
const SESSIONS_FILE = join(__dirname, 'data', 'sessions.json');

// ─── POSTGRESQL SETUP ──────────────────────────────────────────────
const { Pool } = pg;
let pool = null;
let dbReady = false;

async function initDB() {
  if (!process.env.DATABASE_URL) {
    console.warn('[DB] No DATABASE_URL found — falling back to JSON file storage for emails');
    return false;
  }

  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false,
    });

    // Test connection
    await pool.query('SELECT NOW()');
    console.log('[DB] Connected to PostgreSQL');

    // Create emails table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS emails (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT 'user_carter',
        "from" TEXT DEFAULT '',
        "to" TEXT DEFAULT '',
        subject TEXT DEFAULT '(no subject)',
        body TEXT DEFAULT '',
        date TEXT DEFAULT '',
        contact_id TEXT,
        deal_id TEXT,
        is_inbound BOOLEAN DEFAULT true,
        is_read BOOLEAN DEFAULT false,
        source TEXT DEFAULT 'manual',
        importance TEXT DEFAULT 'normal',
        has_attachments BOOLEAN DEFAULT false,
        conversation_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Create index for fast user-scoped queries
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_emails_user_id ON emails(user_id)
    `);

    console.log('[DB] Emails table ready');
    dbReady = true;
    return true;
  } catch (err) {
    console.error('[DB] Failed to connect:', err.message);
    return false;
  }
}

// ─── EMAIL DB HELPERS ──────────────────────────────────────────────

// Fallback JSON file for when DB is not available
const EMAILS_FILE = join(__dirname, 'data', 'emails.json');

function loadEmailsJSON() {
  try {
    if (existsSync(EMAILS_FILE)) return JSON.parse(readFileSync(EMAILS_FILE, 'utf-8'));
  } catch {}
  return [];
}

function saveEmailsJSON(emails) {
  try { writeFileSync(EMAILS_FILE, JSON.stringify(emails, null, 2)); }
  catch (e) { console.error('Failed to save emails.json:', e); }
}

async function getEmails(userId) {
  if (dbReady) {
    try {
      const result = await pool.query(
        `SELECT id, user_id as "userId", "from", "to", subject, body, date,
                contact_id as "contactId", deal_id as "dealId",
                is_inbound as "isInbound", is_read as "isRead", source,
                importance, has_attachments as "hasAttachments", conversation_id as "conversationId"
         FROM emails
         WHERE user_id = $1 OR user_id IS NULL
         ORDER BY created_at DESC`,
        [userId]
      );
      return result.rows.map(row => ({
        ...row,
        rawHeaders: {
          importance: row.importance || 'normal',
          hasAttachments: row.hasAttachments || false,
          conversationId: row.conversationId || null,
        }
      }));
    } catch (err) {
      console.error('[DB] Failed to get emails:', err.message);
      return [];
    }
  }
  // Fallback to JSON
  const emails = loadEmailsJSON();
  return userId ? emails.filter(e => e.userId === userId || !e.userId) : [];
}

async function addEmail(email) {
  if (dbReady) {
    try {
      await pool.query(
        `INSERT INTO emails (id, user_id, "from", "to", subject, body, date, contact_id, deal_id, is_inbound, is_read, source, importance, has_attachments, conversation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          email.id, email.userId || 'user_carter',
          email.from, email.to, email.subject, email.body, email.date,
          email.contactId || null, email.dealId || null,
          email.isInbound, email.isRead || false, email.source || 'manual',
          email.rawHeaders?.importance || 'normal',
          email.rawHeaders?.hasAttachments || false,
          email.rawHeaders?.conversationId || null,
        ]
      );
      return true;
    } catch (err) {
      console.error('[DB] Failed to add email:', err.message);
      return false;
    }
  }
  // Fallback to JSON
  const emails = loadEmailsJSON();
  emails.unshift(email);
  saveEmailsJSON(emails);
  return true;
}

async function deleteEmail(emailId) {
  if (dbReady) {
    try {
      await pool.query('DELETE FROM emails WHERE id = $1', [emailId]);
      return true;
    } catch (err) {
      console.error('[DB] Failed to delete email:', err.message);
      return false;
    }
  }
  const emails = loadEmailsJSON().filter(e => e.id !== emailId);
  saveEmailsJSON(emails);
  return true;
}

async function markEmailRead(emailId) {
  if (dbReady) {
    try {
      await pool.query('UPDATE emails SET is_read = true WHERE id = $1', [emailId]);
      return true;
    } catch (err) {
      console.error('[DB] Failed to mark email read:', err.message);
      return false;
    }
  }
  const emails = loadEmailsJSON().map(e =>
    e.id === emailId ? { ...e, isRead: true } : e
  );
  saveEmailsJSON(emails);
  return true;
}

async function getEmailCount() {
  if (dbReady) {
    try {
      const result = await pool.query('SELECT COUNT(*) FROM emails');
      return parseInt(result.rows[0].count, 10);
    } catch { return 0; }
  }
  return loadEmailsJSON().length;
}

// ─── JSON FILE HELPERS (users/sessions only) ─────────────────────
function loadJSON(filepath, fallback = []) {
  try {
    if (existsSync(filepath)) return JSON.parse(readFileSync(filepath, 'utf-8'));
  } catch {}
  return typeof fallback === 'function' ? fallback() : fallback;
}

function saveJSON(filepath, data) {
  try { writeFileSync(filepath, JSON.stringify(data, null, 2)); }
  catch (e) { console.error(`Failed to save ${filepath}:`, e); }
}

// ─── AUTH HELPERS ───────────────────────────────────────────────────
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function createSession(userId, name, email) {
  const token = crypto.randomBytes(32).toString('hex');
  const sessions = loadJSON(SESSIONS_FILE, {});
  sessions[token] = { userId, name, email, createdAt: new Date().toISOString() };
  saveJSON(SESSIONS_FILE, sessions);
  return token;
}

function getSession(token) {
  if (!token) return null;
  const sessions = loadJSON(SESSIONS_FILE, {});
  return sessions[token] || null;
}

function deleteSession(token) {
  const sessions = loadJSON(SESSIONS_FILE, {});
  delete sessions[token];
  saveJSON(SESSIONS_FILE, sessions);
}

// Get userId from request (auth header)
function getUserId(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const session = getSession(token);
  return session?.userId || null;
}

// Initialize default users if none exist
function initUsers() {
  const users = loadJSON(USERS_FILE, []);
  const carter = users.find(u => u.id === 'user_carter');
  if (users.length === 0 || (carter && carter.email !== 'carter.nicholson@kidder.com')) {
    const defaults = [
      { id: 'user_carter', name: 'Carter Nicholson', email: 'carter.nicholson@kidder.com', password: hashPassword('eastside2024'), role: 'admin' },
      { id: 'user_greg', name: 'Greg', email: 'greg@kidder.com', password: hashPassword('eastside2024'), role: 'broker' },
    ];
    saveJSON(USERS_FILE, defaults);
    console.log('Default users created (password: eastside2024)');
  }
}
initUsers();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── AUTH ROUTES ────────────────────────────────────────────────────

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const users = loadJSON(USERS_FILE, []);
  const user = users.find(u => u.email.toLowerCase() === (email || '').toLowerCase());

  if (!user || user.password !== hashPassword(password || '')) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = createSession(user.id, user.name, user.email);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post('/api/auth/logout', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  deleteSession(token);
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const session = getSession(token);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  const users = loadJSON(USERS_FILE, []);
  const user = users.find(u => u.id === session.userId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

app.get('/api/auth/users', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const session = getSession(token);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  const users = loadJSON(USERS_FILE, []);
  res.json(users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role })));
});

app.post('/api/auth/users', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const session = getSession(token);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  const users = loadJSON(USERS_FILE, []);
  const requester = users.find(u => u.id === session.userId);
  if (!requester || requester.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password required' });

  if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'Email already in use' });
  }

  const newUser = {
    id: `user_${Date.now()}`,
    name,
    email,
    password: hashPassword(password),
    role: role || 'broker',
  };
  users.push(newUser);
  saveJSON(USERS_FILE, users);

  res.json({ id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role });
});

app.post('/api/auth/change-password', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const session = getSession(token);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  const { currentPassword, newPassword } = req.body;
  const users = loadJSON(USERS_FILE, []);
  const user = users.find(u => u.id === session.userId);
  if (!user) return res.status(401).json({ error: 'User not found' });

  if (user.password !== hashPassword(currentPassword || '')) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  user.password = hashPassword(newPassword);
  saveJSON(USERS_FILE, users);
  res.json({ success: true });
});

// ─── EMAIL ROUTES (user-scoped, now using PostgreSQL) ────────────

app.get('/api/health', async (req, res) => {
  const count = await getEmailCount();
  res.json({ status: 'ok', emails: count, db: dbReady ? 'postgres' : 'json' });
});

// Get emails — only returns emails for the authenticated user
app.get('/api/emails', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.json([]);
  const emails = await getEmails(userId);
  res.json(emails);
});

// Manually log an email (tagged to current user)
app.post('/api/emails', async (req, res) => {
  const userId = getUserId(req);
  const { from, to, subject, body, contactId, dealId, isInbound } = req.body;

  const email = {
    id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId: userId || 'user_carter',
    from: from || '',
    to: to || '',
    subject: subject || '(no subject)',
    body: body || '',
    date: new Date().toISOString().split('T')[0],
    contactId: contactId || null,
    dealId: dealId || null,
    isInbound: isInbound ?? true,
    isRead: false,
    source: 'manual',
    rawHeaders: { importance: 'normal', hasAttachments: false, conversationId: null },
  };

  await addEmail(email);
  res.json({ success: true, email });
});

// Power Automate webhook — emails go to Carter's account by default
app.post('/api/emails/inbound', async (req, res) => {
  const data = req.body;

  const email = {
    id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId: 'user_carter',
    from: data.from || data.From || data.sender || '',
    to: data.to || data.To || data.toRecipients || '',
    subject: data.subject || data.Subject || '(no subject)',
    body: stripHtml(data.body || data.Body || data.bodyPreview || ''),
    date: parseEmailDate(data.receivedDateTime || data.DateTimeReceived || data.date),
    contactId: null,
    dealId: null,
    isInbound: data.isInbound !== undefined ? data.isInbound : true,
    isRead: false,
    source: 'outlook',
    rawHeaders: {
      importance: data.importance || data.Importance || 'normal',
      hasAttachments: data.hasAttachments || data.HasAttachments || false,
      conversationId: data.conversationId || data.ConversationId || null,
    },
  };

  await addEmail(email);

  const direction = email.isInbound ? 'Received' : 'Sent';
  console.log(`[Email ${direction}] ${email.isInbound ? 'From' : 'To'}: ${email.isInbound ? email.from : email.to} | Subject: ${email.subject}`);
  res.json({ success: true, id: email.id });
});

app.delete('/api/emails/:id', async (req, res) => {
  await deleteEmail(req.params.id);
  res.json({ success: true });
});

app.patch('/api/emails/:id/read', async (req, res) => {
  await markEmailRead(req.params.id);
  res.json({ success: true });
});

// ─── HELPERS ──────────────────────────────────────────────────────────

function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseEmailDate(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  try { return new Date(dateStr).toISOString().split('T')[0]; }
  catch { return new Date().toISOString().split('T')[0]; }
}

// ─── SERVE FRONTEND ──────────────────────────────────────────────────
app.use(express.static(join(__dirname, 'dist')));

// SPA fallback
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    res.sendFile(join(__dirname, 'dist', 'index.html'));
  } else {
    next();
  }
});

// ─── START SERVER ────────────────────────────────────────────────────
async function start() {
  await initDB();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Eastside CRM server running on port ${PORT}`);
    console.log(`Email storage: ${dbReady ? 'PostgreSQL' : 'JSON file (ephemeral)'}`);
    console.log(`Email webhook: POST /api/emails/inbound`);
  });
}

start();
