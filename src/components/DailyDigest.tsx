import { Calendar, TrendingUp, AlertTriangle, Users, DollarSign, CheckCircle2, Clock, ChevronDown, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Store } from '../store';
import { DEAL_STAGES } from '../types';

interface DailyDigestProps {
  store: Store;
}

export function DailyDigest({ store }: DailyDigestProps) {
  const { contacts, deals, activities, reminders, stats, getActiveSuggestions, getContact } = store;
  const suggestions = getActiveSuggestions();
  const today = new Date().toISOString().split('T')[0];

  const overdueReminders = reminders.filter(r => r.status === 'pending' && r.dueDate < today);
  const todayReminders = reminders.filter(r => r.status === 'pending' && r.dueDate === today);
  const upcomingReminders = reminders.filter(r => r.status === 'pending' && r.dueDate > today && r.dueDate <= daysFromNow(3));

  const coldContacts = contacts.filter(c => {
    if (!c.lastContactedAt) return true;
    const daysSince = Math.floor((Date.now() - new Date(c.lastContactedAt + 'T00:00:00').getTime()) / 86400000);
    return daysSince > 14 && c.priority !== 'low';
  });

  const dealsAtRisk = deals.filter(d => {
    if (['closed_won', 'closed_lost'].includes(d.stage)) return false;
    const daysSinceUpdate = Math.floor((Date.now() - new Date(d.updatedAt + 'T00:00:00').getTime()) / 86400000);
    return daysSinceUpdate > 7;
  });

  const recentWins = deals.filter(d => d.stage === 'closed_won');
  const activeDeals = deals.filter(d => !['closed_won', 'closed_lost'].includes(d.stage));
  const weekActivities = activities.filter(a => a.date >= daysAgo(7));

  return (
    <div className="p-6 max-w-[800px] space-y-6">
      {/* Header */}
      <div className="border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <Calendar size={18} className="text-[hsl(215,65%,45%)]" />
          <h2 className="text-lg font-semibold">Daily Digest</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      {/* Morning Briefing */}
      <Card className="bg-[hsl(215,65%,45%)]/5 border-[hsl(215,65%,45%)]/20">
        <CardContent className="py-4 px-5">
          <div className="text-sm font-semibold text-[hsl(215,65%,45%)] mb-2">Morning Briefing</div>
          <div className="text-sm text-foreground leading-relaxed">
            Good {getGreeting()}, Carter. You have <strong>{overdueReminders.length + todayReminders.length} follow-ups</strong> needing attention today
            {overdueReminders.length > 0 && <span className="text-red-600"> ({overdueReminders.length} overdue)</span>}.
            Your pipeline sits at <strong>${formatValue(stats.pipelineValue)}</strong> across <strong>{stats.activeDeals} active deals</strong>.
            {coldContacts.length > 0 && <span> Watch out — <strong>{coldContacts.length} contacts</strong> are going cold.</span>}
            {dealsAtRisk.length > 0 && <span> And <strong>{dealsAtRisk.length} deals</strong> haven't had activity in over a week.</span>}
          </div>
        </CardContent>
      </Card>

      {/* Key Numbers */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white border border-border rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-foreground">{stats.activeDeals}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">Active Deals</div>
        </div>
        <div className="bg-white border border-border rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-foreground">${formatValue(stats.pipelineValue)}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">Pipeline</div>
        </div>
        <div className="bg-white border border-border rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-foreground">{weekActivities.length}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">Activities (7d)</div>
        </div>
        <div className="bg-white border border-border rounded-lg p-3 text-center">
          <div className={`text-2xl font-bold ${overdueReminders.length > 0 ? 'text-red-600' : 'text-green-600'}`}>{overdueReminders.length}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">Overdue</div>
        </div>
      </div>

      {/* Today's Action Items */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Clock size={14} className="text-amber-500" />
            Today's Action Items
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {[...overdueReminders, ...todayReminders].length === 0 && (
            <div className="text-sm text-muted-foreground py-3 text-center">No urgent action items today</div>
          )}
          {[...overdueReminders, ...todayReminders].map((r, i) => {
            const contact = getContact(r.contactId);
            const isOverdue = r.dueDate < today;
            return (
              <div key={r.id} className={`flex items-start gap-3 p-2.5 rounded text-sm ${isOverdue ? 'bg-red-50 border border-red-200' : 'bg-muted/40'}`}>
                <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">{i + 1}</span>
                <div className="flex-1">
                  <div className="font-medium">{r.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {contact?.firstName} {contact?.lastName} · {contact?.company}
                    {isOverdue && <span className="text-red-600 font-medium ml-2">Overdue</span>}
                  </div>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  r.priority === 'high' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                }`}>{r.priority}</span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Upcoming (Next 3 Days) */}
      {upcomingReminders.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Calendar size={14} className="text-muted-foreground" />
              Coming Up (Next 3 Days)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {upcomingReminders.map(r => {
              const contact = getContact(r.contactId);
              return (
                <div key={r.id} className="flex items-center gap-3 p-2 rounded bg-muted/30 text-sm">
                  <div className="flex-1">
                    <div className="font-medium">{r.title}</div>
                    <div className="text-xs text-muted-foreground">{contact?.firstName} {contact?.lastName}</div>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDate(r.dueDate)}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* AI Suggestions Summary */}
      {suggestions.length > 0 && (
        <Card className="border-amber-200/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Sparkles size={14} className="text-amber-500" />
              AI Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {suggestions.slice(0, 4).map(s => (
              <div key={s.id} className={`flex items-start gap-3 p-2.5 rounded text-sm border-l-2 ${
                s.priority === 'high' ? 'border-l-red-400 bg-red-50/20' : 'border-l-amber-400 bg-amber-50/20'
              }`}>
                <div className="flex-1">
                  <div className="font-medium">{s.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.description}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Deals At Risk */}
      {dealsAtRisk.length > 0 && (
        <Card className="border-red-200/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-700">
              <AlertTriangle size={14} />
              Deals Needing Attention
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {dealsAtRisk.map(d => {
              const contact = getContact(d.contactId);
              const daysSince = Math.floor((Date.now() - new Date(d.updatedAt + 'T00:00:00').getTime()) / 86400000);
              const stage = DEAL_STAGES.find(s => s.key === d.stage);
              return (
                <div key={d.id} className="flex items-center gap-3 p-2.5 rounded bg-red-50/30 text-sm">
                  <div className="w-2 h-8 rounded-full" style={{ background: stage?.color }} />
                  <div className="flex-1">
                    <div className="font-medium">{d.name}</div>
                    <div className="text-xs text-muted-foreground">{contact?.company} · {stage?.label} · ${formatValue(d.dealValue)}</div>
                  </div>
                  <span className="text-xs text-red-600 font-medium">{daysSince}d stale</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Footer */}
      <div className="text-xs text-muted-foreground text-center pt-4 border-t border-border">
        Generated by Eastside CRM AI · {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
      </div>
    </div>
  );
}


function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
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
  if (diff < 0) return `In ${Math.abs(diff)}d`;
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function daysAgo(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function daysFromNow(n: number): string {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}
