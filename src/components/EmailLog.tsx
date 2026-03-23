import { useState, useMemo } from 'react';
import { Search, Mail, ArrowDownLeft, ArrowUpRight, Plus, Info, Settings, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Store } from '../store';

interface EmailLogProps {
  store: Store;
}

export function EmailLog({ store }: EmailLogProps) {
  const { emails, contacts, addEmail, getContact } = store;
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'inbound' | 'outbound'>('all');
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [showSetup, setShowSetup] = useState(false);

  const filtered = useMemo(() => {
    return emails.filter(e => {
      const matchSearch = search === '' || `${e.subject} ${e.from} ${e.to} ${e.body}`.toLowerCase().includes(search.toLowerCase());
      const matchFilter = filter === 'all' || (filter === 'inbound' ? e.isInbound : !e.isInbound);
      return matchSearch && matchFilter;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [emails, search, filter]);

  const selected = emails.find(e => e.id === selectedEmail);

  return (
    <div className="flex h-full">
      {/* Email List */}
      <div className={`${selected ? 'w-[400px]' : 'flex-1 max-w-[800px]'} flex flex-col border-r border-border`}>
        <div className="p-4 space-y-3 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Email Log</h2>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowSetup(true)} className="gap-1.5 text-xs">
                <Settings size={13} /> Setup
              </Button>
              <Button size="sm" onClick={() => setShowCompose(true)} className="gap-1.5 bg-[hsl(215,65%,45%)] hover:bg-[hsl(215,65%,40%)]">
                <Plus size={14} /> Log Email
              </Button>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input placeholder="Search emails..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
            </div>
            <div className="flex gap-1 bg-muted rounded-md p-0.5">
              {(['all', 'inbound', 'outbound'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)} className={`text-xs px-2.5 py-1 rounded capitalize ${filter === f ? 'bg-white shadow-sm font-medium' : 'text-muted-foreground'}`}>{f}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map(email => {
            const contact = email.contactId ? getContact(email.contactId) : null;
            return (
              <button
                key={email.id}
                onClick={() => setSelectedEmail(email.id)}
                className={`w-full text-left p-3 border-b border-border hover:bg-muted/50 transition-colors ${
                  selectedEmail === email.id ? 'bg-[hsl(215,65%,45%)]/5' : ''
                } ${!email.isRead && email.isInbound ? 'bg-blue-50/30' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    email.isInbound ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {email.isInbound ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm truncate ${!email.isRead && email.isInbound ? 'font-semibold' : 'font-medium'}`}>{email.subject}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {email.isInbound ? `From: ${contact ? `${contact.firstName} ${contact.lastName}` : email.from}` : `To: ${contact ? `${contact.firstName} ${contact.lastName}` : email.to}`}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{email.body}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">{formatDate(email.date)}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Email Detail */}
      {selected && (
        <div className="flex-1 overflow-y-auto p-5">
          <div className="max-w-[600px] space-y-4">
            <div className="flex items-center gap-2">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center ${
                selected.isInbound ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
              }`}>
                {selected.isInbound ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}
              </span>
              <Badge variant={selected.isInbound ? 'default' : 'secondary'} className="text-[10px]">
                {selected.isInbound ? 'Received' : 'Sent'}
              </Badge>
            </div>
            <h3 className="text-lg font-semibold">{selected.subject}</h3>
            <div className="text-sm text-muted-foreground space-y-1">
              <div>From: <span className="text-foreground">{selected.from}</span></div>
              <div>To: <span className="text-foreground">{selected.to}</span></div>
              <div>Date: <span className="text-foreground">{new Date(selected.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span></div>
            </div>
            <div className="border-t border-border pt-4">
              <div className="text-sm leading-relaxed whitespace-pre-wrap">{selected.body}</div>
            </div>
          </div>
        </div>
      )}

      {/* Log Email Dialog */}
      <ComposeDialog open={showCompose} onOpenChange={setShowCompose} store={store} onSave={(data) => { addEmail(data); setShowCompose(false); }} />

      {/* Setup Dialog */}
      <Dialog open={showSetup} onOpenChange={setShowSetup}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Email Integration Setup</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Info size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-800">
                  <div className="font-medium mb-1">Outlook Auto-Forward Setup</div>
                  <p className="leading-relaxed">Since your Outlook has security restrictions, set up an auto-forward rule to send copies of relevant emails to this CRM. Here's how:</p>
                </div>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-[hsl(215,65%,45%)] text-white flex items-center justify-center text-xs flex-shrink-0">1</span>
                <div>
                  <div className="font-medium">Create an Outlook Rule</div>
                  <div className="text-muted-foreground">Go to File → Manage Rules → New Rule → "Apply rule on messages I receive"</div>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-[hsl(215,65%,45%)] text-white flex items-center justify-center text-xs flex-shrink-0">2</span>
                <div>
                  <div className="font-medium">Set Conditions</div>
                  <div className="text-muted-foreground">Filter by sender domain, subject keywords, or "sent to" your work email</div>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-[hsl(215,65%,45%)] text-white flex items-center justify-center text-xs flex-shrink-0">3</span>
                <div>
                  <div className="font-medium">Forward to CRM Inbox</div>
                  <div className="text-muted-foreground">Set the action to forward a copy to: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">crm-intake@your-domain.com</code></div>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-[hsl(215,65%,45%)] text-white flex items-center justify-center text-xs flex-shrink-0">4</span>
                <div>
                  <div className="font-medium">Alternative: BCC Method</div>
                  <div className="text-muted-foreground">BCC the CRM email on outbound messages to automatically log sent emails</div>
                </div>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              <strong>Tip:</strong> For now, you can manually log emails using the "Log Email" button. When connected to Claude, it can help auto-categorize and link emails to contacts/deals.
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ComposeDialog({ open, onOpenChange, store, onSave }: {
  open: boolean; onOpenChange: (open: boolean) => void; store: Store; onSave: (data: any) => void;
}) {
  const [form, setForm] = useState({
    from: '', to: '', subject: '', body: '', date: new Date().toISOString().split('T')[0],
    contactId: undefined as string | undefined, dealId: undefined as string | undefined,
    isInbound: true, isRead: true,
  });

  const handleContactSelect = (contactId: string) => {
    const contact = store.getContact(contactId);
    if (contact) {
      setForm({
        ...form,
        contactId,
        from: form.isInbound ? contact.email : 'carter122886@gmail.com',
        to: form.isInbound ? 'carter122886@gmail.com' : contact.email,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Log Email</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <button onClick={() => setForm({ ...form, isInbound: true })} className={`text-xs px-3 py-1.5 rounded-md ${form.isInbound ? 'bg-blue-100 text-blue-700 font-medium' : 'bg-muted text-muted-foreground'}`}>Received</button>
            <button onClick={() => setForm({ ...form, isInbound: false })} className={`text-xs px-3 py-1.5 rounded-md ${!form.isInbound ? 'bg-gray-200 text-gray-700 font-medium' : 'bg-muted text-muted-foreground'}`}>Sent</button>
          </div>
          <div>
            <Label className="text-xs">Link to Contact</Label>
            <Select value={form.contactId || ''} onValueChange={handleContactSelect}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select contact (optional)" /></SelectTrigger>
              <SelectContent>{store.contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName} — {c.company}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">From</Label><Input value={form.from} onChange={e => setForm({ ...form, from: e.target.value })} className="mt-1" /></div>
            <div><Label className="text-xs">To</Label><Input value={form.to} onChange={e => setForm({ ...form, to: e.target.value })} className="mt-1" /></div>
          </div>
          <div><Label className="text-xs">Subject *</Label><Input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} className="mt-1" /></div>
          <div><Label className="text-xs">Body</Label><Textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} className="mt-1" rows={4} /></div>
          <div><Label className="text-xs">Date</Label><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="mt-1" /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => { if (form.subject) onSave(form); }} className="bg-[hsl(215,65%,45%)] hover:bg-[hsl(215,65%,40%)]">Log Email</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
