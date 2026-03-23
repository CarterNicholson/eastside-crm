import { useState, useCallback, useEffect } from 'react';
import type {
  Contact, Deal, Activity, Reminder, EmailEntry, AISuggestion,
  DealStage,
} from './types';

// Generate unique IDs
let idCounter = Date.now();
export const genId = () => `id_${idCounter++}`;

// Date helpers
const daysAgo = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
};
const today = () => new Date().toISOString().split('T')[0];

// ─── DATA LOADER ──────────────────────────────────────────────────────────
interface CRMData {
  contacts: Contact[];
  activities: Activity[];
  reminders: Reminder[];
  suggestions: AISuggestion[];
  deals: Deal[];
  emails: EmailEntry[];
}

let cachedData: CRMData | null = null;

async function loadCRMData(): Promise<CRMData> {
  if (cachedData) return cachedData;
  try {
    const res = await fetch('/crm-data.json');
    const raw = await res.json();
    cachedData = {
      contacts: raw.contacts || [],
      activities: raw.activities || [],
      reminders: raw.reminders || [],
      suggestions: raw.suggestions || [],
      deals: raw.deals || [],
      emails: raw.emails || [],
    };
    return cachedData;
  } catch (e) {
    console.error('Failed to load CRM data:', e);
    return { contacts: [], activities: [], reminders: [], suggestions: [], deals: [], emails: [] };
  }
}

// ─── STORE HOOK ──────────────────────────────────────────────────────────
export function useStore() {
  const [isLoading, setIsLoading] = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [emails, setEmails] = useState<EmailEntry[]>([]);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);

  // Load data on mount
  useEffect(() => {
    loadCRMData().then(data => {
      setContacts(data.contacts);
      setDeals(data.deals);
      setActivities(data.activities);
      setReminders(data.reminders);
      setEmails(data.emails);
      setSuggestions(data.suggestions);
      setIsLoading(false);
    });
  }, []);

  // Contact CRUD
  const addContact = useCallback((c: Omit<Contact, 'id' | 'createdAt'>) => {
    const newContact: Contact = { ...c, id: genId(), createdAt: today() };
    setContacts(prev => [newContact, ...prev]);
    return newContact;
  }, []);

  const updateContact = useCallback((id: string, updates: Partial<Contact>) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, []);

  const deleteContact = useCallback((id: string) => {
    setContacts(prev => prev.filter(c => c.id !== id));
  }, []);

  // Deal CRUD
  const addDeal = useCallback((d: Omit<Deal, 'id' | 'createdAt' | 'updatedAt' | 'activities'>) => {
    const newDeal: Deal = { ...d, id: genId(), createdAt: today(), updatedAt: today(), activities: [] };
    setDeals(prev => [newDeal, ...prev]);
    return newDeal;
  }, []);

  const updateDeal = useCallback((id: string, updates: Partial<Deal>) => {
    setDeals(prev => prev.map(d => d.id === id ? { ...d, ...updates, updatedAt: today() } : d));
  }, []);

  const moveDealStage = useCallback((id: string, stage: DealStage) => {
    setDeals(prev => prev.map(d => d.id === id ? { ...d, stage, updatedAt: today() } : d));
  }, []);

  const deleteDeal = useCallback((id: string) => {
    setDeals(prev => prev.filter(d => d.id !== id));
  }, []);

  // Activity CRUD
  const addActivity = useCallback((a: Omit<Activity, 'id' | 'createdAt'>) => {
    const newActivity: Activity = { ...a, id: genId(), createdAt: today() };
    setActivities(prev => [newActivity, ...prev]);
    setContacts(prev => prev.map(c => c.id === a.contactId ? { ...c, lastContactedAt: today() } : c));
    return newActivity;
  }, []);

  // Reminder CRUD
  const addReminder = useCallback((r: Omit<Reminder, 'id' | 'createdAt'>) => {
    const newReminder: Reminder = { ...r, id: genId(), createdAt: today() };
    setReminders(prev => [newReminder, ...prev]);
    return newReminder;
  }, []);

  const updateReminder = useCallback((id: string, updates: Partial<Reminder>) => {
    setReminders(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  }, []);

  const completeReminder = useCallback((id: string) => {
    setReminders(prev => prev.map(r => r.id === id ? { ...r, status: 'completed' as const } : r));
  }, []);

  const dismissReminder = useCallback((id: string) => {
    setReminders(prev => prev.map(r => r.id === id ? { ...r, status: 'dismissed' as const } : r));
  }, []);

  // Email
  const addEmail = useCallback((e: Omit<EmailEntry, 'id'>) => {
    const newEmail: EmailEntry = { ...e, id: genId() };
    setEmails(prev => [newEmail, ...prev]);
    return newEmail;
  }, []);

  // Suggestions
  const dismissSuggestion = useCallback((id: string) => {
    setSuggestions(prev => prev.map(s => s.id === id ? { ...s, isDismissed: true } : s));
  }, []);

  // Helpers
  const getContact = useCallback((id: string) => contacts.find(c => c.id === id), [contacts]);
  const getDeal = useCallback((id: string) => deals.find(d => d.id === id), [deals]);
  const getContactActivities = useCallback((contactId: string) =>
    activities.filter(a => a.contactId === contactId).sort((a, b) => b.date.localeCompare(a.date)),
  [activities]);
  const getDealActivities = useCallback((dealId: string) =>
    activities.filter(a => a.dealId === dealId).sort((a, b) => b.date.localeCompare(a.date)),
  [activities]);
  const getContactDeals = useCallback((contactId: string) =>
    deals.filter(d => d.contactId === contactId),
  [deals]);
  const getContactEmails = useCallback((contactId: string) =>
    emails.filter(e => e.contactId === contactId).sort((a, b) => b.date.localeCompare(a.date)),
  [emails]);
  const getContactReminders = useCallback((contactId: string) =>
    reminders.filter(r => r.contactId === contactId && r.status === 'pending'),
  [reminders]);
  const getActiveSuggestions = useCallback(() =>
    suggestions.filter(s => !s.isDismissed),
  [suggestions]);

  // Stats
  const activeDeals = deals.filter(d => !['closed_won', 'closed_lost'].includes(d.stage));
  const pipelineValue = activeDeals.reduce((sum, d) => sum + d.dealValue, 0);
  const closedThisMonth = deals.filter(d => d.stage === 'closed_won' && d.updatedAt >= daysAgo(30)).length;
  const activitiesThisWeek = activities.filter(a => a.date >= daysAgo(7)).length;

  return {
    // Loading state
    isLoading,
    // Data
    contacts, deals, activities, reminders, emails, suggestions,
    // Contact ops
    addContact, updateContact, deleteContact, getContact,
    // Deal ops
    addDeal, updateDeal, moveDealStage, deleteDeal, getDeal,
    // Activity ops
    addActivity, getContactActivities, getDealActivities,
    // Reminder ops
    addReminder, updateReminder, completeReminder, dismissReminder,
    // Email ops
    addEmail, getContactEmails,
    // Suggestion ops
    dismissSuggestion, getActiveSuggestions,
    // Relation helpers
    getContactDeals, getContactReminders,
    // Stats
    stats: { activeDeals: activeDeals.length, pipelineValue, closedThisMonth, activitiesThisWeek },
  };
}

export type Store = ReturnType<typeof useStore>;
