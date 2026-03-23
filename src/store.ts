import { useState, useCallback } from 'react';
import type {
  Contact, Deal, Activity, Reminder, EmailEntry, AISuggestion,
  DealStage, Priority, ContactType
} from './types';

// Generate unique IDs
let idCounter = Date.now();
export const genId = () => `id_${idCounter++}`;

// Date helpers
const daysAgo = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
};
const daysFromNow = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
};
const today = () => new Date().toISOString().split('T')[0];

// ─── SEED DATA ──────────────────────────────────────────────────────────
const SEED_CONTACTS: Contact[] = [
  {
    id: 'c1', firstName: 'Mike', lastName: 'Chen', company: 'Pacific Logistics NW',
    title: 'VP Operations', email: 'mchen@paclogisticsnw.com', phone: '(425) 555-0142',
    type: 'tenant', tags: ['industrial', 'active-search', 'I-90 corridor'],
    notes: 'Looking for 15-25K SF warehouse in Issaquah/Snoqualmie area. Currently in Renton, lease expires Aug 2026. Budget $14-16/SF NNN.',
    createdAt: daysAgo(45), lastContactedAt: daysAgo(3), nextFollowUp: daysFromNow(4),
    priority: 'high', propertyInterests: ['warehouse', 'distribution'],
    marketArea: 'I-90 Corridor', dealIds: ['d1'],
  },
  {
    id: 'c2', firstName: 'Sarah', lastName: 'Nguyen', company: 'Emerald City Brewing',
    title: 'Founder & CEO', email: 'sarah@emeraldcitybrewing.com', phone: '(425) 555-0287',
    type: 'prospect', tags: ['industrial', 'manufacturing', 'Woodinville'],
    notes: 'Craft brewery expanding. Needs production/warehouse space with floor drains, 3-phase power. 8-12K SF. Met at NAIOP mixer.',
    createdAt: daysAgo(12), lastContactedAt: daysAgo(12), nextFollowUp: daysFromNow(1),
    priority: 'high', propertyInterests: ['manufacturing', 'warehouse'],
    marketArea: 'Woodinville/SR-522', dealIds: [],
  },
  {
    id: 'c3', firstName: 'Tom', lastName: 'Bradley', company: 'Cascade Development Group',
    title: 'Managing Partner', email: 'tbradley@cascadedev.com', phone: '(425) 555-0391',
    type: 'landlord', tags: ['industrial', 'multi-tenant', 'Bothell'],
    notes: 'Owns Bothell Business Park (6 buildings, ~180K SF total). Good relationship. Responsive. Prefers 3-5 yr terms.',
    createdAt: daysAgo(200), lastContactedAt: daysAgo(8), nextFollowUp: daysFromNow(14),
    priority: 'medium', propertyInterests: [],
    marketArea: 'Bothell/I-405', dealIds: ['d1', 'd3'],
  },
  {
    id: 'c4', firstName: 'Lisa', lastName: 'Park', company: 'NW Supply Chain Solutions',
    title: 'Director of Real Estate', email: 'lpark@nwscs.com', phone: '(206) 555-0518',
    type: 'tenant', tags: ['distribution', 'last-mile', 'Bellevue'],
    notes: 'Regional 3PL. Expanding last-mile network on Eastside. Looking at multiple smaller spaces 5-10K SF. Has budget.',
    createdAt: daysAgo(30), lastContactedAt: daysAgo(15), nextFollowUp: daysAgo(1),
    priority: 'high', propertyInterests: ['distribution', 'warehouse'],
    marketArea: 'Bellevue/Kirkland', dealIds: ['d2'],
  },
  {
    id: 'c5', firstName: 'Dave', lastName: 'Morrison', company: 'Morrison Electric',
    title: 'Owner', email: 'dave@morrisonelectric.com', phone: '(425) 555-0673',
    type: 'buyer', tags: ['flex', 'owner-user', 'Redmond'],
    notes: 'Electrical contractor. Wants to buy flex/warehouse for shop + yard. Budget $2-3M. Pre-approved.',
    createdAt: daysAgo(60), lastContactedAt: daysAgo(22), nextFollowUp: daysAgo(5),
    priority: 'medium', propertyInterests: ['flex', 'warehouse'],
    marketArea: 'Redmond', dealIds: ['d4'],
  },
  {
    id: 'c6', firstName: 'Jennifer', lastName: 'Kim', company: 'Eastside Tech Ventures',
    title: 'COO', email: 'jkim@eastsidetech.vc', phone: '(425) 555-0834',
    type: 'prospect', tags: ['office', 'flex', 'Kirkland'],
    notes: 'VC firm looking for office/flex space for portfolio companies. Could be pipeline of deals. Connected through Tom Bradley.',
    createdAt: daysAgo(5), lastContactedAt: daysAgo(5), nextFollowUp: daysFromNow(2),
    priority: 'medium', propertyInterests: ['office', 'flex'],
    marketArea: 'Kirkland', dealIds: [],
  },
  {
    id: 'c7', firstName: 'Ray', lastName: 'Tanaka', company: 'Snoqualmie Valley Properties',
    title: 'Owner/Broker', email: 'ray@snovalleyprops.com', phone: '(425) 555-0956',
    type: 'landlord', tags: ['industrial', 'land', 'Snoqualmie'],
    notes: 'Controls several parcels and small industrial buildings along I-90 east of Issaquah. Good for overflow/expansion deals.',
    createdAt: daysAgo(150), lastContactedAt: daysAgo(35), nextFollowUp: null,
    priority: 'low', propertyInterests: [],
    marketArea: 'Snoqualmie/I-90 East', dealIds: [],
  },
  {
    id: 'c8', firstName: 'Amanda', lastName: 'Foster', company: 'ProBuild Construction',
    title: 'Operations Manager', email: 'afoster@probuildnw.com', phone: '(425) 555-1127',
    type: 'tenant', tags: ['industrial', 'yard', 'Everett'],
    notes: 'GC needing yard + shop space near Everett. 10-15K SF building + 1 acre yard minimum. Could do short-term while they build.',
    createdAt: daysAgo(20), lastContactedAt: daysAgo(7), nextFollowUp: daysFromNow(3),
    priority: 'medium', propertyInterests: ['industrial', 'land'],
    marketArea: 'Everett/Snohomish', dealIds: ['d5'],
  },
];

const SEED_DEALS: Deal[] = [
  {
    id: 'd1', name: 'Pacific Logistics — Bothell Warehouse',
    stage: 'touring', contactId: 'c1', propertyType: 'industrial',
    propertyAddress: '22015 Bothell-Everett Hwy, Bothell, WA 98021',
    squareFeet: 18500, dealValue: 333000, probability: 45,
    notes: 'Touring Building C at Bothell Business Park. 18,500 SF, $15/SF NNN. Tenant likes the dock config. Follow up after 2nd tour.',
    createdAt: daysAgo(30), updatedAt: daysAgo(3), expectedCloseDate: daysFromNow(45),
    tags: ['warehouse', 'Bothell'], activities: [],
  },
  {
    id: 'd2', name: 'NW Supply Chain — Bellevue Last-Mile',
    stage: 'qualifying', contactId: 'c4', propertyType: 'industrial',
    propertyAddress: 'TBD — Bellevue/Kirkland submarket',
    squareFeet: 8000, dealValue: 144000, probability: 25,
    notes: 'Need to identify 2-3 options in Bellevue/Kirkland for their last-mile node. 5-10K SF range.',
    createdAt: daysAgo(15), updatedAt: daysAgo(15), expectedCloseDate: daysFromNow(90),
    tags: ['distribution', 'last-mile', 'Bellevue'], activities: [],
  },
  {
    id: 'd3', name: 'Cascade Business Park — Building D Backfill',
    stage: 'prospect', contactId: 'c3', propertyType: 'industrial',
    propertyAddress: '22100 Bothell-Everett Hwy, Bldg D, Bothell, WA 98021',
    squareFeet: 12000, dealValue: 204000, probability: 15,
    notes: 'Tom has a vacancy coming in 60 days. 12K SF flex/warehouse. Need to find a tenant. Good listing opportunity.',
    createdAt: daysAgo(8), updatedAt: daysAgo(8), expectedCloseDate: daysFromNow(120),
    tags: ['listing', 'flex', 'Bothell'], activities: [],
  },
  {
    id: 'd4', name: 'Morrison Electric — Flex Purchase',
    stage: 'loi', contactId: 'c5', propertyType: 'flex',
    propertyAddress: '16800 Redmond Way, Redmond, WA 98052',
    squareFeet: 7200, dealValue: 2400000, probability: 55,
    notes: 'LOI submitted at $2.4M for 7,200 SF flex w/ fenced yard. Waiting on seller counter. Pre-approved buyer.',
    createdAt: daysAgo(50), updatedAt: daysAgo(5), expectedCloseDate: daysFromNow(30),
    tags: ['sale', 'flex', 'owner-user', 'Redmond'], activities: [],
  },
  {
    id: 'd5', name: 'ProBuild — Everett Yard + Shop',
    stage: 'touring', contactId: 'c8', propertyType: 'industrial',
    propertyAddress: '9200 Evergreen Way, Everett, WA 98204',
    squareFeet: 12000, dealValue: 216000, probability: 35,
    notes: 'Showed one option so far — needs bigger yard. Looking at a second property next week.',
    createdAt: daysAgo(14), updatedAt: daysAgo(7), expectedCloseDate: daysFromNow(60),
    tags: ['industrial', 'yard', 'Everett'], activities: [],
  },
];

const SEED_ACTIVITIES: Activity[] = [
  { id: 'a1', type: 'tour', contactId: 'c1', dealId: 'd1', subject: 'Tour — Bothell Business Park Bldg C', description: 'Walked the space with Mike. He liked the 3 dock-high doors and clear height. Wants to bring his ops team back for a 2nd look.', date: daysAgo(3), createdAt: daysAgo(3) },
  { id: 'a2', type: 'call', contactId: 'c4', dealId: 'd2', subject: 'Intro call — discussed requirements', description: 'Lisa needs 5-10K SF distribution nodes in Bellevue/Kirkland. Flexible on term. Will send her comps this week.', date: daysAgo(15), createdAt: daysAgo(15) },
  { id: 'a3', type: 'email', contactId: 'c2', subject: 'Follow-up from NAIOP mixer', description: 'Sent intro email recapping our conversation about their expansion plans.', date: daysAgo(12), createdAt: daysAgo(12) },
  { id: 'a4', type: 'loi_sent', contactId: 'c5', dealId: 'd4', subject: 'LOI submitted — 16800 Redmond Way', description: 'Submitted LOI at $2.4M, 30-day due diligence, 15-day financing contingency. Waiting on seller counter.', date: daysAgo(5), createdAt: daysAgo(5) },
  { id: 'a5', type: 'meeting', contactId: 'c3', dealId: 'd3', subject: 'Discussed Bldg D vacancy', description: 'Tom mentioned tenant in Bldg D is vacating in ~60 days. Discussed listing terms — 5% commission, exclusive.', date: daysAgo(8), createdAt: daysAgo(8) },
  { id: 'a6', type: 'tour', contactId: 'c8', dealId: 'd5', subject: 'Tour — Everett property', description: 'Showed the Evergreen Way space. Building is fine but yard is too small. Need to find options with 1+ acre.', date: daysAgo(7), createdAt: daysAgo(7) },
  { id: 'a7', type: 'email', contactId: 'c6', subject: 'Intro email — portfolio space needs', description: 'Sent Jennifer a note about how we can help source space for her portfolio companies on the Eastside.', date: daysAgo(5), createdAt: daysAgo(5) },
];

const SEED_REMINDERS: Reminder[] = [
  { id: 'r1', contactId: 'c1', dealId: 'd1', title: 'Schedule 2nd tour for Mike Chen', description: 'Mike wants to bring his ops team to Bothell Business Park Bldg C.', dueDate: daysFromNow(1), status: 'pending', priority: 'high', isAutoGenerated: false, createdAt: daysAgo(3) },
  { id: 'r2', contactId: 'c2', title: 'Follow up with Sarah Nguyen — brewery space', description: 'She was interested at NAIOP mixer. Send her 2-3 Woodinville options.', dueDate: daysFromNow(1), status: 'pending', priority: 'high', isAutoGenerated: true, createdAt: daysAgo(1) },
  { id: 'r3', contactId: 'c4', dealId: 'd2', title: 'Send comp survey to Lisa Park', description: 'Pull Bellevue/Kirkland industrial comps for 5-10K SF spaces.', dueDate: daysAgo(1), status: 'pending', priority: 'high', isAutoGenerated: false, createdAt: daysAgo(5) },
  { id: 'r4', contactId: 'c5', dealId: 'd4', title: 'Check on Morrison LOI counter', description: 'LOI has been with seller for 5 days. Follow up with listing broker.', dueDate: today(), status: 'pending', priority: 'high', isAutoGenerated: true, createdAt: today() },
  { id: 'r5', contactId: 'c6', title: 'Coffee with Jennifer Kim', description: 'Proposed coffee meeting to discuss portfolio company needs.', dueDate: daysFromNow(2), status: 'pending', priority: 'medium', isAutoGenerated: false, createdAt: daysAgo(3) },
  { id: 'r6', contactId: 'c8', dealId: 'd5', title: 'Find 2nd Everett property for ProBuild', description: 'Need industrial w/ 1+ acre yard near Everett. Check CoStar.', dueDate: daysFromNow(3), status: 'pending', priority: 'medium', isAutoGenerated: false, createdAt: daysAgo(5) },
  { id: 'r7', contactId: 'c7', title: 'Reconnect with Ray Tanaka', description: 'Haven\'t talked in 35 days. Might have inventory for Pacific Logistics.', dueDate: daysFromNow(0), status: 'pending', priority: 'low', isAutoGenerated: true, createdAt: today() },
];

const SEED_EMAILS: EmailEntry[] = [
  { id: 'e1', from: 'mchen@paclogisticsnw.com', to: 'carter122886@gmail.com', subject: 'Re: Bothell Business Park — 2nd Tour', body: 'Carter, thanks for showing us the space. My ops manager can do Thursday or Friday afternoon. Let me know what works for Tom.', date: daysAgo(2), contactId: 'c1', dealId: 'd1', isInbound: true, isRead: true },
  { id: 'e2', from: 'carter122886@gmail.com', to: 'lpark@nwscs.com', subject: 'Eastside Industrial Options — Comp Survey', body: 'Lisa, attached are 4 options in the Bellevue/Kirkland area in the 5-10K SF range. Let me know which ones you want to tour.', date: daysAgo(14), contactId: 'c4', dealId: 'd2', isInbound: false, isRead: true },
  { id: 'e3', from: 'tbradley@cascadedev.com', to: 'carter122886@gmail.com', subject: 'Bldg D Update', body: 'Carter, tenant confirmed they are out June 30. Let\'s get the listing paperwork going. Can you send me a listing agreement?', date: daysAgo(4), contactId: 'c3', dealId: 'd3', isInbound: true, isRead: false },
  { id: 'e4', from: 'afoster@probuildnw.com', to: 'carter122886@gmail.com', subject: 'Need bigger yard', body: 'Carter, that space was nice but the yard just isn\'t going to work for our equipment. Can you find something with at least an acre? We\'re flexible on the building size.', date: daysAgo(6), contactId: 'c8', dealId: 'd5', isInbound: true, isRead: true },
  { id: 'e5', from: 'sarah@emeraldcitybrewing.com', to: 'carter122886@gmail.com', subject: 'Space requirements', body: 'Hi Carter, great meeting you at the NAIOP event. As I mentioned, we\'re looking to expand our production. We need floor drains, 3-phase power, and ideally some office up front. Around 8-12K SF. Woodinville would be perfect.', date: daysAgo(11), contactId: 'c2', isInbound: true, isRead: true },
];

const SEED_SUGGESTIONS: AISuggestion[] = [
  { id: 's1', type: 'follow_up', title: 'Lisa Park is going cold', description: 'Last contact was 15 days ago. She has active space needs and budget. Send her updated comps or schedule a call.', contactId: 'c4', dealId: 'd2', priority: 'high', actionLabel: 'Draft Follow-Up Email', createdAt: today(), isDismissed: false },
  { id: 's2', type: 'deal_risk', title: 'Morrison LOI — no response in 5 days', description: 'The LOI for 16800 Redmond Way has been pending for 5 days with no seller counter. Consider calling the listing broker directly.', contactId: 'c5', dealId: 'd4', priority: 'high', actionLabel: 'Log Call to Broker', createdAt: today(), isDismissed: false },
  { id: 's3', type: 'opportunity', title: 'Connect Sarah Nguyen with Woodinville inventory', description: 'Ray Tanaka may have suitable manufacturing space in the Woodinville/Snoqualmie area. Cross-reference his inventory with Sarah\'s needs.', contactId: 'c2', priority: 'medium', actionLabel: 'Call Ray Tanaka', createdAt: today(), isDismissed: false },
  { id: 's4', type: 'outreach', title: 'Tom Bradley — send listing agreement', description: 'Tom confirmed Bldg D vacancy (June 30). He asked for listing paperwork 4 days ago. Get that signed before someone else does.', contactId: 'c3', dealId: 'd3', priority: 'high', actionLabel: 'Send Listing Agreement', createdAt: today(), isDismissed: false },
  { id: 's5', type: 'reminder', title: 'Dave Morrison hasn\'t been contacted in 22 days', description: 'Active buyer with pre-approval going quiet. Even though the LOI is pending, stay in touch so he doesn\'t lose momentum.', contactId: 'c5', priority: 'medium', actionLabel: 'Schedule Check-In Call', createdAt: today(), isDismissed: false },
  { id: 's6', type: 'opportunity', title: 'Jennifer Kim — potential deal pipeline', description: 'New connection with VC firm that places portfolio companies. One relationship could yield multiple deals. Prioritize the coffee meeting.', contactId: 'c6', priority: 'medium', actionLabel: 'Confirm Coffee Meeting', createdAt: today(), isDismissed: false },
];

// ─── STORE HOOK ──────────────────────────────────────────────────────────
export function useStore() {
  const [contacts, setContacts] = useState<Contact[]>(SEED_CONTACTS);
  const [deals, setDeals] = useState<Deal[]>(SEED_DEALS);
  const [activities, setActivities] = useState<Activity[]>(SEED_ACTIVITIES);
  const [reminders, setReminders] = useState<Reminder[]>(SEED_REMINDERS);
  const [emails, setEmails] = useState<EmailEntry[]>(SEED_EMAILS);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>(SEED_SUGGESTIONS);

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
    // Update last contacted
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
