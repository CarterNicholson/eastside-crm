import { useState } from 'react';
import { Sparkles, X, ChevronRight, AlertTriangle, TrendingUp, UserPlus, Bell, Mail, Check, ExternalLink, Lightbulb, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import type { Store } from '../store';
import type { AISuggestion, Contact, Deal } from '../types';
import { DEAL_STAGES } from '../types';
import type { Page } from './Sidebar';

interface AssistantProps {
  store: Store;
  onNavigate: (page: Page) => void;
}

export function Assistant({ store, onNavigate }: AssistantProps) {
  const { getActiveSuggestions, dismissSuggestion, getContact, getDeal, contacts, deals } = store;
  const suggestions = getActiveSuggestions();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draftEmail, setDraftEmail] = useState<string | null>(null);

  const highPriority = suggestions.filter(s => s.priority === 'high');
  const mediumPriority = suggestions.filter(s => s.priority === 'medium');
  const lowPriority = suggestions.filter(s => s.priority === 'low');

  // Generate smart insights
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
    <div className="p-6 max-w-[900px] space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles size={18} className="text-amber-500" />
            AI Assistant
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Proactive suggestions to keep your deals moving and contacts engaged
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Zap size={12} className="text-amber-500" />
          {suggestions.length} active suggestions
        </div>
      </div>

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
                <div key={c.id} className="flex items-center gap-3 p-2 rounded hover:bg-muted/50">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600">
                    {c.firstName[0]}{c.lastName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{c.firstName} {c.lastName}</div>
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

      {suggestions.length === 0 && (
        <div className="text-center py-12">
          <Sparkles size={32} className="mx-auto text-muted-foreground mb-3" />
          <div className="text-sm text-muted-foreground">All caught up! No suggestions right now.</div>
        </div>
      )}
    </div>
  );
}

function SuggestionCard({ suggestion, store, expanded, onExpand, onDismiss, onDraft, typeIcons, typeColors }: {
  suggestion: AISuggestion; store: Store; expanded: boolean;
  onExpand: () => void; onDismiss: () => void; onDraft: () => void;
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
                  <div className="text-xs bg-white/60 p-2 rounded border border-border/50">
                    <span className="text-muted-foreground">Contact:</span> {contact.firstName} {contact.lastName} — {contact.company}
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
