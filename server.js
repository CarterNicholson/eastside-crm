import express from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import pg from 'pg';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Ensure data directory exists (for users/sessions — still JSON for now)
try { mkdirSync(join(__dirname, 'data'), { recursive: true }); } catch {}

const USERS_FILE = join(__dirname, 'data', 'users.json');
const SESSIONS_FILE = join(__dirname, 'data', 'sessions.json');
const INVITE_CODES_FILE = join(__dirname, 'data', 'invite-codes.json');

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

    await pool.query('SELECT NOW()');
    console.log('[DB] Connected to PostgreSQL');

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

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_emails_user_id ON emails(user_id)`);

    // Geocode cache table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS geocode_cache (
        address_key TEXT PRIMARY KEY,
        lat DOUBLE PRECISION,
        lng DOUBLE PRECISION,
        display_name TEXT,
        geocoded_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    console.log('[DB] Emails + geocode tables ready');
    dbReady = true;
    return true;
  } catch (err) {
    console.error('[DB] Failed to connect:', err.message);
    return false;
  }
}

// ─── AI SETUP ──────────────────────────────────────────────────────
let anthropic = null;
let aiReady = false;

function initAI() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[AI] No ANTHROPIC_API_KEY found — AI features disabled');
    return;
  }
  try {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    aiReady = true;
    console.log('[AI] Claude integration ready');
  } catch (err) {
    console.error('[AI] Failed to initialize:', err.message);
  }
}

// Load CRM data from static JSON file
let crmDataCache = null;
function loadCRMData() {
  if (crmDataCache) return crmDataCache;
  try {
    const raw = JSON.parse(readFileSync(join(__dirname, 'dist', 'crm-data.json'), 'utf-8'));
    crmDataCache = {
      contacts: raw.contacts || [],
      activities: raw.activities || [],
      reminders: raw.reminders || [],
      suggestions: raw.suggestions || [],
      deals: raw.deals || [],
    };
    return crmDataCache;
  } catch (e) {
    // Try public folder if dist not built yet
    try {
      const raw = JSON.parse(readFileSync(join(__dirname, 'public', 'crm-data.json'), 'utf-8'));
      crmDataCache = {
        contacts: raw.contacts || [],
        activities: raw.activities || [],
        reminders: raw.reminders || [],
        suggestions: raw.suggestions || [],
        deals: raw.deals || [],
      };
      return crmDataCache;
    } catch {
      return { contacts: [], activities: [], reminders: [], suggestions: [], deals: [] };
    }
  }
}

// Extract keywords from a question for pre-filtering
function extractKeywords(question) {
  const stopWords = new Set(['the','a','an','is','are','was','were','be','been','being','have','has','had',
    'do','does','did','will','would','could','should','may','might','shall','can','need',
    'i','me','my','we','our','you','your','he','she','it','they','them','their',
    'who','what','where','when','how','which','that','this','these','those',
    'and','or','but','not','no','so','if','then','than','too','very','just',
    'about','for','with','from','into','of','to','in','on','at','by','up','out',
    'all','any','some','most','many','much','more','other','each','every',
    'show','find','get','give','tell','list','search','look',
    'contacts','contact','people','person','deals','deal','activity','activities',
    'based','off','should','think','recommend','suggest','priority','important']);
  return question.toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
}

// Find contacts relevant to a question
function findRelevantContacts(question, contacts, activities, limit = 80) {
  const keywords = extractKeywords(question);
  if (keywords.length === 0) return contacts.slice(0, limit);

  const scored = contacts.map(c => {
    let score = 0;
    const searchFields = [
      c.firstName, c.lastName, c.company, c.email, c.phone,
      c.address || '', c.submarket || '', c.marketArea || '',
      c.propertyName || '', c.title || '', c.notes || '', c.type || '',
      (c.tags || []).join(' '),
    ].join(' ').toLowerCase();

    for (const kw of keywords) {
      if (searchFields.includes(kw)) score += 10;
    }

    // Boost for priority
    if (c.priority === 'high') score += 3;
    if (c.priority === 'medium') score += 1;

    return { contact: c, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // If we have relevant matches, return those; otherwise return a general sample
  const relevant = scored.filter(s => s.score > 0);
  if (relevant.length > 0) return relevant.slice(0, limit).map(s => s.contact);
  return scored.slice(0, limit).map(s => s.contact);
}

// Build context for AI
function buildCRMContext(question, userId) {
  const data = loadCRMData();
  const { contacts, activities, deals, reminders } = data;

  // Find relevant contacts
  const relevantContacts = findRelevantContacts(question, contacts, activities);

  // Get activity counts per contact
  const activityMap = {};
  activities.forEach(a => {
    if (!activityMap[a.contactId]) activityMap[a.contactId] = { count: 0, lastDate: '', types: new Set() };
    activityMap[a.contactId].count++;
    activityMap[a.contactId].types.add(a.type);
    if (a.date > activityMap[a.contactId].lastDate) activityMap[a.contactId].lastDate = a.date;
  });

  // Format contacts with activity info
  const contactLines = relevantContacts.map(c => {
    const act = activityMap[c.id];
    const actInfo = act ? `Activities: ${act.count} (last: ${act.lastDate}, types: ${[...act.types].join(',')})` : 'Activities: 0';
    const daysSinceContact = c.lastContactedAt
      ? Math.floor((Date.now() - new Date(c.lastContactedAt + 'T00:00:00').getTime()) / 86400000)
      : null;
    return `- ${c.firstName} ${c.lastName} | ${c.company} | ${c.type} | ${c.priority} priority | ${c.marketArea || c.submarket || 'N/A'} | Property: ${c.propertyName || 'N/A'} | ${c.email || 'no email'} | ${c.phone || 'no phone'} | Last contact: ${daysSinceContact !== null ? daysSinceContact + 'd ago' : 'never'} | ${actInfo} | Notes: ${(c.notes || '').slice(0, 100)} | ID: ${c.id}`;
  }).join('\n');

  // Summary stats
  const activeDeals = deals.filter(d => !['closed_won', 'closed_lost'].includes(d.stage));
  const pipelineValue = activeDeals.reduce((sum, d) => sum + d.dealValue, 0);
  const pendingReminders = reminders.filter(r => r.status === 'pending');
  const overdueReminders = pendingReminders.filter(r => r.dueDate < new Date().toISOString().split('T')[0]);
  const coldContacts = contacts.filter(c => {
    if (!c.lastContactedAt) return true;
    const daysSince = Math.floor((Date.now() - new Date(c.lastContactedAt + 'T00:00:00').getTime()) / 86400000);
    return daysSince > 14 && c.priority !== 'low';
  });

  // Recent activities (last 50)
  const recentActivities = activities
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 50)
    .map(a => {
      const contact = contacts.find(c => c.id === a.contactId);
      return `- ${a.date} | ${a.type} | ${a.subject} | ${contact ? contact.firstName + ' ' + contact.lastName : 'Unknown'} | ${a.owner || 'N/A'} | ${(a.description || '').slice(0, 80)}`;
    }).join('\n');

  // Deals summary
  const dealLines = activeDeals.slice(0, 30).map(d => {
    const contact = contacts.find(c => c.id === d.contactId);
    return `- ${d.name} | ${d.stage} | $${d.dealValue} | ${d.propertyAddress} | ${contact ? contact.firstName + ' ' + contact.lastName : 'Unknown'} | Last updated: ${d.updatedAt}`;
  }).join('\n');

  return `
CRM SUMMARY (as of ${new Date().toISOString().split('T')[0]}):
- Total contacts: ${contacts.length}
- Active deals: ${activeDeals.length} ($${Math.round(pipelineValue).toLocaleString()} pipeline)
- Pending follow-ups: ${pendingReminders.length} (${overdueReminders.length} overdue)
- Contacts going cold (14+ days): ${coldContacts.length}
- Total activities: ${activities.length}

RELEVANT CONTACTS (${relevantContacts.length} shown of ${contacts.length} total):
${contactLines}

ACTIVE DEALS:
${dealLines}

RECENT ACTIVITY LOG:
${recentActivities}
`.trim();
}

const AI_SYSTEM_PROMPT = `You are the AI assistant built into Carter Nicholson's CRM system. Carter is a commercial real estate broker at Kidder Mathews, specializing in industrial property leasing & sales on the Seattle Eastside (Bellevue, Kirkland, Redmond, Bothell, Woodinville, Issaquah, Snoqualmie, and north to Everett).

Your job is to help Carter work smarter with his contacts and pipeline. You have access to his CRM data and should give specific, actionable advice.

RESPONSE FORMAT:
- Be direct and concise — Carter is busy
- Reference specific contact names, companies, and locations from the data
- When recommending contacts to reach out to, explain WHY (cold contact, high priority, deal stalling, etc.)
- If mentioning specific contacts, include their contact IDs in a JSON block at the end of your response (this powers the clickable cards in the UI)
- Use **bold** for emphasis on key names and numbers
- Use bullet points for lists
- Keep responses under 300 words unless the question requires more detail

CONTACT ID FORMAT:
When you reference specific contacts, end your response with a JSON block like this:
:::CONTACTS:::["id_123", "id_456"]:::END:::

When you reference specific deals, end with:
:::DEALS:::["id_789"]:::END:::

You can include both if relevant. Only include IDs that you actually mentioned and that exist in the data provided.

CAPABILITIES:
- Analyze contact activity patterns and recommend who to contact
- Identify cold contacts, stalled deals, and opportunities
- Search contacts by location, company, type, or any field
- Provide pipeline analysis and market insights
- Draft follow-up email suggestions
- Summarize relationships with specific contacts or companies
- Give daily/weekly briefings on what needs attention

Today's date: ${new Date().toISOString().split('T')[0]}`;

// ─── EMAIL DB HELPERS ──────────────────────────────────────────────

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

// Auto-match email to contact by email address
function matchEmailToContact(emailAddr) {
  if (!emailAddr) return null;
  const data = loadCRMData();
  const normalized = emailAddr.toLowerCase().trim();
  // Try exact email match
  const contact = data.contacts.find(c =>
    c.email && c.email.toLowerCase().trim() === normalized
  );
  return contact ? contact.id : null;
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

function getUserId(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const session = getSession(token);
  return session?.userId || null;
}

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

// ─── INVITE CODE HELPERS ─────────────────────────────────────────
function generateInviteCode() {
  // Generate a human-friendly 8-char code like "KM-A3X9F2"
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/1/I to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `KM-${code}`;
}

function initInviteCodes() {
  const codes = loadJSON(INVITE_CODES_FILE, []);
  if (codes.length === 0) {
    const defaultCode = {
      code: generateInviteCode(),
      createdBy: 'user_carter',
      createdAt: new Date().toISOString(),
      role: 'broker',       // what role new signups get
      maxUses: 20,          // how many people can use this code
      usedCount: 0,
      usedBy: [],           // track who used it
      active: true,
      label: 'Kidder Mathews Team',
    };
    saveJSON(INVITE_CODES_FILE, [defaultCode]);
    console.log(`[Auth] Default team invite code created: ${defaultCode.code}`);
    return [defaultCode];
  }
  return codes;
}
initInviteCodes();

function getActiveInviteCode(code) {
  const codes = loadJSON(INVITE_CODES_FILE, []);
  const found = codes.find(c => c.code.toUpperCase() === (code || '').toUpperCase().trim());
  if (!found) return null;
  if (!found.active) return null;
  if (found.maxUses > 0 && found.usedCount >= found.maxUses) return null;
  return found;
}

function markInviteCodeUsed(code, userId, userName) {
  const codes = loadJSON(INVITE_CODES_FILE, []);
  const found = codes.find(c => c.code.toUpperCase() === code.toUpperCase().trim());
  if (found) {
    found.usedCount++;
    found.usedBy.push({ userId, name: userName, joinedAt: new Date().toISOString() });
    saveJSON(INVITE_CODES_FILE, codes);
  }
}

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
  const newUser = { id: `user_${Date.now()}`, name, email, password: hashPassword(password), role: role || 'broker' };
  users.push(newUser);
  saveJSON(USERS_FILE, users);
  res.json({ id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role });
});

// ─── SIGNUP (with invite code) ─────────────────────────────────────
app.post('/api/auth/signup', (req, res) => {
  const { name, email, password, inviteCode } = req.body;
  if (!name || !email || !password || !inviteCode) {
    return res.status(400).json({ error: 'All fields are required including team code' });
  }

  // Validate invite code
  const invite = getActiveInviteCode(inviteCode);
  if (!invite) {
    return res.status(403).json({ error: 'Invalid or expired team code' });
  }

  // Check if email already exists
  const users = loadJSON(USERS_FILE, []);
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  // Validate password strength
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  // Create user
  const newUser = {
    id: `user_${Date.now()}`,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password: hashPassword(password),
    role: invite.role || 'broker',
    joinedVia: invite.code,
    createdAt: new Date().toISOString(),
  };
  users.push(newUser);
  saveJSON(USERS_FILE, users);

  // Mark invite code as used
  markInviteCodeUsed(invite.code, newUser.id, newUser.name);

  // Auto-login
  const token = createSession(newUser.id, newUser.name, newUser.email);
  console.log(`[Auth] New user signed up: ${newUser.name} (${newUser.email}) via code ${invite.code}`);

  res.json({
    token,
    user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role },
  });
});

// ─── INVITE CODE MANAGEMENT (admin only) ──────────────────────────
app.get('/api/invite-codes', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const session = getSession(token);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  const users = loadJSON(USERS_FILE, []);
  const requester = users.find(u => u.id === session.userId);
  if (!requester || requester.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const codes = loadJSON(INVITE_CODES_FILE, []);
  res.json(codes);
});

app.post('/api/invite-codes', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const session = getSession(token);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  const users = loadJSON(USERS_FILE, []);
  const requester = users.find(u => u.id === session.userId);
  if (!requester || requester.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const { label, role, maxUses } = req.body;
  const newCode = {
    code: generateInviteCode(),
    createdBy: session.userId,
    createdAt: new Date().toISOString(),
    role: role || 'broker',
    maxUses: maxUses || 20,
    usedCount: 0,
    usedBy: [],
    active: true,
    label: label || 'Team invite',
  };

  const codes = loadJSON(INVITE_CODES_FILE, []);
  codes.push(newCode);
  saveJSON(INVITE_CODES_FILE, codes);

  console.log(`[Auth] New invite code created: ${newCode.code} by ${requester.name}`);
  res.json(newCode);
});

app.patch('/api/invite-codes/:code', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const session = getSession(token);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  const users = loadJSON(USERS_FILE, []);
  const requester = users.find(u => u.id === session.userId);
  if (!requester || requester.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const codes = loadJSON(INVITE_CODES_FILE, []);
  const found = codes.find(c => c.code === req.params.code);
  if (!found) return res.status(404).json({ error: 'Code not found' });

  if (req.body.active !== undefined) found.active = req.body.active;
  if (req.body.maxUses !== undefined) found.maxUses = req.body.maxUses;
  if (req.body.label !== undefined) found.label = req.body.label;

  saveJSON(INVITE_CODES_FILE, codes);
  res.json(found);
});

// ─── TEAM MEMBERS (admin) ──────────────────────────────────────────
app.delete('/api/auth/users/:userId', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const session = getSession(token);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  const users = loadJSON(USERS_FILE, []);
  const requester = users.find(u => u.id === session.userId);
  if (!requester || requester.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  if (req.params.userId === session.userId) {
    return res.status(400).json({ error: 'Cannot remove yourself' });
  }

  const updated = users.filter(u => u.id !== req.params.userId);
  if (updated.length === users.length) return res.status(404).json({ error: 'User not found' });
  saveJSON(USERS_FILE, updated);
  res.json({ success: true });
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

// ─── AI ROUTES ──────────────────────────────────────────────────────

// Main AI chat endpoint
app.post('/api/ai/chat', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  if (!aiReady) {
    return res.status(503).json({ error: 'AI not configured. Add ANTHROPIC_API_KEY to Railway variables.' });
  }

  const { message, conversationHistory } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });

  try {
    const context = buildCRMContext(message, userId);

    // Get recent emails for context
    const emails = await getEmails(userId);
    const recentEmailSummary = emails.slice(0, 20).map(e =>
      `- ${e.date} | ${e.isInbound ? 'IN' : 'OUT'} | ${e.from} → ${e.to} | ${e.subject}`
    ).join('\n');

    const messages = [];

    // Include conversation history (last 10 messages for context)
    if (conversationHistory && Array.isArray(conversationHistory)) {
      conversationHistory.slice(-10).forEach(msg => {
        messages.push({ role: msg.role, content: msg.content });
      });
    }

    // Add current message with CRM context
    messages.push({
      role: 'user',
      content: `Here is my current CRM data:\n\n${context}\n\nRECENT EMAILS:\n${recentEmailSummary || 'No emails yet'}\n\nMy question: ${message}`
    });

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: AI_SYSTEM_PROMPT,
      messages,
    });

    const aiText = response.content[0].text;

    // Parse out contact IDs and deal IDs
    let contactIds = [];
    let dealIds = [];
    let cleanText = aiText;

    const contactMatch = aiText.match(/:::CONTACTS:::\[(.*?)\]:::END:::/);
    if (contactMatch) {
      try { contactIds = JSON.parse(`[${contactMatch[1]}]`); } catch {}
      cleanText = cleanText.replace(/:::CONTACTS:::.*?:::END:::/, '').trim();
    }

    const dealMatch = aiText.match(/:::DEALS:::\[(.*?)\]:::END:::/);
    if (dealMatch) {
      try { dealIds = JSON.parse(`[${dealMatch[1]}]`); } catch {}
      cleanText = cleanText.replace(/:::DEALS:::.*?:::END:::/, '').trim();
    }

    res.json({
      message: cleanText,
      contactIds,
      dealIds,
    });
  } catch (err) {
    console.error('[AI] Chat error:', err.message);
    res.status(500).json({ error: 'AI request failed. Please try again.' });
  }
});

// Contact insights endpoint
app.post('/api/ai/contact-insights', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  if (!aiReady) return res.status(503).json({ error: 'AI not configured' });

  const { contactId } = req.body;
  if (!contactId) return res.status(400).json({ error: 'contactId required' });

  try {
    const data = loadCRMData();
    const contact = data.contacts.find(c => c.id === contactId);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const contactActivities = data.activities
      .filter(a => a.contactId === contactId)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 20);

    const contactDeals = data.deals.filter(d => d.contactId === contactId);

    const emails = await getEmails(userId);
    const contactEmails = emails.filter(e => e.contactId === contactId).slice(0, 10);

    const daysSinceContact = contact.lastContactedAt
      ? Math.floor((Date.now() - new Date(contact.lastContactedAt + 'T00:00:00').getTime()) / 86400000)
      : null;

    const contactContext = `
Contact: ${contact.firstName} ${contact.lastName}
Company: ${contact.company} | Title: ${contact.title}
Type: ${contact.type} | Priority: ${contact.priority}
Market Area: ${contact.marketArea || 'N/A'} | Submarket: ${contact.submarket || 'N/A'}
Property: ${contact.propertyName || 'N/A'} | Address: ${contact.address || 'N/A'}
Email: ${contact.email} | Phone: ${contact.phone}
Last Contacted: ${daysSinceContact !== null ? daysSinceContact + ' days ago' : 'Never'}
Notes: ${contact.notes || 'None'}

Activity History (${contactActivities.length} total):
${contactActivities.map(a => `- ${a.date} | ${a.type} | ${a.subject} | ${a.owner || 'N/A'} | ${(a.description || '').slice(0, 80)}`).join('\n') || 'No activities'}

Deals:
${contactDeals.map(d => `- ${d.name} | ${d.stage} | $${d.dealValue} | ${d.propertyAddress}`).join('\n') || 'No deals'}

Email History:
${contactEmails.map(e => `- ${e.date} | ${e.isInbound ? 'IN' : 'OUT'} | ${e.subject}`).join('\n') || 'No emails'}
`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: `You are Carter's CRM AI assistant. Generate a brief insight card for this contact. Include:
1. Relationship health (Hot/Warm/Cold/Dead) with a 1-line reason
2. Recommended next action (be specific — call, email, tour, etc.)
3. One key observation about the relationship or opportunity

Keep it to 3-4 lines total. Be direct and actionable. Today is ${new Date().toISOString().split('T')[0]}.`,
      messages: [{ role: 'user', content: contactContext }],
    });

    res.json({ insight: response.content[0].text });
  } catch (err) {
    console.error('[AI] Contact insight error:', err.message);
    res.status(500).json({ error: 'Failed to generate insight' });
  }
});

// Dashboard briefing endpoint
app.post('/api/ai/briefing', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  if (!aiReady) return res.status(503).json({ error: 'AI not configured' });

  try {
    const data = loadCRMData();
    const { contacts, activities, deals, reminders } = data;

    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

    // Gather key metrics
    const activeDeals = deals.filter(d => !['closed_won', 'closed_lost'].includes(d.stage));
    const pipelineValue = activeDeals.reduce((sum, d) => sum + d.dealValue, 0);
    const pendingReminders = reminders.filter(r => r.status === 'pending');
    const overdueReminders = pendingReminders.filter(r => r.dueDate < today);
    const todayReminders = pendingReminders.filter(r => r.dueDate === today);
    const recentActivities = activities.filter(a => a.date >= weekAgo);

    const coldContacts = contacts.filter(c => {
      if (!c.lastContactedAt) return c.priority !== 'low';
      const daysSince = Math.floor((Date.now() - new Date(c.lastContactedAt + 'T00:00:00').getTime()) / 86400000);
      return daysSince > 14 && c.priority !== 'low';
    }).sort((a, b) => {
      const aPri = a.priority === 'high' ? 0 : a.priority === 'medium' ? 1 : 2;
      const bPri = b.priority === 'high' ? 0 : b.priority === 'medium' ? 1 : 2;
      return aPri - bPri;
    });

    const stalledDeals = activeDeals.filter(d => {
      const daysSince = Math.floor((Date.now() - new Date(d.updatedAt + 'T00:00:00').getTime()) / 86400000);
      return daysSince > 10;
    });

    const emails = await getEmails(userId);

    const briefingContext = `
Today: ${today}
Active deals: ${activeDeals.length} ($${Math.round(pipelineValue).toLocaleString()} pipeline)
Activities this week: ${recentActivities.length}
Pending follow-ups: ${pendingReminders.length} (${overdueReminders.length} overdue, ${todayReminders.length} due today)
Stalled deals (10+ days): ${stalledDeals.length}
Cold contacts (14+ days, non-low priority): ${coldContacts.length}
Emails this week: ${emails.filter(e => e.date >= weekAgo).length}

Top 5 cold HIGH-PRIORITY contacts:
${coldContacts.filter(c => c.priority === 'high').slice(0, 5).map(c => {
  const days = c.lastContactedAt ? Math.floor((Date.now() - new Date(c.lastContactedAt + 'T00:00:00').getTime()) / 86400000) : 999;
  return `- ${c.firstName} ${c.lastName} (${c.company}) — ${days}d since contact | ${c.type} | ${c.marketArea || 'N/A'}`;
}).join('\n') || 'None'}

Stalled deals:
${stalledDeals.slice(0, 5).map(d => {
  const contact = contacts.find(c => c.id === d.contactId);
  const days = Math.floor((Date.now() - new Date(d.updatedAt + 'T00:00:00').getTime()) / 86400000);
  return `- ${d.name} (${d.stage}) — $${d.dealValue} — ${days}d stalled | ${contact ? contact.firstName + ' ' + contact.lastName : 'Unknown'}`;
}).join('\n') || 'None'}

Overdue follow-ups:
${overdueReminders.slice(0, 5).map(r => {
  const contact = contacts.find(c => c.id === r.contactId);
  return `- ${r.title} — Due: ${r.dueDate} | ${contact ? contact.firstName + ' ' + contact.lastName : 'Unknown'}`;
}).join('\n') || 'None'}
`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: `You are Carter's CRM AI assistant. Generate a concise daily briefing for a commercial real estate broker. Be direct and actionable. Format with bullet points and **bold** key names/numbers. Focus on what Carter should DO today. Keep it under 200 words. Today is ${today}.`,
      messages: [{ role: 'user', content: `Generate my daily briefing based on this CRM data:\n\n${briefingContext}` }],
    });

    res.json({ briefing: response.content[0].text });
  } catch (err) {
    console.error('[AI] Briefing error:', err.message);
    res.status(500).json({ error: 'Failed to generate briefing' });
  }
});

// ─── MAP / PROPERTIES ROUTES ─────────────────────────────────────

// Build grouped properties from CRM data
function buildProperties() {
  const data = loadCRMData();
  const { contacts } = data;
  const properties = {};

  contacts.forEach(c => {
    const key = c.propertyName || c.address || null;
    if (!key) return;
    if (!properties[key]) {
      properties[key] = {
        name: c.propertyName || '',
        address: c.address || '',
        submarket: c.submarket || c.marketArea || '',
        landlords: [],
        tenants: [],
        buyers: [],
      };
    }
    const entry = {
      id: c.id,
      name: `${c.firstName} ${c.lastName}`.trim(),
      company: c.company,
      phone: c.phone,
      email: c.email,
      priority: c.priority,
    };
    if (c.type === 'landlord') properties[key].landlords.push(entry);
    else if (c.type === 'buyer') properties[key].buyers.push(entry);
    else properties[key].tenants.push(entry);
  });

  return properties;
}

// Geocode a single address using Nominatim (free OSM geocoder)
async function geocodeAddress(address) {
  if (!address) return null;

  const addressKey = address.toLowerCase().trim();

  // Check DB cache first
  if (dbReady) {
    try {
      const cached = await pool.query('SELECT lat, lng FROM geocode_cache WHERE address_key = $1', [addressKey]);
      if (cached.rows.length > 0) return { lat: cached.rows[0].lat, lng: cached.rows[0].lng };
    } catch {}
  }

  // Call Nominatim API
  try {
    const encoded = encodeURIComponent(address);
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encoded}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'EastsideCRM/1.0 (carter.nicholson@kidder.com)' }
    });
    const results = await response.json();

    if (results && results.length > 0) {
      const { lat, lon } = results[0];
      const coords = { lat: parseFloat(lat), lng: parseFloat(lon) };

      // Cache in DB
      if (dbReady) {
        try {
          await pool.query(
            'INSERT INTO geocode_cache (address_key, lat, lng, display_name) VALUES ($1, $2, $3, $4) ON CONFLICT (address_key) DO NOTHING',
            [addressKey, coords.lat, coords.lng, results[0].display_name || '']
          );
        } catch {}
      }

      return coords;
    }
  } catch (err) {
    console.error('[Geocode] Error:', err.message);
  }

  return null;
}

// Get all properties with geocoded coordinates
// Load dot map ownership data (from Dot Maps landlord spreadsheets)
let dotMapOwners = {};
try {
  dotMapOwners = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'dot-map-owners.json'), 'utf-8'));
  console.log(`[Map] Loaded dot map ownership data: ${Object.keys(dotMapOwners).length} properties`);
} catch (err) {
  console.log('[Map] No dot-map-owners.json found, skipping ownership enrichment');
}

app.get('/api/map/properties', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const properties = buildProperties();
  const propertyList = Object.entries(properties).map(([key, prop]) => ({
    key,
    ...prop,
    totalContacts: prop.landlords.length + prop.tenants.length + prop.buyers.length,
  }));

  // Get cached geocode data if available
  let geocodeMap = {};
  if (dbReady) {
    try {
      const cached = await pool.query('SELECT address_key, lat, lng FROM geocode_cache');
      cached.rows.forEach(r => { geocodeMap[r.address_key] = { lat: r.lat, lng: r.lng }; });
    } catch {}
  }

  // Attach coordinates and dot map ownership to properties
  const result = propertyList.map(p => {
    const addrKey = (p.address || '').toLowerCase().trim();
    const coords = geocodeMap[addrKey] || null;
    const nameKey = (p.name || '').toLowerCase().trim();
    const dotMapOwnerData = dotMapOwners[nameKey] || [];
    return {
      ...p,
      lat: coords?.lat || null,
      lng: coords?.lng || null,
      dotMapOwners: dotMapOwnerData,
    };
  });

  res.json({
    properties: result,
    totalProperties: result.length,
    geocoded: result.filter(p => p.lat !== null).length,
    notGeocoded: result.filter(p => p.lat === null).length,
  });
});

// Batch geocode properties (runs in background, returns immediately)
let geocodingInProgress = false;
app.post('/api/map/geocode', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  if (geocodingInProgress) {
    return res.json({ status: 'already_running', message: 'Geocoding is already in progress' });
  }

  geocodingInProgress = true;
  res.json({ status: 'started', message: 'Geocoding started in background' });

  // Run geocoding in background
  const properties = buildProperties();
  const addresses = [...new Set(Object.values(properties).map(p => p.address).filter(Boolean))];

  let geocoded = 0, skipped = 0, failed = 0;
  console.log(`[Geocode] Starting batch geocode of ${addresses.length} addresses`);

  for (const address of addresses) {
    const addrKey = address.toLowerCase().trim();

    // Check if already cached
    if (dbReady) {
      try {
        const cached = await pool.query('SELECT 1 FROM geocode_cache WHERE address_key = $1', [addrKey]);
        if (cached.rows.length > 0) { skipped++; continue; }
      } catch {}
    }

    const coords = await geocodeAddress(address);
    if (coords) {
      geocoded++;
    } else {
      failed++;
    }

    // Nominatim rate limit: 1 request per second
    await new Promise(r => setTimeout(r, 1100));

    if ((geocoded + failed) % 50 === 0) {
      console.log(`[Geocode] Progress: ${geocoded} geocoded, ${failed} failed, ${skipped} skipped of ${addresses.length}`);
    }
  }

  console.log(`[Geocode] Complete: ${geocoded} geocoded, ${failed} failed, ${skipped} already cached`);
  geocodingInProgress = false;
});

// Get geocoding status
app.get('/api/map/geocode-status', async (req, res) => {
  let cachedCount = 0;
  if (dbReady) {
    try {
      const result = await pool.query('SELECT COUNT(*) FROM geocode_cache');
      cachedCount = parseInt(result.rows[0].count, 10);
    } catch {}
  }
  const properties = buildProperties();
  const totalAddresses = new Set(Object.values(properties).map(p => p.address).filter(Boolean)).size;

  res.json({
    inProgress: geocodingInProgress,
    cached: cachedCount,
    total: totalAddresses,
    percent: totalAddresses > 0 ? Math.round((cachedCount / totalAddresses) * 100) : 0,
  });
});

// Update pin position (drag-to-reposition)
app.post('/api/map/update-pin', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const { addressKey, lat, lng } = req.body;
  if (!addressKey || lat == null || lng == null) {
    return res.status(400).json({ error: 'addressKey, lat, and lng required' });
  }

  if (!dbReady) {
    return res.status(500).json({ error: 'Database not available' });
  }

  try {
    await pool.query(
      `INSERT INTO geocode_cache (address_key, lat, lng) VALUES ($1, $2, $3)
       ON CONFLICT (address_key) DO UPDATE SET lat = $2, lng = $3`,
      [addressKey, parseFloat(lat), parseFloat(lng)]
    );
    res.json({ status: 'ok', message: 'Pin position updated' });
  } catch (err) {
    console.error('[Map] Failed to update pin position:', err);
    res.status(500).json({ error: 'Failed to save position' });
  }
});

// ─── EMAIL ROUTES (user-scoped, now using PostgreSQL) ────────────

app.get('/api/health', async (req, res) => {
  const count = await getEmailCount();
  res.json({ status: 'ok', emails: count, db: dbReady ? 'postgres' : 'json', ai: aiReady });
});

app.get('/api/emails', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.json([]);
  const emails = await getEmails(userId);
  res.json(emails);
});

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

// Power Automate webhook — with auto contact matching
app.post('/api/emails/inbound', async (req, res) => {
  const data = req.body;

  const fromAddr = data.from || data.From || data.sender || '';
  const toAddr = data.to || data.To || data.toRecipients || '';
  const isInbound = data.isInbound !== undefined ? data.isInbound : true;

  // Auto-match email to a contact
  const matchAddr = isInbound ? fromAddr : toAddr;
  const autoContactId = matchEmailToContact(matchAddr);

  const email = {
    id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId: 'user_carter',
    from: fromAddr,
    to: toAddr,
    subject: data.subject || data.Subject || '(no subject)',
    body: stripHtml(data.body || data.Body || data.bodyPreview || ''),
    date: parseEmailDate(data.receivedDateTime || data.DateTimeReceived || data.date),
    contactId: autoContactId,
    dealId: null,
    isInbound,
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
  const matched = autoContactId ? ` [Matched to contact]` : '';
  console.log(`[Email ${direction}] ${email.isInbound ? 'From' : 'To'}: ${email.isInbound ? email.from : email.to} | Subject: ${email.subject}${matched}`);
  res.json({ success: true, id: email.id, contactId: autoContactId });
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
  initAI();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Eastside CRM server running on port ${PORT}`);
    console.log(`Email storage: ${dbReady ? 'PostgreSQL' : 'JSON file (ephemeral)'}`);
    console.log(`AI: ${aiReady ? 'Claude Haiku ready' : 'Not configured'}`);
    console.log(`Email webhook: POST /api/emails/inbound`);
  });
}

start();
