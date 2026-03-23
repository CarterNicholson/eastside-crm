import { useState, useMemo, useEffect } from 'react';
import { Search, Plus, Phone, Mail, Building2, MapPin, ChevronRight, Filter, X, Edit2, Trash2, ArrowUpDown, SlidersHorizontal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Store } from '../store';
import type { Contact, ContactType, Priority } from '../types';
import { CONTACT_TYPES } from '../types';

type SortOption = 'priority' | 'name_asc' | 'name_desc' | 'company' | 'last_contacted' | 'newest';

interface ContactsProps {
  store: Store;
  focusContactId?: string | null;
  onFocusHandled?: () => void;
}

export function Contacts({ store, focusContactId, onFocusHandled }: ContactsProps) {
  const { contacts, addContact, updateContact, deleteContact, getContactDeals, getContactActivities, getContactReminders } = store;
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<ContactType | 'all'>('all');
  const [submarketFilter, setSubmarketFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('priority');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);

  // Auto-select contact when navigated from follow-ups
  useEffect(() => {
    if (focusContactId) {
      const contact = contacts.find(c => c.id === focusContactId);
      if (contact) {
        setSelectedContact(contact);
        setSearch(''); // Clear search so they can see the contact
        setTypeFilter('all');
        setSubmarketFilter('all');
      }
      onFocusHandled?.();
    }
  }, [focusContactId, contacts, onFocusHandled]);

  // Extract unique submarkets for filter dropdown
  const submarkets = useMemo(() => {
    const subs = new Set<string>();
    contacts.forEach(c => { if (c.submarket) subs.add(c.submarket); if (c.marketArea) subs.add(c.marketArea); });
    return Array.from(subs).sort();
  }, [contacts]);

  const filtered = useMemo(() => {
    return contacts.filter(c => {
      const searchLower = search.toLowerCase();
      const matchSearch = search === '' || [
        c.firstName, c.lastName, c.company, c.email, c.phone,
        c.address || '', c.submarket || '', c.marketArea, c.propertyName || '',
        c.title, c.notes,
      ].some(field => field.toLowerCase().includes(searchLower));
      const matchType = typeFilter === 'all' || c.type === typeFilter;
      const matchSubmarket = submarketFilter === 'all' || c.submarket === submarketFilter || c.marketArea === submarketFilter;
      return matchSearch && matchType && matchSubmarket;
    }).sort((a, b) => {
      switch (sortBy) {
        case 'name_asc': return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
        case 'name_desc': return `${b.lastName} ${b.firstName}`.localeCompare(`${a.lastName} ${a.firstName}`);
        case 'company': return (a.company || '').localeCompare(b.company || '');
        case 'last_contacted': {
          const aDate = a.lastContactedAt || '1900-01-01';
          const bDate = b.lastContactedAt || '1900-01-01';
          return bDate.localeCompare(aDate);
        }
        case 'newest': return b.createdAt.localeCompare(a.createdAt);
        default: {
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
      }
    });
  }, [contacts, search, typeFilter, submarketFilter, sortBy]);

  return (
    <div className="flex h-full">
      {/* Contact List */}
      <div className={`${selectedContact ? 'w-[380px]' : 'flex-1 max-w-[900px]'} flex flex-col border-r border-border`}>
        <div className="p-4 space-y-3 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Contacts</h2>
            <Button size="sm" onClick={() => setShowAddDialog(true)} className="gap-1.5 bg-[hsl(215,65%,45%)] hover:bg-[hsl(215,65%,40%)]">
              <Plus size={14} /> Add Contact
            </Button>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input placeholder="Search name, company, address, submarket..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
            </div>
            <Button size="sm" variant={showFilters ? 'default' : 'outline'} onClick={() => setShowFilters(!showFilters)} className="h-9 gap-1.5">
              <SlidersHorizontal size={13} /> Filters
            </Button>
          </div>
          {/* Advanced Filters */}
          {showFilters && (
            <div className="flex gap-2 flex-wrap">
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
                <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {CONTACT_TYPES.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={submarketFilter} onValueChange={setSubmarketFilter}>
                <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Submarket" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Submarkets</SelectItem>
                  {submarkets.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="priority">Sort: Priority</SelectItem>
                  <SelectItem value="name_asc">Sort: Name (A-Z)</SelectItem>
                  <SelectItem value="name_desc">Sort: Name (Z-A)</SelectItem>
                  <SelectItem value="company">Sort: Company</SelectItem>
                  <SelectItem value="last_contacted">Sort: Last Contacted</SelectItem>
                  <SelectItem value="newest">Sort: Newest First</SelectItem>
                </SelectContent>
              </Select>
              {(typeFilter !== 'all' || submarketFilter !== 'all') && (
                <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={() => { setTypeFilter('all'); setSubmarketFilter('all'); }}>
                  <X size={12} className="mr-1" /> Clear filters
                </Button>
              )}
            </div>
          )}
          <div className="text-xs text-muted-foreground">{filtered.length} contacts</div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map(contact => (
            <button
              key={contact.id}
              onClick={() => setSelectedContact(contact)}
              className={`w-full text-left p-3 border-b border-border hover:bg-muted/50 transition-colors ${
                selectedContact?.id === contact.id ? 'bg-[hsl(215,65%,45%)]/5 border-l-2 border-l-[hsl(215,65%,45%)]' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0 ${
                  contact.priority === 'high' ? 'bg-blue-100 text-blue-700' :
                  contact.priority === 'medium' ? 'bg-gray-100 text-gray-600' :
                  'bg-gray-50 text-gray-400'
                }`}>
                  {contact.firstName[0]}{contact.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{contact.firstName} {contact.lastName}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      contact.type === 'tenant' ? 'bg-blue-100 text-blue-700' :
                      contact.type === 'buyer' ? 'bg-green-100 text-green-700' :
                      contact.type === 'landlord' ? 'bg-purple-100 text-purple-700' :
                      contact.type === 'prospect' ? 'bg-amber-100 text-amber-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{contact.type}</span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{contact.company} — {contact.title}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <MapPin size={10} />{contact.marketArea}
                    </span>
                    {contact.lastContactedAt && (
                      <span className="text-[10px] text-muted-foreground">
                        Last: {formatDate(contact.lastContactedAt)}
                      </span>
                    )}
                  </div>
                </div>
                {contact.priority === 'high' && <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-2 flex-shrink-0" />}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Contact Detail */}
      {selectedContact && (
        <ContactDetail
          contact={selectedContact}
          store={store}
          onClose={() => setSelectedContact(null)}
          onEdit={() => setShowEditDialog(true)}
        />
      )}

      {/* Add Dialog */}
      <ContactFormDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSave={(data) => { addContact(data); setShowAddDialog(false); }}
        title="Add Contact"
      />

      {/* Edit Dialog */}
      {selectedContact && (
        <ContactFormDialog
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          onSave={(data) => { updateContact(selectedContact.id, data); setShowEditDialog(false); setSelectedContact({ ...selectedContact, ...data }); }}
          title="Edit Contact"
          initialData={selectedContact}
        />
      )}
    </div>
  );
}

function ContactDetail({ contact, store, onClose, onEdit }: {
  contact: Contact; store: Store; onClose: () => void; onEdit: () => void;
}) {
  const deals = store.getContactDeals(contact.id);
  const activities = store.getContactActivities(contact.id);
  const reminders = store.getContactReminders(contact.id);
  const emails = store.getContactEmails(contact.id);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-5 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{contact.firstName} {contact.lastName}</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                contact.type === 'tenant' ? 'bg-blue-100 text-blue-700' :
                contact.type === 'buyer' ? 'bg-green-100 text-green-700' :
                contact.type === 'landlord' ? 'bg-purple-100 text-purple-700' :
                contact.type === 'prospect' ? 'bg-amber-100 text-amber-700' :
                'bg-gray-100 text-gray-600'
              }`}>{contact.type}</span>
            </div>
            <div className="text-sm text-muted-foreground">{contact.title} at {contact.company}</div>
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" onClick={onEdit} className="gap-1 text-xs"><Edit2 size={12} /> Edit</Button>
            <Button size="sm" variant="ghost" onClick={onClose}><X size={14} /></Button>
          </div>
        </div>

        {/* Contact Info */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground"><Mail size={13} /> <a href={`mailto:${contact.email}`} className="text-[hsl(215,65%,45%)] hover:underline">{contact.email}</a></div>
          <div className="flex items-center gap-2 text-muted-foreground"><Phone size={13} /> {contact.phone}</div>
          <div className="flex items-center gap-2 text-muted-foreground"><Building2 size={13} /> {contact.company}</div>
          <div className="flex items-center gap-2 text-muted-foreground"><MapPin size={13} /> {contact.marketArea}</div>
        </div>

        {/* Tags */}
        {contact.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {contact.tags.map(tag => <Badge key={tag} variant="secondary" className="text-[11px]">{tag}</Badge>)}
          </div>
        )}

        {/* Notes */}
        {contact.notes && (
          <Card>
            <CardContent className="py-3 px-4">
              <div className="text-xs font-medium text-muted-foreground mb-1">Notes</div>
              <div className="text-sm text-foreground leading-relaxed">{contact.notes}</div>
            </CardContent>
          </Card>
        )}

        {/* Pending Reminders */}
        {reminders.length > 0 && (
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pending Follow-Ups</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 px-4 pb-3 space-y-2">
              {reminders.map(r => (
                <div key={r.id} className={`p-2 rounded text-sm ${r.dueDate < new Date().toISOString().split('T')[0] ? 'bg-red-50' : 'bg-amber-50'}`}>
                  <div className="font-medium">{r.title}</div>
                  <div className="text-xs text-muted-foreground">Due: {formatDate(r.dueDate)}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Deals */}
        {deals.length > 0 && (
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Deals ({deals.length})</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 px-4 pb-3 space-y-2">
              {deals.map(d => (
                <div key={d.id} className="flex items-center gap-3 p-2 rounded bg-muted/50">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{d.name}</div>
                    <div className="text-xs text-muted-foreground">{d.propertyAddress}</div>
                  </div>
                  <span className="text-xs font-medium">${formatValue(d.dealValue)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Activity Timeline */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Activity Timeline</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-3">
            {activities.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-3">No activity yet</div>
            ) : (
              <div className="space-y-3">
                {activities.slice(0, 10).map(a => (
                  <div key={a.id} className="flex items-start gap-3 text-sm">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-[9px] font-bold ${
                      a.type === 'tour' ? 'bg-blue-100 text-blue-700' :
                      a.type === 'call' ? 'bg-green-100 text-green-700' :
                      a.type === 'email' ? 'bg-gray-100 text-gray-600' :
                      a.type === 'loi_sent' ? 'bg-amber-100 text-amber-700' :
                      'bg-purple-100 text-purple-700'
                    }`}>{a.type[0].toUpperCase()}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{a.subject}</span>
                        {a.owner && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                            a.owner.toLowerCase() === 'greg' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                          }`}>{a.owner}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{formatDate(a.date)}{a.description ? ` — ${a.description.slice(0, 80)}${a.description.length > 80 ? '...' : ''}` : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Emails */}
        {emails.length > 0 && (
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email History ({emails.length})</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 px-4 pb-3 space-y-2">
              {emails.slice(0, 5).map(e => (
                <div key={e.id} className="p-2 rounded bg-muted/30 text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${e.isInbound ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                      {e.isInbound ? 'IN' : 'OUT'}
                    </span>
                    <span className="font-medium truncate">{e.subject}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{formatDate(e.date)}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── Contact Form Dialog ────────────────────────────────────────────

function ContactFormDialog({ open, onOpenChange, onSave, title, initialData }: {
  open: boolean; onOpenChange: (open: boolean) => void;
  onSave: (data: any) => void; title: string; initialData?: Contact;
}) {
  const [form, setForm] = useState({
    firstName: initialData?.firstName || '',
    lastName: initialData?.lastName || '',
    company: initialData?.company || '',
    title: initialData?.title || '',
    email: initialData?.email || '',
    phone: initialData?.phone || '',
    type: (initialData?.type || 'prospect') as ContactType,
    priority: (initialData?.priority || 'medium') as Priority,
    marketArea: initialData?.marketArea || '',
    notes: initialData?.notes || '',
    tags: initialData?.tags || [],
    propertyInterests: initialData?.propertyInterests || [],
    lastContactedAt: initialData?.lastContactedAt || null,
    nextFollowUp: initialData?.nextFollowUp || null,
    dealIds: initialData?.dealIds || [],
  });

  const handleSave = () => {
    if (!form.firstName || !form.lastName) return;
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">First Name *</Label><Input value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} className="mt-1" /></div>
            <div><Label className="text-xs">Last Name *</Label><Input value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} className="mt-1" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Company</Label><Input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} className="mt-1" /></div>
            <div><Label className="text-xs">Title</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="mt-1" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Email</Label><Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="mt-1" /></div>
            <div><Label className="text-xs">Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="mt-1" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as ContactType })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{CONTACT_TYPES.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as Priority })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Market Area</Label><Input value={form.marketArea} onChange={e => setForm({ ...form, marketArea: e.target.value })} className="mt-1" placeholder="e.g. Bellevue/Kirkland" /></div>
          </div>
          <div><Label className="text-xs">Notes</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="mt-1" rows={3} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} className="bg-[hsl(215,65%,45%)] hover:bg-[hsl(215,65%,40%)]">Save Contact</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatValue(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toString();
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 0) return `In ${Math.abs(diff)}d`;
  if (diff < 7) return `${diff}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
