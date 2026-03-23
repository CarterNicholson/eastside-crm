import { useState, useRef, useEffect } from 'react';
import { Sparkles, X, AlertTriangle, TrendingUp, UserPlus, Bell, Mail, Lightbulb, Zap, Send, Search, ArrowRight, User, Bot, Loader2 } from 'lucide-react';
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

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  contactIds?: string[];
  dealIds?: string[];
  isLoading?: boolean;
  isError?: boolean;
}

export function Assistant({ store, onNavigate, onNavigateToContact }: AssistantProps) {
  const { getActiveSuggestions, dismissSuggestion, getContact, getDeal, contacts, deals, activities, reminders } = store;
  const suggestions = getActiveSuggestions();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draftEmail, setDraftEmail] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'suggestions' | 'chat'>('chat');

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Hey Carter — I'm your AI-powered CRM assistant. I can analyze your contacts, pipeline, and activity history to give you real insights. Try asking me anything:\n\n• "Who in Woodinville should I contact based on activity history?"\n• "Which high-priority contacts am I losing touch with?"\n• "Summarize my relationship with [company name]"\n• "What deals are at risk of stalling?"\n• "Draft a follow-up email to cold contacts in Redmond"\n• "Give me my daily briefing"`,
      timestamp: new Date(),
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const highPriority = suggestions.filter(s => s.priority === 'high');
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

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isThinking) return;

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: chatInput.trim(),
      timestamp: new Date(),
    };

    const loadingMsg: ChatMessage = {
      id: `loading_${Date.now()}`,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isLoading: true,
    };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setChatInput('');
    setIsThinking(true);

    try {
      const token = localStorage.getItem('crm_token') || '';

      // Build conversation history for context
      const conversationHistory = messages
        .filter(m => m.id !== 'welcome' && !m.isLoading)
        .slice(-8)
        .map(m => ({ role: m.role, content: m.content }));

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: chatInput.trim(),
          conversationHistory,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'AI request failed');
      }

      setMessages(prev => {
        const withoutLoading = prev.filter(m => !m.isLoading);
        return [...withoutLoading, {
          id: `ai_${Date.now()}`,
          role: 'assistant',
          content: data.message,
          timestamp: new Date(),
          contactIds: data.contactIds || [],
          dealIds: data.dealIds || [],
        }];
      });
    } catch (err: any) {
      setMessages(prev => {
        const withoutLoading = prev.filter(m => !m.isLoading);
        return [...withoutLoading, {
          id: `err_${Date.now()}`,
          role: 'assistant',
          content: err.message || 'Something went wrong. Please try again.',
          timestamp: new Date(),
          isError: true,
        }];
      });
    } finally {
      setIsThinking(false);
    }
  };

  const typeIcons: Record<string, React.ElementType> = {
    follow_up: Mail, deal_risk: AlertTriangle, opportunity: TrendingUp, reminder: Bell, outreach: UserPlus,
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
    return `Hi ${contact.firstName},\n\nWanted to reach out and see how things are going. Let me know if there's anything I can help with.\n\nBest,\nCarter`;
  };

  // Render markdown-like formatting
  const renderContent = (text: string) => {
    return text.split('\n').map((line, i) => {
      // Render bold
      const parts = line.split(/(\*\*.*?\*\*)/).map((part, j) =>
        part.startsWith('**') && part.endsWith('**')
          ? <strong key={j}>{part.slice(2, -2)}</strong>
          : <span key={j}>{part}</span>
      );

      // Bullet points
      if (line.trim().startsWith('- ') || line.trim().startsWith('• ')) {
        return <div key={i} className="flex gap-2 ml-2"><span className="text-muted-foreground">•</span><span>{parts}</span></div>;
      }

      return <div key={i}>{line === '' ? <br /> : parts}</div>;
    });
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
              Powered by Claude — ask anything about your CRM
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Zap size={12} className="text-amber-500" />
            {suggestions.length} suggestions
          </div>
        </div>

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
          <div className="flex-1 overflow-y-auto px-6 space-y-4 pb-4">
            {messages.map(msg => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    {msg.isLoading ? (
                      <Loader2 size={13} className="text-amber-600 animate-spin" />
                    ) : (
                      <Sparkles size={13} className="text-amber-600" />
                    )}
                  </div>
                )}
                <div className={`max-w-[80%] ${msg.role === 'user' ? 'bg-[hsl(215,65%,45%)] text-white rounded-2xl rounded-br-sm px-4 py-2.5' : ''}`}>
                  {msg.isLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                      <span>Thinking</span>
                      <span className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                    </div>
                  ) : msg.role === 'assistant' ? (
                    <div className="space-y-2">
                      <div className={`text-sm leading-relaxed ${msg.isError ? 'text-red-600' : 'text-foreground'}`}>
                        {renderContent(msg.content)}
                      </div>

                      {/* Clickable contact cards */}
                      {msg.contactIds && msg.contactIds.length > 0 && (
                        <div className="space-y-1 mt-3">
                          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Referenced Contacts</div>
                          {msg.contactIds.map(cId => {
                            const c = contacts.find(x => x.id === cId);
                            if (!c) return null;
                            return (
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
                            );
                          })}
                        </div>
                      )}

                      {/* Clickable deal cards */}
                      {msg.dealIds && msg.dealIds.length > 0 && (
                        <div className="space-y-1 mt-3">
                          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Referenced Deals</div>
                          {msg.dealIds.map(dId => {
                            const d = deals.find(x => x.id === dId);
                            if (!d) return null;
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
                disabled={isThinking}
              />
              <Button onClick={handleSendMessage} disabled={!chatInput.trim() || isThinking} className="h-10 px-4 bg-[hsl(215,65%,45%)] hover:bg-[hsl(215,65%,40%)]">
                {isThinking ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              </Button>
            </div>
            <div className="flex gap-2 mt-2 flex-wrap">
              {[
                'Daily briefing',
                'Cold high-priority contacts',
                'Who in Woodinville should I reach out to?',
                'Stalled deals',
                'Draft outreach for Bellevue prospects',
              ].map(q => (
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

          {/* Cold Contacts */}
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
          <div className="mt-0.5 flex-shrink-0"><Icon size={16} className="text-muted-foreground" /></div>
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
                  <div className="text-xs bg-white/60 p-2 rounded border border-border/50 cursor-pointer hover:bg-white/80" onClick={() => onNavigateToContact?.(contact.id)}>
                    <span className="text-muted-foreground">Contact:</span>{' '}
                    <span className="text-[hsl(215,65%,45%)] font-medium">{contact.firstName} {contact.lastName}</span> — {contact.company}
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
