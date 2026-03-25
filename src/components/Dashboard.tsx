import { useState, useEffect } from 'react';
import { TrendingUp, Users, DollarSign, Activity, AlertTriangle, ArrowRight, Clock, Loader2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { Store } from '../store';
import type { Page } from './Sidebar';
import { DEAL_STAGES } from '../types';

interface DashboardProps {
  store: Store;
  onNavigate: (page: Page) => void;
}

export function Dashboard({ store, onNavigate }: DashboardProps) {
  const { contacts, deals, activities, reminders, stats, getActiveSuggestions, getContact } = store;
  const activeSuggestions = getActiveSuggestions();

  const pendingReminders = reminders.filter(r => r.status === 'pending');
  const overdueReminders = pendingReminders.filter(r => r.dueDate < new Date().toISOString().split('T')[0]);
  const todayReminders = pendingReminders.filter(r => r.dueDate === new Date().toISOString().split('T')[0]);
  const recentActivities = activities.slice(0, 5);

  const activeDeals = deals.filter(d => !['closed_won', 'closed_lost'].includes(d.stage));
  const highPriorityDeals = activeDeals.filter(d => d.probability >= 40).sort((a, b) => b.dealValue - a.dealValue);

  // AI Briefing state
  const [briefing, setBriefing] = useState<string | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState<string | null>(null);

  const loadBriefing = async () => {
    setBriefingLoading(true);
    setBriefingError(null);
    try {
      const token = localStorage.getItem('crm_token') || '';
      const res = await fetch('/api/ai/briefing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load briefing');
      setBriefing(data.briefing);
    } catch (err: any) {
      setBriefingError(err.message);
    } finally {
      setBriefingLoading(false);
    }
  };

  // Auto-load briefing on mount
  useEffect(() => {
    if (!store.isLoading && contacts.length > 0) {
      loadBriefing();
    }
  }, [store.isLoading]);

  const renderBriefing = (text: string) => {
    return text.split('\n').map((line, i) => {
      const parts = line.split(/(\*\*.*?\*\*)/).map((part, j) =>
        part.startsWith('**') && part.endsWith('**')
          ? <strong key={j}>{part.slice(2, -2)}</strong>
          : <span key={j}>{part}</span>
      );
      if (line.trim().startsWith('- ') || line.trim().startsWith('• ')) {
        return <div key={i} className="flex gap-2 ml-1"><span className="text-amber-500">•</span><span className="text-sm">{parts}</span></div>;
      }
      return <div key={i} className="text-sm">{line === '' ? <br /> : parts}</div>;
    });
  };

  return (
    <div className="p-8 space-y-7 max-w-[1400px]">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Good {getGreeting()}, Carter</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      {/* AI Daily Briefing */}
      <div className="rounded-2xl p-5 border border-amber-200/60"
        style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.06) 0%, rgba(249,115,22,0.04) 100%)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, hsl(38, 92%, 50%), hsl(25, 95%, 53%))' }}>
              <Sparkles size={13} className="text-white" />
            </div>
            <span className="text-sm font-semibold text-foreground">AI Daily Briefing</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground" onClick={loadBriefing} disabled={briefingLoading}>
              <RefreshCw size={11} className={briefingLoading ? 'animate-spin' : ''} /> Refresh
            </Button>
            <button onClick={() => onNavigate('assistant')} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium">
              Open Assistant <ArrowRight size={12} />
            </button>
          </div>
        </div>
        {briefingLoading && !briefing && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
            <Loader2 size={14} className="animate-spin text-amber-500" />
            Generating your daily briefing...
          </div>
        )}
        {briefingError && !briefing && (
          <div className="text-sm text-muted-foreground py-2">
            {briefingError.includes('not configured')
              ? 'Add your ANTHROPIC_API_KEY in Railway to enable AI briefings.'
              : 'Could not load briefing. Click refresh to try again.'}
          </div>
        )}
        {briefing && (
          <div className="space-y-1 leading-relaxed">
            {renderBriefing(briefing)}
          </div>
        )}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={Kanban} label="Active Deals" value={stats.activeDeals} sub={`$${formatValue(stats.pipelineValue)} pipeline`} color="blue" />
        <StatCard icon={Users} label="Contacts" value={contacts.length} sub={`${contacts.filter(c => c.type === 'prospect').length} prospects`} color="teal" />
        <StatCard icon={Activity} label="Activities (7d)" value={stats.activitiesThisWeek} sub={`${activities.filter(a => a.type === 'tour').length} tours`} color="amber" />
        <StatCard icon={Bell} label="Pending Follow-Ups" value={pendingReminders.length} sub={overdueReminders.length > 0 ? `${overdueReminders.length} overdue` : 'None overdue'} color={overdueReminders.length > 0 ? 'red' : 'green'} />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-5 gap-5">
        {/* Left column — 3/5 */}
        <div className="col-span-3 space-y-5">
          {/* Pipeline Summary */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Pipeline Overview</CardTitle>
                <button onClick={() => onNavigate('pipeline')} className="text-xs text-[hsl(215,65%,45%)] hover:underline flex items-center gap-1">
                  Open Pipeline <ArrowRight size={12} />
                </button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {DEAL_STAGES.filter(s => !['closed_won', 'closed_lost'].includes(s.key)).map(stage => {
                  const stageDeals = deals.filter(d => d.stage === stage.key);
                  const stageValue = stageDeals.reduce((s, d) => s + d.dealValue, 0);
                  return (
                    <div key={stage.key} className="flex items-center gap-3 text-sm">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: stage.color }} />
                      <span className="w-28 text-muted-foreground">{stage.label}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${Math.min(100, (stageDeals.length / Math.max(1, activeDeals.length)) * 100)}%`, background: stage.color }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-16 text-right">{stageDeals.length} deal{stageDeals.length !== 1 ? 's' : ''}</span>
                      <span className="text-xs font-medium w-20 text-right">${formatValue(stageValue)}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Hot Deals */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Hot Deals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {highPriorityDeals.slice(0, 4).map(deal => {
                  const contact = getContact(deal.contactId);
                  const stage = DEAL_STAGES.find(s => s.key === deal.stage);
                  return (
                    <div key={deal.id} className="flex items-center gap-3 p-2 rounded hover:bg-muted/50 transition-colors">
                      <div className="w-2 h-8 rounded-full" style={{ background: stage?.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{deal.name}</div>
                        <div className="text-xs text-muted-foreground">{contact?.company} — {stage?.label}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">${formatValue(deal.dealValue)}</div>
                        <div className="text-[10px] text-muted-foreground">{deal.probability}% prob</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column — 2/5 */}
        <div className="col-span-2 space-y-5">
          {/* Today's Follow-Ups */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Clock size={14} className="text-muted-foreground" />
                  Today's Follow-Ups
                </CardTitle>
                <button onClick={() => onNavigate('reminders')} className="text-xs text-[hsl(215,65%,45%)] hover:underline">View All</button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {[...overdueReminders, ...todayReminders].slice(0, 5).map(r => {
                const contact = getContact(r.contactId);
                const isOverdue = r.dueDate < new Date().toISOString().split('T')[0];
                return (
                  <div key={r.id} className={`p-2.5 rounded text-sm ${isOverdue ? 'bg-red-50 border border-red-200' : 'bg-muted/50'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-foreground truncate">{r.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{contact?.firstName} {contact?.lastName} — {contact?.company}</div>
                      </div>
                      {isOverdue && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded whitespace-nowrap">Overdue</span>}
                    </div>
                  </div>
                );
              })}
              {overdueReminders.length === 0 && todayReminders.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-4">No follow-ups due today</div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentActivities.map(a => {
                  const contact = getContact(a.contactId);
                  return (
                    <div key={a.id} className="flex items-start gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-medium ${
                        a.type === 'tour' ? 'bg-blue-100 text-blue-700' :
                        a.type === 'call' ? 'bg-green-100 text-green-700' :
                        a.type === 'email' ? 'bg-gray-100 text-gray-600' :
                        a.type === 'loi_sent' ? 'bg-amber-100 text-amber-700' :
                        'bg-purple-100 text-purple-700'
                      }`}>
                        {a.type[0].toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm truncate">{a.subject}</div>
                        <div className="text-xs text-muted-foreground">{contact?.firstName} {contact?.lastName} · {formatDate(a.date)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────

function Sparkles({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" /><path d="M19 17v4" /><path d="M3 5h4" /><path d="M17 19h4" />
    </svg>
  );
}

function Kanban({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 5v11" /><path d="M12 5v6" /><path d="M18 5v14" />
    </svg>
  );
}

function Bell({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: number; sub: string;
  color: 'blue' | 'teal' | 'amber' | 'red' | 'green';
}) {
  const gradients: Record<string, string> = {
    blue: 'linear-gradient(135deg, hsl(220, 70%, 55%), hsl(250, 60%, 50%))',
    teal: 'linear-gradient(135deg, hsl(160, 50%, 42%), hsl(170, 55%, 35%))',
    amber: 'linear-gradient(135deg, hsl(38, 92%, 50%), hsl(25, 95%, 53%))',
    red: 'linear-gradient(135deg, hsl(0, 65%, 51%), hsl(350, 70%, 45%))',
    green: 'linear-gradient(135deg, hsl(150, 50%, 42%), hsl(160, 55%, 38%))',
  };
  return (
    <div className="premium-card rounded-xl p-5 relative overflow-hidden">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{label}</div>
          <div className="text-2xl font-bold mt-1.5 text-foreground tracking-tight">{value.toLocaleString()}</div>
          <div className="text-[11px] text-muted-foreground mt-1 font-medium">{sub}</div>
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm" style={{ background: gradients[color] }}>
          <Icon size={18} className="text-white" />
        </div>
      </div>
    </div>
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
  if (diff < 7) return `${diff}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
