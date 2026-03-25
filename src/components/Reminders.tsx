import { useState, useMemo, useEffect } from 'react';
import { Check, X, Clock, AlertTriangle, Plus, Calendar, Pencil, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Store } from '../store';
import type { Priority, ReminderStatus, Reminder } from '../types';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface RemindersProps {
  store: Store;
  onNavigateToContact?: (contactId: string) => void;
}

export function Reminders({ store, onNavigateToContact }: RemindersProps) {
  const { reminders, contacts, completeReminder, dismissReminder, addReminder, updateReminder, getContact } = store;
  const [filter, setFilter] = useState<'all' | 'pending' | 'overdue' | 'completed'>('pending');
  const [showAdd, setShowAdd] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  const today = new Date().toISOString().split('T')[0];

  // Load team members
  useEffect(() => {
    const token = localStorage.getItem('crm_token') || '';
    if (token) {
      fetch('/api/auth/users', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : [])
        .then(setTeamMembers)
        .catch(() => {});
    }
  }, []);

  const filtered = useMemo(() => {
    let result = [...reminders];
    if (filter === 'pending') result = result.filter(r => r.status === 'pending');
    if (filter === 'overdue') result = result.filter(r => r.status === 'pending' && r.dueDate < today);
    if (filter === 'completed') result = result.filter(r => r.status === 'completed');
    return result.sort((a, b) => {
      const aOverdue = a.dueDate < today && a.status === 'pending' ? 0 : 1;
      const bOverdue = b.dueDate < today && b.status === 'pending' ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) return priorityOrder[a.priority] - priorityOrder[b.priority];
      return a.dueDate.localeCompare(b.dueDate);
    });
  }, [reminders, filter, today]);

  const overdueCount = reminders.filter(r => r.status === 'pending' && r.dueDate < today).length;
  const todayCount = reminders.filter(r => r.status === 'pending' && r.dueDate === today).length;
  const upcomingCount = reminders.filter(r => r.status === 'pending' && r.dueDate > today).length;

  return (
    <div className="p-6 max-w-[900px] space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Follow-Ups & Reminders</h2>
          <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
            {overdueCount > 0 && <span className="text-red-600 font-medium">{overdueCount} overdue</span>}
            <span>{todayCount} due today</span>
            <span>{upcomingCount} upcoming</span>
          </div>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5 bg-[hsl(215,65%,45%)] hover:bg-[hsl(215,65%,40%)]">
          <Plus size={14} /> Add Reminder
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
        {(['pending', 'overdue', 'completed', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-md transition-colors capitalize ${
              filter === f ? 'bg-white shadow-sm text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {f} {f === 'overdue' && overdueCount > 0 ? `(${overdueCount})` : ''}
          </button>
        ))}
      </div>

      {/* Reminders List */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-12">No reminders match this filter</div>
        )}
        {filtered.map(r => {
          const contact = getContact(r.contactId);
          const isOverdue = r.status === 'pending' && r.dueDate < today;
          const isToday = r.dueDate === today;
          return (
            <Card key={r.id} className={`transition-all ${r.status === 'completed' ? 'opacity-50' : ''} ${isOverdue ? 'border-red-200 bg-red-50/30' : ''}`}>
              <CardContent className="py-3 px-4">
                <div className="flex items-start gap-3">
                  {/* Status Indicator */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    r.status === 'completed' ? 'bg-green-100 text-green-600' :
                    isOverdue ? 'bg-red-100 text-red-600' :
                    r.priority === 'high' ? 'bg-amber-100 text-amber-600' :
                    'bg-gray-100 text-gray-400'
                  }`}>
                    {r.status === 'completed' ? <Check size={14} /> :
                     isOverdue ? <AlertTriangle size={14} /> :
                     <Clock size={14} />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${r.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>{r.title}</span>
                      {r.isAutoGenerated && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">AI</span>}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        r.priority === 'high' ? 'bg-red-100 text-red-700' :
                        r.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>{r.priority}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{r.description}</div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                      {contact && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onNavigateToContact?.(r.contactId); }}
                          className="text-[hsl(215,65%,45%)] hover:underline font-medium cursor-pointer"
                        >
                          {contact.firstName} {contact.lastName} — {contact.company}
                        </button>
                      )}
                      <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-600 font-medium' : isToday ? 'text-amber-600 font-medium' : ''}`}>
                        <Calendar size={10} />
                        {isOverdue ? `Overdue (${formatDate(r.dueDate)})` : isToday ? 'Due today' : `Due ${formatDate(r.dueDate)}`}
                      </span>
                      {r.assignedName && (
                        <span className="flex items-center gap-1 text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                          <User size={10} />
                          {r.assignedName}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1">
                    {r.status === 'pending' && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setEditingReminder(r)} className="h-7 w-7 p-0 text-muted-foreground hover:text-blue-600">
                          <Pencil size={13} />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => completeReminder(r.id)} className="h-7 w-7 p-0 text-green-600 hover:bg-green-50">
                          <Check size={13} />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => dismissReminder(r.id)} className="h-7 w-7 p-0 text-muted-foreground">
                          <X size={13} />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add Reminder Dialog */}
      <ReminderDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        store={store}
        teamMembers={teamMembers}
        onSave={(data) => { addReminder(data); setShowAdd(false); }}
      />

      {/* Edit Reminder Dialog */}
      {editingReminder && (
        <ReminderDialog
          open={!!editingReminder}
          onOpenChange={(open) => { if (!open) setEditingReminder(null); }}
          store={store}
          teamMembers={teamMembers}
          existingReminder={editingReminder}
          onSave={(data) => {
            updateReminder(editingReminder.id, data);
            setEditingReminder(null);
          }}
        />
      )}
    </div>
  );
}

function ReminderDialog({ open, onOpenChange, store, teamMembers, existingReminder, onSave }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  store: Store;
  teamMembers: TeamMember[];
  existingReminder?: Reminder;
  onSave: (data: any) => void;
}) {
  const isEdit = !!existingReminder;

  const [form, setForm] = useState({
    contactId: existingReminder?.contactId || '',
    dealId: existingReminder?.dealId || undefined as string | undefined,
    title: existingReminder?.title || '',
    description: existingReminder?.description || '',
    dueDate: existingReminder?.dueDate || '',
    priority: (existingReminder?.priority || 'medium') as Priority,
    status: (existingReminder?.status || 'pending') as ReminderStatus,
    isAutoGenerated: existingReminder?.isAutoGenerated || false,
    assignedTo: existingReminder?.assignedTo || '',
    assignedName: existingReminder?.assignedName || '',
  });

  // Reset form when dialog opens with new data
  useEffect(() => {
    if (open) {
      setForm({
        contactId: existingReminder?.contactId || '',
        dealId: existingReminder?.dealId || undefined,
        title: existingReminder?.title || '',
        description: existingReminder?.description || '',
        dueDate: existingReminder?.dueDate || '',
        priority: (existingReminder?.priority || 'medium') as Priority,
        status: (existingReminder?.status || 'pending') as ReminderStatus,
        isAutoGenerated: existingReminder?.isAutoGenerated || false,
        assignedTo: existingReminder?.assignedTo || '',
        assignedName: existingReminder?.assignedName || '',
      });
    }
  }, [open, existingReminder]);

  const handleAssigneeChange = (userId: string) => {
    if (userId === '__unassigned__') {
      setForm({ ...form, assignedTo: '', assignedName: '' });
    } else {
      const member = teamMembers.find(m => m.id === userId);
      setForm({
        ...form,
        assignedTo: userId,
        assignedName: member?.name || '',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{isEdit ? 'Edit Reminder' : 'New Reminder'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Title *</Label>
            <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="mt-1" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Contact</Label>
              <Select value={form.contactId} onValueChange={v => setForm({ ...form, contactId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{store.contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Priority</Label>
              <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v as Priority })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Due Date *</Label>
              <Input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1">
                <User size={11} className="text-purple-500" />
                Assign To
              </Label>
              <Select value={form.assignedTo || '__unassigned__'} onValueChange={handleAssigneeChange}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned__">Unassigned</SelectItem>
                  {teamMembers.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              onClick={() => { if (form.title && form.dueDate) onSave(form); }}
              className="bg-[hsl(215,65%,45%)] hover:bg-[hsl(215,65%,40%)]"
            >
              {isEdit ? 'Save Changes' : 'Save'}
            </Button>
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
  if (diff < 0) return `In ${Math.abs(diff)}d`;
  if (diff < 7) return `${diff}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
