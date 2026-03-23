import express from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Ensure data directory exists
try { mkdirSync(join(__dirname, 'data'), { recursive: true }); } catch {}

const EMAILS_FILE = join(__dirname, 'data', 'emails.json');
const USERS_FILE = join(__dirname, 'data', 'users.json');
const SESSIONS_FILE = join(__dirname, 'data', 'sessions.json');

// ─── JSON FILE HELPERS ──────────────────────────────────────────────
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

// ─── EMAIL ROUTES (user-scoped) ─────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', emails: loadJSON(EMAILS_FILE).length });
});

// Get emails — only returns emails for the authenticated user
app.get('/api/emails', (req, res) => {
  const userId = getUserId(req);
  const emails = loadJSON(EMAILS_FILE);
  if (userId) {
    // Return only emails belonging to this user (or unassigned legacy emails)
    res.json(emails.filter(e => e.userId === userId || !e.userId));
  } else {
    res.json([]);
  }
});

// Manually log an email (tagged to current user)
app.post('/api/emails', (req, res) => {
  const userId = getUserId(req);
  const { from, to, subject, body, contactId, dealId, isInbound } = req.body;

  const email = {
    id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId: userId || 'user_carter', // Default to Carter
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
  };

  const emails = loadJSON(EMAILS_FILE);
  emails.unshift(email);
  saveJSON(EMAILS_FILE, emails);
  res.json({ success: true, email });
});

// Power Automate webhook — emails go to Carter's account by default
app.post('/api/emails/inbound', (req, res) => {
  const data = req.body;

  const email = {
    id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId: 'user_carter', // Power Automate emails go to Carter
    from: data.from || data.From || data.sender || '',
    to: data.to || data.To || data.toRecipients || '',
    subject: data.subject || data.Subject || '(no subject)',
    body: stripHtml(data.body || data.Body || data.bodyPreview || ''),
    date: parseEmailDate(data.receivedDateTime || data.DateTimeReceived || data.date),
    contactId: null,
    dealId: null,
    isInbound: true,
    isRead: false,
    source: 'outlook',
    rawHeaders: {
      importance: data.importance || data.Importance || 'normal',
      hasAttachments: data.hasAttachments || data.HasAttachments || false,
      conversationId: data.conversationId || data.ConversationId || null,
    },
  };

  const emails = loadJSON(EMAILS_FILE);
  emails.unshift(email);
  saveJSON(EMAILS_FILE, emails);

  console.log(`[Email Received] From: ${email.from} | Subject: ${email.subject}`);
  res.json({ success: true, id: email.id });
});

app.delete('/api/emails/:id', (req, res) => {
  const emails = loadJSON(EMAILS_FILE).filter(e => e.id !== req.params.id);
  saveJSON(EMAILS_FILE, emails);
  res.json({ success: true });
});

app.patch('/api/emails/:id/read', (req, res) => {
  const emails = loadJSON(EMAILS_FILE).map(e =>
    e.id === req.params.id ? { ...e, isRead: true } : e
  );
  saveJSON(EMAILS_FILE, emails);
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Eastside CRM server running on port ${PORT}`);
  console.log(`Email webhook: POST /api/emails/inbound`);
});
