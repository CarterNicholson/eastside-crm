import express from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Store emails in a JSON file for persistence across requests
const EMAILS_FILE = join(__dirname, 'data', 'emails.json');

// Ensure data directory exists
import { mkdirSync } from 'fs';
try { mkdirSync(join(__dirname, 'data'), { recursive: true }); } catch {}

function loadEmails() {
  try {
    if (existsSync(EMAILS_FILE)) {
      return JSON.parse(readFileSync(EMAILS_FILE, 'utf-8'));
    }
  } catch {}
  return [];
}

function saveEmails(emails) {
  try {
    writeFileSync(EMAILS_FILE, JSON.stringify(emails, null, 2));
  } catch (e) {
    console.error('Failed to save emails:', e);
  }
}

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── API ROUTES ───────────────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', emails: loadEmails().length });
});

// Get all emails
app.get('/api/emails', (req, res) => {
  res.json(loadEmails());
});

// Manually log an email
app.post('/api/emails', (req, res) => {
  const { from, to, subject, body, contactId, dealId, isInbound } = req.body;

  const email = {
    id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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

  const emails = loadEmails();
  emails.unshift(email);
  saveEmails(emails);

  res.json({ success: true, email });
});

// ─── POWER AUTOMATE WEBHOOK ──────────────────────────────────────────
// This endpoint receives emails forwarded from Outlook via Power Automate
app.post('/api/emails/inbound', (req, res) => {
  const data = req.body;

  // Power Automate sends different formats depending on the trigger
  // We handle the common "When a new email arrives" trigger format
  const email = {
    id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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

  // Try to auto-match contact by email address
  // (Frontend will handle the matching since it has the contact list)

  const emails = loadEmails();
  emails.unshift(email);
  saveEmails(emails);

  console.log(`[Email Received] From: ${email.from} | Subject: ${email.subject}`);

  res.json({ success: true, id: email.id });
});

// Delete an email
app.delete('/api/emails/:id', (req, res) => {
  const emails = loadEmails().filter(e => e.id !== req.params.id);
  saveEmails(emails);
  res.json({ success: true });
});

// Mark email as read
app.patch('/api/emails/:id/read', (req, res) => {
  const emails = loadEmails().map(e =>
    e.id === req.params.id ? { ...e, isRead: true } : e
  );
  saveEmails(emails);
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
  try {
    return new Date(dateStr).toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

// ─── SERVE FRONTEND ──────────────────────────────────────────────────
app.use(express.static(join(__dirname, 'dist')));

// SPA fallback — serve index.html for all non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(join(__dirname, 'dist', 'index.html'));
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Eastside CRM server running on port ${PORT}`);
  console.log(`Email webhook: POST /api/emails/inbound`);
});
