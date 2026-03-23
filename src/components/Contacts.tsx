import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Plus, Phone, Mail, Building2, MapPin, ChevronRight, Filter, X, Edit2, Trash2, ArrowUpDown, SlidersHorizontal, ChevronUp, ChevronDown, Columns, Star, RefreshCw, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Store } from '../store';
import type { Contact, ContactType, Priority, ActivityType, Activity } from '../types';
import { CONTACT_TYPES } from '../types';

type SortField = 'name' | 'company' | 'title' | 'type' | 'propertyName' | 'email' | 'phone' | 'contactOwner' | 'address' | 'submarket' | 'mobile' | 'notes';
type SortDir = 'asc' | 'desc';

interface ContactsProps {
  store: Store;
  focusContactId?: string | null;
  onFocusHandled?: () => void;
}

const ALL_COLUMNS = [
  { key: 'name', label: 'Name', width: 'min-w-[160px]' },
  { key: 'prospect', label: 'Prospect', width: 'min-w-[70px] w-[70px]' },
  { key: 'company', label: 'Company Name', width: 'min-w-[160px]' },
  { key: 'title', label: 'Title', width: 'min-w-[120px]' },
  { key: 'type', label: 'Contact Type', width: 'min-w-[100px]' },
  { key: 'propertyName', label: 'Property Name', width: 'min-w-[170px]' },
  { key: 'email', label: 'Email', width: 'min-w-[180px]' },
  { key: 'phone', label: 'Phone', width: 'min-w-[120px]' },
  { key: 'contactOwner', label: 'Contact Owner', width: 'min-w-[120px]' },
  { key: 'notes', label: 'Notes', width: 'min-w-[180px]' },
  { key: 'mobile', label: 'Mobile Phone', width: 'min-w-[120px]' },
  { key: 'submarket', label: 'Submarket', width: 'min-w-[120px]' },
  { key: 'address', label: 'Address', width: 'min-w-[200px]' },
] as const;

const DEFAULT_VISIBLE = ['name', 'prospect', 'company', 'title', 'type', 'propertyName', 'email', 'phone', 'contactOwner', 'notes', 'mobile'];

export function Contacts({ store, focusContactId, onFocusHandled }: ContactsProps) {
  const { contacts, addContact, updateContact, deleteContact, getContactDeals, getContactActivities, getContactReminders } = store;
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<ContactType | 'all'>('all');
  const [submarketFilter, setSubmarketFilter] = useState<string>('all');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [propertyNameFilter, setPropertyNameFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_VISIBLE);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const columnPickerRef = useRef<HTMLDivElement>(null);

  // Close column picker on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (columnPickerRef.current && !columnPickerRef.current.contains(e.target as Node)) {
        setShowColumnPicker(false);
      }
    };
    if (showColumnPicker) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showColumnPicker]);

  // Auto-select contact when navigated from follow-ups
  useEffect(() => {
    if (focusContactId) {
      const contact = contacts.find(c => c.id === focusContactId);
      if (contact) {
        setSelectedContact(contact);
        setSearch('');
        setTypeFilter('all');
        setSubmarketFilter('all');
        setCompanyFilter('all');
      }
      onFocusHandled?.();
    }
  }, [focusContactId, contacts, onFocusHandled]);

  // Extract unique values for filter dropdowns
  const submarkets = useMemo(() => {
    const subs = new Set<string>();
    contacts.forEach(c => { if (c.submarket) subs.add(c.submarket); if (c.marketArea) subs.add(c.marketArea); });
    return Array.from(subs).sort();
  }, [contacts]);

  const companies = useMemo(() => {
    const comps = new Set<string>();
    contacts.forEach(c => { if (c.company) comps.add(c.company); });
    return Array.from(comps).sort().slice(0, 200);
  }, [contacts]);

  const propertyNames = useMemo(() => {
    const props = new Set<string>();
    contacts.forEach(c => { if (c.propertyName) props.add(c.propertyName); });
    return Array.from(props).sort().slice(0, 200);
  }, [contacts]);

  const hasActiveFilters = typeFilter !== 'all' || submarketFilter !== 'all' || companyFilter !== 'all' || ownerFilter !== 'all' || propertyNameFilter !== 'all';

  const clearAllFilters = () => {
    setTypeFilter('all');
    setSubmarketFilter('all');
    setCompanyFilter('all');
    setOwnerFilter('all');
    setPropertyNameFilter('all');
    setSearch('');
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const getContactValue = (c: Contact, field: SortField): string => {
    switch (field) {
      case 'name': return `${c.lastName}, ${c.firstName}`;
      case 'company': return c.company || '';
      case 'title': return c.title || '';
      case 'type': return c.type || '';
      case 'propertyName': return c.propertyName || '';
      case 'email': return c.email || '';
      case 'phone': return c.phone || '';
      case 'contactOwner': return 'Carter Nicholson'; // All contacts owned by Carter for now
      case 'address': return c.address || '';
      case 'submarket': return c.submarket || c.marketArea || '';
      case 'mobile': return c.mobile || '';
      case 'notes': return c.notes || '';
      default: return '';
    }
  };

  const filtered = useMemo(() => {
    return contacts.filter(c => {
      const searchLower = search.toLowerCase();
      const matchSearch = search === '' || [
        c.firstName, c.lastName, c.company, c.email, c.phone,
        c.address || '', c.submarket || '', c.marketArea, c.propertyName || '',
        c.title, c.notes, c.mobile || '',
      ].some(field => field?.toLowerCase().includes(searchLower));
      const matchType = typeFilter === 'all' || c.type === typeFilter;
      const matchSubmarket = submarketFilter === 'all' || c.submarket === submarketFilter || c.marketArea === submarketFilter;
      const matchCompany = companyFilter === 'all' || c.company === companyFilter;
      const matchPropertyName = propertyNameFilter === 'all' || c.propertyName === propertyNameFilter;
      // Owner filter — for now all contacts are Carter's
      const matchOwner = ownerFilter === 'all' || true;
      return matchSearch && matchType && matchSubmarket && matchCompany && matchPropertyName && matchOwner;
    }).sort((a, b) => {
      const aVal = getContactValue(a, sortField);
      const bVal = getContactValue(b, sortField);
      const cmp = aVal.localeCompare(bVal, undefined, { sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [contacts, search, typeFilter, submarketFilter, companyFilter, propertyNameFilter, ownerFilter, sortField, sortDir]);

  const toggleColumn = (key: string) => {
    setVisibleColumns(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown size={11} className="text-gray-300 ml-1 flex-shrink-0" />;
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="text-blue-600 ml-1 flex-shrink-0" />
      : <ChevronDown size={12} className="text-blue-600 ml-1 flex-shrink-0" />;
  };

  return (
    <div className="flex h-full flex-col">
      {/* ─── Filter Bar ──────────────────────────────────────── */}
      <div className="border-b border-border bg-white">
        <div className="flex items-center gap-2 px-4 py-2 flex-wrap">
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
            <SelectTrigger className="h-8 text-xs w-auto min-w-[120px] bg-white border-gray-300">
              <SelectValue placeholder="Contact Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Contact Type</SelectItem>
              {CONTACT_TYPES.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="h-8 text-xs w-auto min-w-[100px] bg-white border-gray-300">
              <SelectValue placeholder="Owner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Owner</SelectItem>
              <SelectItem value="carter">Carter Nicholson</SelectItem>
              <SelectItem value="greg">Greg Fuchs</SelectItem>
            </SelectContent>
          </Select>

          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="h-8 text-xs w-auto min-w-[110px] bg-white border-gray-300">
              <SelectValue placeholder="Company" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Company</SelectItem>
              {companies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={submarketFilter} onValueChange={setSubmarketFilter}>
            <SelectTrigger className="h-8 text-xs w-auto min-w-[110px] bg-white border-gray-300">
              <SelectValue placeholder="Submarket" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Submarket</SelectItem>
              {submarkets.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={propertyNameFilter} onValueChange={setPropertyNameFilter}>
            <SelectTrigger className="h-8 text-xs w-auto min-w-[130px] bg-white border-gray-300">
              <SelectValue placeholder="Property Name" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Property Name</SelectItem>
              {propertyNames.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>

          <div className="flex-1" />

          {hasActiveFilters && (
            <Button size="sm" variant="ghost" className="h-8 text-xs text-gray-500 hover:text-gray-700" onClick={clearAllFilters}>
              <X size={12} className="mr-1" /> Clear Filters
            </Button>
          )}
        </div>

        {/* ─── Search + Actions Bar ────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-gray-100">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              placeholder={`Search ${filtered.length} contacts...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm bg-white"
            />
          </div>
          <div className="flex-1" />

          {/* Columns toggle */}
          <div className="relative" ref={columnPickerRef}>
            <Button size="sm" variant="outline" className="h-9 gap-1.5 text-xs" onClick={() => setShowColumnPicker(!showColumnPicker)}>
              <Columns size={13} /> Columns
            </Button>
            {showColumnPicker && (
              <div className="absolute right-0 top-10 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-56">
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Show Columns</div>
                {ALL_COLUMNS.map(col => (
                  <label key={col.key} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-gray-50 px-1 rounded text-sm">
                    <input
                      type="checkbox"
                      checked={visibleColumns.includes(col.key)}
                      onChange={() => toggleColumn(col.key)}
                      className="rounded border-gray-300"
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>

          <Button size="sm" onClick={() => setShowAddDialog(true)} className="h-9 gap-1.5 bg-[hsl(215,65%,45%)] hover:bg-[hsl(215,65%,40%)] text-white">
            <Plus size={14} /> Add Contact
          </Button>
        </div>
      </div>

      {/* ─── Data Table ──────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        <div className={`${selectedContact ? 'w-[60%]' : 'flex-1'} overflow-auto`}>
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50 border-b border-gray-200">
                {ALL_COLUMNS.filter(col => visibleColumns.includes(col.key)).map(col => {
                  const sortable = col.key !== 'prospect';
                  return (
                    <th
                      key={col.key}
                      className={`text-left text-xs font-semibold text-gray-500 px-3 py-2.5 border-r border-gray-100 whitespace-nowrap ${col.width} ${sortable ? 'cursor-pointer hover:bg-gray-100 select-none' : ''}`}
                      onClick={() => sortable && handleSort(col.key as SortField)}
                    >
                      <div className="flex items-center">
                        {col.label}
                        {sortable && <SortIcon field={col.key as SortField} />}
                      </div>
                    </th>
                  );
                })}
                {/* Edit column */}
                <th className="w-[40px] px-2 py-2.5 bg-gray-50" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(contact => (
                <tr
                  key={contact.id}
                  onClick={() => setSelectedContact(contact)}
                  className={`border-b border-gray-100 cursor-pointer transition-colors ${
                    selectedContact?.id === contact.id
                      ? 'bg-blue-50 hover:bg-blue-50'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  {visibleColumns.includes('name') && (
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="font-medium text-gray-900">{contact.firstName} {contact.lastName}</span>
                    </td>
                  )}
                  {visibleColumns.includes('prospect') && (
                    <td className="px-3 py-2 text-center">
                      <Star size={14} className={contact.priority === 'high' ? 'text-amber-400 fill-amber-400' : 'text-gray-200'} />
                    </td>
                  )}
                  {visibleColumns.includes('company') && (
                    <td className="px-3 py-2 whitespace-nowrap text-gray-700 max-w-[200px] truncate">{contact.company}</td>
                  )}
                  {visibleColumns.includes('title') && (
                    <td className="px-3 py-2 whitespace-nowrap text-gray-500 max-w-[150px] truncate">{contact.title || '—'}</td>
                  )}
                  {visibleColumns.includes('type') && (
                    <td className="px-3 py-2 whitespace-nowrap text-gray-500">{contact.type || '—'}</td>
                  )}
                  {visibleColumns.includes('propertyName') && (
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600 max-w-[200px] truncate">{contact.propertyName || '—'}</td>
                  )}
                  {visibleColumns.includes('email') && (
                    <td className="px-3 py-2 whitespace-nowrap text-gray-500 max-w-[200px] truncate">{contact.email || '—'}</td>
                  )}
                  {visibleColumns.includes('phone') && (
                    <td className="px-3 py-2 whitespace-nowrap text-gray-500">{contact.phone || '—'}</td>
                  )}
                  {visibleColumns.includes('contactOwner') && (
                    <td className="px-3 py-2 whitespace-nowrap text-gray-500">Carter Nicholson</td>
                  )}
                  {visibleColumns.includes('notes') && (
                    <td className="px-3 py-2 text-gray-400 max-w-[220px] truncate text-xs">{contact.notes ? `${contact.notes.slice(0, 60)}${contact.notes.length > 60 ? '...' : ''}` : '—'}</td>
                  )}
                  {visibleColumns.includes('mobile') && (
                    <td className="px-3 py-2 whitespace-nowrap text-gray-500">{contact.mobile || '—'}</td>
                  )}
                  {visibleColumns.includes('submarket') && (
                    <td className="px-3 py-2 whitespace-nowrap text-gray-500 max-w-[150px] truncate">{contact.submarket || contact.marketArea || '—'}</td>
                  )}
                  {visibleColumns.includes('address') && (
                    <td className="px-3 py-2 text-gray-500 max-w-[240px] truncate text-xs">{contact.address || '—'}</td>
                  )}
                  <td className="px-2 py-2">
                    <Edit2 size={12} className="text-gray-300 hover:text-gray-600 cursor-pointer" onClick={(e) => {
                      e.stopPropagation();
                      setSelectedContact(contact);
                      setShowEditDialog(true);
                    }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center text-gray-400 py-12 text-sm">No contacts match your filters.</div>
          )}
        </div>

        {/* ─── Contact Detail Panel ──────────────────────────── */}
        {selectedContact && (
          <div className="w-[40%] border-l border-gray-200 overflow-hidden">
            <ContactDetail
              contact={selectedContact}
              store={store}
              onClose={() => setSelectedContact(null)}
              onEdit={() => setShowEditDialog(true)}
            />
          </div>
        )}
      </div>

      {/* ─── Dialogs ─────────────────────────────────────────── */}
      <ContactFormDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSave={(data) => { addContact(data); setShowAddDialog(false); }}
        title="Add Contact"
      />
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

// ─── Contact Detail Panel ──────────────────────────────────────────────

function ContactDetail({ contact, store, onClose, onEdit }: {
  contact: Contact; store: Store; onClose: () => void; onEdit: () => void;
}) {
  const deals = store.getContactDeals(contact.id);
  const activities = store.getContactActivities(contact.id);
  const reminders = store.getContactReminders(contact.id);
  const emails = store.getContactEmails(contact.id);
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [editingActivity, setEditingActivity] = useState<string | null>(null);

  return (
    <div className="h-full overflow-y-auto">
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
          <div className="flex items-center gap-2 text-muted-foreground"><Mail size={13} /> <a href={`mailto:${contact.email}`} className="text-[hsl(215,65%,45%)] hover:underline truncate">{contact.email}</a></div>
          <div className="flex items-center gap-2 text-muted-foreground"><Phone size={13} /> {contact.phone}</div>
          <div className="flex items-center gap-2 text-muted-foreground"><Building2 size={13} /> {contact.company}</div>
          <div className="flex items-center gap-2 text-muted-foreground"><MapPin size={13} /> {contact.marketArea}</div>
        </div>

        {/* Property Info */}
        {(contact.propertyName || contact.address) && (
          <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
            {contact.propertyName && <div className="font-medium text-gray-800">{contact.propertyName}</div>}
            {contact.address && <div className="text-gray-500 text-xs">{contact.address}</div>}
            {contact.submarket && <div className="text-gray-400 text-xs">{contact.submarket}</div>}
          </div>
        )}

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
          <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Activity Timeline</CardTitle>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { setShowAddActivity(true); setEditingActivity(null); }}>
              <Plus size={12} /> Add Activity
            </Button>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-3">
            {activities.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-3">No activity yet</div>
            ) : (
              <div className="space-y-3">
                {activities.slice(0, 15).map(a => (
                  <div
                    key={a.id}
                    className="flex items-start gap-3 text-sm group cursor-pointer hover:bg-muted/30 rounded p-1 -mx-1"
                    onClick={() => { setEditingActivity(a.id); setShowAddActivity(true); }}
                  >
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
                        <Edit2 size={10} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
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

      {/* Add/Edit Activity Dialog */}
      <ActivityFormDialog
        open={showAddActivity}
        onOpenChange={(open) => { setShowAddActivity(open); if (!open) setEditingActivity(null); }}
        contactId={contact.id}
        store={store}
        editActivityId={editingActivity}
      />
    </div>
  );
}

// ─── Activity Form Dialog ───────────────────────────────────────────

const ACTIVITY_TYPES: { key: ActivityType; label: string }[] = [
  { key: 'call', label: 'Call' },
  { key: 'email', label: 'Email' },
  { key: 'meeting', label: 'Meeting' },
  { key: 'tour', label: 'Tour' },
  { key: 'note', label: 'Note' },
  { key: 'loi_sent', label: 'LOI Sent' },
  { key: 'loi_received', label: 'LOI Received' },
  { key: 'proposal', label: 'Proposal' },
];

function ActivityFormDialog({ open, onOpenChange, contactId, store, editActivityId }: {
  open: boolean; onOpenChange: (open: boolean) => void;
  contactId: string; store: Store; editActivityId: string | null;
}) {
  const existingActivity = editActivityId
    ? store.activities.find(a => a.id === editActivityId)
    : null;

  const [form, setForm] = useState({
    type: (existingActivity?.type || 'note') as ActivityType,
    subject: existingActivity?.subject || '',
    description: existingActivity?.description || '',
    date: existingActivity?.date || new Date().toISOString().split('T')[0],
    owner: existingActivity?.owner || '',
  });

  useEffect(() => {
    if (open) {
      const a = editActivityId ? store.activities.find(act => act.id === editActivityId) : null;
      setForm({
        type: (a?.type || 'note') as ActivityType,
        subject: a?.subject || '',
        description: a?.description || '',
        date: a?.date || new Date().toISOString().split('T')[0],
        owner: a?.owner || '',
      });
    }
  }, [open, editActivityId, store.activities]);

  const handleSave = () => {
    if (!form.subject) return;
    if (editActivityId) {
      store.updateActivity(editActivityId, {
        type: form.type,
        subject: form.subject,
        description: form.description,
        date: form.date,
        owner: form.owner || undefined,
      });
    } else {
      store.addActivity({
        type: form.type,
        contactId,
        subject: form.subject,
        description: form.description,
        date: form.date,
        owner: form.owner || undefined,
      });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editActivityId ? 'Edit Activity' : 'Add Activity'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as ActivityType })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPES.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Owner</Label>
              <Select value={form.owner || '_none'} onValueChange={(v) => setForm({ ...form, owner: v === '_none' ? '' : v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Who did this?" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">No owner</SelectItem>
                  <SelectItem value="Carter">Carter</SelectItem>
                  <SelectItem value="Greg">Greg</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Subject *</Label>
            <Input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} className="mt-1" placeholder="e.g. Follow-up call re: lease renewal" />
          </div>
          <div>
            <Label className="text-xs">Description / Notes</Label>
            <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="mt-1" rows={3} placeholder="Details about this activity..." />
          </div>
          <div>
            <Label className="text-xs">Date</Label>
            <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="mt-1" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} className="bg-[hsl(215,65%,45%)] hover:bg-[hsl(215,65%,40%)]">
              {editActivityId ? 'Save Changes' : 'Add Activity'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
