import { useState, useRef, useEffect } from 'react';
import { Sparkles, X, AlertTriangle, TrendingUp, UserPlus, Bell, Mail, Lightbulb, Zap, Send, Search, ArrowRight, User, Bot } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Store } from '../store';
import type { AISuggestion, Contact, Deal } from '../types';
import { DEAL_STAGES } from '../types';
import type { Page } from './Sidebar';

interface AssistantProps {
  store: Store;
  onNavigate: (page: Page) => void;
  onNavigateToContact?: (contactId: string) => void;
}

// ─── Chat message types ──────────────────────────────────────────────
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  contactResults?: Contact[];
  dealResults?: Deal[];
}

export function Assistant({ store, onNavigate, onNavigateToContact }: AssistantProps) {
  const { getActiveSuggestions, dismissSuggestion, getContact, getDeal, contacts, deals, activities, reminders } = store;
  const suggestions = getActiveSuggestions();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draftEmail, setDraftEmail] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'suggestions' | 'chat'>('chat');

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Hey Carter — I'm your CRM assistant. Ask me anything about your contacts, deals, or pipeline. Try things like:\n\n• "Show me contacts in Bellevue"\n• "Who haven't I contacted in 30 days?"\n• "What deals are in LOI stage?"\n• "Find contacts at Amazon"\n• "How many high priority contacts do I have?"`,
      timestamp: new Date(),
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const highPriority = suggestions.filter(s => s.priority === 'high');
  const mediumPriority = suggestions.filter(s => s.priority === 'medium');
  const lowPriority = suggestions.filter(s => s.priority === 'low');

  // Smart insights
  const coldContacts = contacts.filter(c => {
    if (!c.lastContactedAt) return true;
    const daysSince = Math.floor((Date.now() - new Date(c.lastContactedAt + 'T00:00:00').getTime()) / 86400000);
    return daysSince > 14 && c.priority !== 'low';
  });

  const stalledDeals = deals.filter(d => {
    if (['closed_won', 'closed_lost'].includes(d.stage)) return false;
    const daysSinceUpdate = Math.floor((Date.now() - new Date(d.updatedAt + 'T00:00:00').getTime()) / 86400000);
    return daysSinceUpdate > 10;
  });

  // ─── Smart command processor ─────────────────────────────────────
  const processCommand = (input: string): ChatMessage => {
    const q = input.toLowerCase().trim();
    const id = `msg_${Date.now()}`;
    const timestamp = new Date();

    // Contact search by location/submarket
    const locationMatch = q.match(/(?:contacts?|people|who(?:'s)?)\s+(?:in|at|from|near)\s+(.+)/i)
      || q.match(/(?:show|find|search|list)\s+(?:me\s+)?(?:contacts?|people)\s+(?:in|at|from|near)\s+(.+)/i)
      || q.match(/(?:in|at|from)\s+(.+?)(?:\s+contacts?|\s+people)?$/i);
    if (locationMatch) {
      const loc = locationMatch[1].trim().toLowerCase();
      const results = contacts.filter(c =>
        [c.marketArea, c.submarket || '', c.address || '', c.company].some(f => f.toLowerCase().includes(loc))
      );
      if (results.length > 0) {
        return { id, role: 'assistant', content: `Found **${results.length} contacts** matching "${locationMatch[1].trim()}":`, timestamp, contactResults: results.slice(0, 20) };
      }
      return { id, role: 'assistant', content: `No contacts found matching "${locationMatch[1].trim()}". Try a different location or company name.`, timestamp };
    }

    // Contact search by company
    const companyMatch = q.match(/(?:contacts?|people|who)\s+(?:at|from|with)\s+(.+)/i)
      || q.match(/(?:find|show|search)\s+(?:me\s+)?(?:contacts?\s+)?(?:at|from|with)\s+(.+)/i);
    if (companyMatch && !locationMatch) {
      const comp = companyMatch[1].trim().toLowerCase();
      const results = contacts.filter(c => c.company.toLowerCase().includes(comp));
      if (results.length > 0) {
        return { id, role: 'assistant', content: `Found **${results.length} contacts** at "${companyMatch[1].trim()}":`, timestamp, contactResults: results.slice(0, 20) };
      }
      return { id, role: 'assistant', content: `No contacts found at "${companyMatch[1].trim()}".`, timestamp };
    }

    // Cold contacts / haven't contacted
    if (q.includes("haven't") || q.includes('cold') || q.includes('not contacted') || q.includes('going cold') || q.includes('neglect')) {
      const daysMatch = q.match(/(\d+)\s*days?/);
      const threshold = daysMatch ? parseInt(daysMatch[1]) : 14;
      const results = contacts.filter(c => {
        if (!c.lastContactedAt) return true;
        const daysSince = Math.floor((Date.now() - new Date(c.lastContactedAt + 'T00:00:00').getTime()) / 86400000);
        return daysSince > threshold;
      }).sort((a, b) => {
        const aDate = a.lastContactedAt || '1900-01-01';
        const bDate = b.lastContactedAt || '1900-01-01';
        return aDate.localeCompare(bDate);
      });
      return { id, role: 'assistant', content: `Found **${results.length} contacts** not contacted in ${threshold}+ days:`, timestamp, contactResults: results.slice(0, 20) };
    }

    // Deals by stage
    const stageMatch = q.match(/deals?\s+(?:in|at|with)\s+(?:the\s+)?(.+?)(?:\s+stage)?$/i)
      || q.match(/(.+?)\s+(?:stage\s+)?deals?/i);
    if (stageMatch && (q.includes('deal') || q.includes('pipeline'))) {
      const stageQuery = stageMatch[1].trim().toLowerCase();
      const stageMap: Record<string, string> = {
        'prospect': 'prospect', 'prospecting': 'prospect',
        'qualifying': 'qualifying', 'qualification': 'qualifying',
        'touring': 'touring', 'tour': 'touring',
        'loi': 'loi', 'letter of intent': 'loi',
        'negotiation': 'negotiation', 'negotiating': 'negotiation',
        'under contract': 'under_contract', 'contract': 'under_contract',
        'closed': 'closed_won', 'closed won': 'closed_won', 'won': 'closed_won',
        'closed lost': 'closed_lost', 'lost': 'closed_lost',
      };
      const matchedStage = stageMap[stageQuery];
      if (matchedStage) {
        const results = deals.filter(d => d.stage === matchedStage);
        const totalValue = results.reduce((sum, d) => sum + d.dealValue, 0);
        return { id, role: 'assistant', content: `Found **${results.length} deals** in ${stageQuery} stage (total value: $${formatValue(totalValue)}):`, timestamp, dealResults: results.slice(0, 15) };
      }
    }

    // High priority contacts
    if ((q.includes('high priority') || q.includes('important') || q.includes('vip')) && (q.includes('contact') || q.includes('people') || q.includes('who'))) {
      const results = contacts.filter(c => c.priority === 'high');
      return { id, role: 'assistant', content: `You have **${results.length} high priority contacts**:`, timestamp, contactResults: results.slice(0, 20) };
    }

    // Stats / summary / how am I doing
    if (q.includes('stats') || q.includes('summary') || q.includes('overview') || q.includes('how am i doing') || q.includes('dashboard')) {
      const activeDeals = deals.filter(d => !['closed_won', 'closed_lost'].includes(d.stage));
      const pipelineValue = activeDeals.reduce((sum, d) => sum + d.dealValue, 0);
      const pendingReminders = reminders.filter(r => r.status === 'pending').length;
      const overdueReminders = reminders.filter(r => r.status === 'pending' && r.dueDate < new Date().toISOString().split('T')[0]).length;
      const recentActivities = activities.filter(a => a.date >= new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]).length;

      return {
        id, role: 'assistant', timestamp,
        content: `Here's your snapshot:\n\n• **${contacts.length}** total contacts\n• **${activeDeals.length}** active deals ($${formatValue(pipelineValue)} pipeline)\n• **${pendingReminders}** pending follow-ups (${overdueReminders} overdue)\n• **${recentActivities}** activities this week\n• **${coldContacts.length}** contacts going cold (14+ days)\n• **${stalledDeals.length}** stalled deals (10+ days no activity)`,
      };
    }

    // General contact name search
    const nameSearchMatch = q.match(/(?:find|search|show|look up|who is)\s+(?:me\s+)?(.+)/i);
    if (nameSearchMatch) {
      const term = nameSearchMatch[1].trim().toLowerCase();
      const results = contacts.filter(c =>
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(term) ||
        c.company.toLowerCase().includes(term) ||
        (c.email || '').toLowerCase().includes(term) ||
        (c.address || '').toLowerCase().includes(term) ||
        (c.submarket || '').toLowerCase().includes(term) ||
        c.marketArea.toLowerCase().includes(term)
      );
      if (results.length > 0) {
        return { id, role: 'assistant', content: `Found **${results.length} results** for "${nameSearchMatch[1].trim()}":`, timestamp, contactResults: results.slice(0, 20) };
      }
      return { id, role: 'assistant', content: `No results found for "${nameSearchMatch[1].trim()}". Try a different name, company, or location.`, timestamp };
    }

    // Fallback
    return {
      id, role: 'assistant', timestamp,
      content: `I can help you search and navigate your CRM. Try asking things like:\n\n• "Show me contacts in Bellevue"\n• "Find contacts at Amazon"\n• "Who haven't I contacted in 30 days?"\n• "What deals are in LOI stage?"\n• "Give me a stats summary"\n• "High priority contacts"`,
    };
  };

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: chatInput.trim(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    const response = processCommand(chatInput);
    setTimeout(() => {
      setMessages(prev => [...prev, response]);
    }, 300);
    setChatInput('');
  };

  const typeIcons: Record<string, React.ElementType> = {
    follow_up: Mail,
    deal_risk: AlertTriangle,
    opportunity: TrendingUp,
    reminder: Bell,
    outreach: UserPlus,
  };

  const typeColors: Record<string, string> = {
    follow_up: 'border-l-blue-400 bg-blue-50/30',
    deal_risk: 'border-l-red-400 bg-red-50/30',
    opportunity: 'border-l-green-400 bg-green-50/30',
    reminder: 'border-l-amber-400 bg-amber-50/30',
    outreach: 'border-l-purple-400 bg-purple-50/30',
  };

  const generateDraftEmail = (suggestion: AISuggestion) => {
    const contact = suggestion.contactId ? getContact(suggestion.contactId) : null;
    if (!contact) return '';

    if (suggestion.type === 'follow_up') {
      return `Hi ${contact.firstName},\n\nHope you're doing well. I wanted to circle back on our recent conversation about your space requirements${contact.marketArea ? ` in the ${contact.marketArea} area` : ''}.\n\nI've been keeping an eye on the market and have a couple of options that might be a good fit. Would you have time for a quick call this week to discuss?\n\nBest,\nCarter`;
    }
    if (suggestion.type === 'deal_risk') {
      return `Hi ${contact.firstName},\n\nJust wanted to touch base on where things stand. I know there are a lot of moving pieces, and I want to make sure we're staying on track.\n\nLet me know if there's anything you need from my end or if your timeline has shifted at all.\n\nBest,\nCarter`;
    }
    if (suggestion.type === 'outreach') {
      return `Hi ${contact.firstName},\n\nFollowing up on our earlier discussion. I wanted to make sure this stays on your radar — happy to move things forward whenever you're ready.\n\nWould it help to schedule a quick call to go over next steps?\n\nBest,\nCarter`;
    }
    return `Hi ${contact.firstName},\n\nWanted to reach out and see how things are going. Let me know if there's anything I can help with.\n\nBest,\nCarter`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-6 pb-3">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles size={18} className="text-amber-500" />
              AI Assistant
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Ask questions, search your CRM, and get proactive suggestions
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Zap size={12} className="text-amber-500" />
            {suggestions.length} suggestions
          </div>
        </div>

        {/* Tab Toggle */}
        <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit mt-4">
          <button
            onClick={() => setActiveTab('chat')}
            className={`text-xs px-4 py-1.5 rounded-md transition-colors ${
              activeTab === 'chat' ? 'bg-white shadow-sm text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Chat
          </button>
          <button
            onClick={() => setActiveTab('suggestions')}
            className={`text-xs px-4 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              activeTab === 'suggestions' ? 'bg-white shadow-sm text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Suggestions
            {suggestions.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{suggestions.length}</span>
            )}
          </button>
        </div>
      </div>

      {/* ─── CHAT TAB ─────────────────────────────────────────────────── */}
      {activeTab === 'chat' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 space-y-4 pb-4">
            {messages.map(msg => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Sparkles size={13} className="text-amber-600" />
                  </div>
                )}
                <div className={`max-w-[80%] ${msg.role === 'user' ? 'bg-[hsl(215,65%,45%)] text-white rounded-2xl rounded-br-sm px-4 py-2.5' : ''}`}>
                  {msg.role === 'assistant' ? (
                    <div className="space-y-2">
                      <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                        {msg.content.split(/(\*\*.*?\*\*)/).map((part, i) =>
                          part.startsWith('**') && part.endsWith('**')
                            ? <strong key={i}>{part.slice(2, -2)}</strong>
                            : <span key={i}>{part}</span>
                        )}
                      </div>
                      {/* Contact results */}
                      {msg.contactResults && msg.contactResults.length > 0 && (
                        <div className="space-y-1 mt-2">
                          {msg.contactResults.map(c => (
                            <div
                              key={c.id}
                              onClick={() => onNavigateToContact?.(c.id)}
                              className="flex items-center gap-3 p-2 rounded-lg bg-white border border-border/50 hover:bg-muted/50 cursor-pointer transition-colors"
                            >
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                                c.priority === 'high' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                              }`}>{c.firstName[0]}{c.lastName[0]}</div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-[hsl(215,65%,45%)]">{c.firstName} {c.lastName}</div>
                                <div className="text-[11px] text-muted-foreground truncate">{c.company}{c.marketArea ? ` · ${c.marketArea}` : ''}</div>
                              </div>
                              <ArrowRight size={12} className="text-muted-foreground flex-shrink-0" />
                            </div>
                          ))}
                          {msg.contactResults.length >= 20 && (
                            <div className="text-[11px] text-muted-foreground text-center py-1">Showing first 20 results</div>
                          )}
                        </div>
                      )}
                      {/* Deal results */}
                      {msg.dealResults && msg.dealResults.length > 0 && (
                        <div className="space-y-1 mt-2">
                          {msg.dealResults.map(d => {
                            const contact = d.contactId ? getContact(d.contactId) : null;
                            return (
                              <div
                                key={d.id}
                                onClick={() => contact ? onNavigateToContact?.(d.contactId) : undefined}
                                className="flex items-center gap-3 p-2 rounded-lg bg-white border border-border/50 hover:bg-muted/50 cursor-pointer transition-colors"
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium">{d.name}</div>
                                  <div className="text-[11px] text-muted-foreground truncate">{d.propertyAddress}{contact ? ` · ${contact.firstName} ${contact.lastName}` : ''}</div>
                                </div>
                                <span className="text-xs font-medium text-green-700">${formatValue(d.dealValue)}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm">{msg.content}</div>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-[hsl(215,65%,45%)] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User size={13} className="text-white" />
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="px-6 py-4 border-t border-border bg-white">
            <div className="flex gap-2">
              <Input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                placeholder="Ask about contacts, deals, pipeline..."
                className="flex-1 h-10"
              />
              <Button onClick={handleSendMessage} disabled={!chatInput.trim()} className="h-10 px-4 bg-[hsl(215,65%,45%)] hover:bg-[hsl(215,65%,40%)]">
                <Send size={15} />
              </Button>
            </div>
            <div className="flex gap-2 mt-2 flex-wrap">
              {['Stats summary', 'Cold contacts', 'Contacts in Bellevue', 'LOI deals'].map(q => (
                <button
                  key={q}
                  onClick={() => { setChatInput(q); }}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── SUGGESTIONS TAB ─────────────────────────────────────────── */}
      {activeTab === 'suggestions' && (
        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-red-200 bg-red-50/30">
              <CardContent className="py-3 px-4">
                <div className="text-xs text-red-600 font-medium">Contacts Going Cold</div>
                <div className="text-2xl font-bold text-red-700 mt-1">{coldContacts.length}</div>
                <div className="text-[10px] text-red-500 mt-0.5">No contact in 14+ days</div>
              </CardContent>
            </Card>
            <Card className="border-amber-200 bg-amber-50/30">
              <CardContent className="py-3 px-4">
                <div className="text-xs text-amber-600 font-medium">Stalled Deals</div>
                <div className="text-2xl font-bold text-amber-700 mt-1">{stalledDeals.length}</div>
                <div className="text-[10px] text-amber-500 mt-0.5">No activity in 10+ days</div>
              </CardContent>
            </Card>
            <Card className="border-blue-200 bg-blue-50/30">
              <CardContent className="py-3 px-4">
                <div className="text-xs text-blue-600 font-medium">Action Items</div>
                <div className="text-2xl font-bold text-blue-700 mt-1">{highPriority.length}</div>
                <div className="text-[10px] text-blue-500 mt-0.5">High priority suggestions</div>
              </CardContent>
            </Card>
          </div>

          {/* High Priority */}
          {highPriority.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-1.5">
                <AlertTriangle size={14} /> Needs Attention Now
              </h3>
              <div className="space-y-2">
                {highPriority.map(s => (
                  <SuggestionCard
                    key={s.id}
                    suggestion={s}
                    store={store}
                    expanded={expandedId === s.id}
                    onExpand={() => setExpandedId(expandedId === s.id ? null : s.id)}
                    onDismiss={() => dismissSuggestion(s.id)}
                    onDraft={() => setDraftEmail(generateDraftEmail(s))}
                    onNavigateToContact={onNavigateToContact}
                    typeIcons={typeIcons}
                    typeColors={typeColors}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Medium Priority */}
          {mediumPriority.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-amber-700 mb-2 flex items-center gap-1.5">
                <Lightbulb size={14} /> Opportunities & Follow-Ups
              </h3>
              <div className="space-y-2">
                {mediumPriority.map(s => (
                  <SuggestionCard
                    key={s.id}
                    suggestion={s}
                    store={store}
                    expanded={expandedId === s.id}
                    onExpand={() => setExpandedId(expandedId === s.id ? null : s.id)}
                    onDismiss={() => dismissSuggestion(s.id)}
                    onDraft={() => setDraftEmail(generateDraftEmail(s))}
                    onNavigateToContact={onNavigateToContact}
                    typeIcons={typeIcons}
                    typeColors={typeColors}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Cold Contacts Section */}
          {coldContacts.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <UserPlus size={14} className="text-muted-foreground" />
                  Contacts Going Cold
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {coldContacts.slice(0, 5).map(c => {
                  const daysSince = c.lastContactedAt
                    ? Math.floor((Date.now() - new Date(c.lastContactedAt + 'T00:00:00').getTime()) / 86400000)
                    : 999;
                  return (
                    <div key={c.id} className="flex items-center gap-3 p-2 rounded hover:bg-muted/50 cursor-pointer" onClick={() => onNavigateToContact?.(c.id)}>
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600">
                        {c.firstName[0]}{c.lastName[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[hsl(215,65%,45%)] hover:underline">{c.firstName} {c.lastName}</div>
                        <div className="text-xs text-muted-foreground">{c.company}</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-xs font-medium ${daysSince > 21 ? 'text-red-600' : 'text-amber-600'}`}>
                          {daysSince}d ago
                        </div>
                        <div className="text-[10px] text-muted-foreground">{c.type}</div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {suggestions.length === 0 && (
            <div className="text-center py-12">
              <Sparkles size={32} className="mx-auto text-muted-foreground mb-3" />
              <div className="text-sm text-muted-foreground">All caught up! No suggestions right now.</div>
            </div>
          )}
        </div>
      )}

      {/* Draft Email Modal */}
      {draftEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <Card className="w-[500px] shadow-lg">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Draft Follow-Up Email</CardTitle>
                <Button size="sm" variant="ghost" onClick={() => setDraftEmail(null)}><X size={14} /></Button>
              </div>
            </CardHeader>
            <CardContent>
              <Textarea
                value={draftEmail}
                onChange={(e) => setDraftEmail(e.target.value)}
                className="min-h-[200px] text-sm"
              />
              <div className="flex justify-between mt-3">
                <div className="text-xs text-muted-foreground">Edit as needed, then copy to Outlook</div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setDraftEmail(null)}>Close</Button>
                  <Button size="sm" className="bg-[hsl(215,65%,45%)] hover:bg-[hsl(215,65%,40%)]" onClick={() => {
                    navigator.clipboard.writeText(draftEmail);
                    setDraftEmail(null);
                  }}>Copy to Clipboard</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function SuggestionCard({ suggestion, store, expanded, onExpand, onDismiss, onDraft, onNavigateToContact, typeIcons, typeColors }: {
  suggestion: AISuggestion; store: Store; expanded: boolean;
  onExpand: () => void; onDismiss: () => void; onDraft: () => void;
  onNavigateToContact?: (contactId: string) => void;
  typeIcons: Record<string, React.ElementType>;
  typeColors: Record<string, string>;
}) {
  const Icon = typeIcons[suggestion.type] || Sparkles;
  const colorClass = typeColors[suggestion.type] || '';
  const contact = suggestion.contactId ? store.getContact(suggestion.contactId) : null;
  const deal = suggestion.dealId ? store.getDeal(suggestion.dealId) : null;

  return (
    <Card className={`border-l-[3px] ${colorClass} transition-all`}>
      <CardContent className="py-3 px-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex-shrink-0">
            <Icon size={16} className="text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium cursor-pointer" onClick={onExpand}>{suggestion.title}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full capitalize ${
                suggestion.type === 'follow_up' ? 'bg-blue-100 text-blue-700' :
                suggestion.type === 'deal_risk' ? 'bg-red-100 text-red-700' :
                suggestion.type === 'opportunity' ? 'bg-green-100 text-green-700' :
                'bg-amber-100 text-amber-700'
              }`}>{suggestion.type.replace('_', ' ')}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{suggestion.description}</div>

            {expanded && (
              <div className="mt-3 space-y-2">
                {contact && (
                  <div
                    className="text-xs bg-white/60 p-2 rounded border border-border/50 cursor-pointer hover:bg-white/80"
                    onClick={() => onNavigateToContact?.(contact.id)}
                  >
                    <span className="text-muted-foreground">Contact:</span>{' '}
                    <span className="text-[hsl(215,65%,45%)] font-medium">{contact.firstName} {contact.lastName}</span> — {contact.company}
                    {contact.phone && <span className="ml-2 text-muted-foreground">({contact.phone})</span>}
                  </div>
                )}
                {deal && (
                  <div className="text-xs bg-white/60 p-2 rounded border border-border/50">
                    <span className="text-muted-foreground">Deal:</span> {deal.name} — ${formatValue(deal.dealValue)}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 mt-2">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onDraft}>
                <Mail size={11} /> Draft Email
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={onDismiss}>
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


function formatValue(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toString();
}
