import { useState } from 'react';
import { Plus, MoreHorizontal, Calendar, DollarSign, ChevronDown, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Store } from '../store';
import type { Deal, DealStage, PropertyType } from '../types';
import { DEAL_STAGES, PROPERTY_TYPES } from '../types';

interface PipelineProps {
  store: Store;
}

export function Pipeline({ store }: PipelineProps) {
  const { deals, contacts, moveDealStage, getContact, addDeal, updateDeal, getDealActivities, addActivity } = store;
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [showAddDeal, setShowAddDeal] = useState(false);
  const [dragDealId, setDragDealId] = useState<string | null>(null);

  const visibleStages = DEAL_STAGES.filter(s => s.key !== 'closed_lost');

  const totalPipeline = deals
    .filter(d => !['closed_won', 'closed_lost'].includes(d.stage))
    .reduce((s, d) => s + d.dealValue, 0);

  const weightedPipeline = deals
    .filter(d => !['closed_won', 'closed_lost'].includes(d.stage))
    .reduce((s, d) => s + (d.dealValue * d.probability / 100), 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-white">
        <div>
          <h2 className="text-lg font-semibold">Deal Pipeline</h2>
          <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
            <span>Total: <strong className="text-foreground">${formatValue(totalPipeline)}</strong></span>
            <span>Weighted: <strong className="text-foreground">${formatValue(weightedPipeline)}</strong></span>
            <span>{deals.filter(d => !['closed_won', 'closed_lost'].includes(d.stage)).length} active deals</span>
          </div>
        </div>
        <Button size="sm" onClick={() => setShowAddDeal(true)} className="gap-1.5 bg-[hsl(215,65%,45%)] hover:bg-[hsl(215,65%,40%)]">
          <Plus size={14} /> New Deal
        </Button>
      </div>

      {/* Pipeline Board */}
      <div className="flex-1 overflow-x-auto p-4">
        <div className="flex gap-3 h-full min-w-max">
          {visibleStages.map(stage => {
            const stageDeals = deals.filter(d => d.stage === stage.key);
            const stageValue = stageDeals.reduce((s, d) => s + d.dealValue, 0);
            return (
              <div
                key={stage.key}
                className="w-[280px] flex flex-col bg-muted/30 rounded-lg"
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('bg-muted/60'); }}
                onDragLeave={(e) => { e.currentTarget.classList.remove('bg-muted/60'); }}
                onDrop={(e) => {
                  e.currentTarget.classList.remove('bg-muted/60');
                  if (dragDealId) {
                    moveDealStage(dragDealId, stage.key);
                    setDragDealId(null);
                  }
                }}
              >
                {/* Stage Header */}
                <div className="px-3 py-2.5 border-b border-border/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: stage.color }} />
                      <span className="text-sm font-semibold">{stage.label}</span>
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{stageDeals.length}</span>
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">${formatValue(stageValue)}</div>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {stageDeals.map(deal => {
                    const contact = getContact(deal.contactId);
                    return (
                      <div
                        key={deal.id}
                        className="pipeline-card bg-white p-3 rounded border border-border cursor-pointer"
                        draggable
                        onDragStart={() => setDragDealId(deal.id)}
                        onDragEnd={() => setDragDealId(null)}
                        onClick={() => setSelectedDeal(deal)}
                      >
                        <div className="text-sm font-medium leading-tight">{deal.name}</div>
                        <div className="text-xs text-muted-foreground mt-1">{contact?.company}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">{deal.propertyAddress}</div>
                        <div className="flex items-center justify-between mt-2.5">
                          <span className="text-sm font-semibold text-foreground">${formatValue(deal.dealValue)}</span>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>{deal.squareFeet.toLocaleString()} SF</span>
                            <span className="px-1.5 py-0.5 rounded bg-muted">{deal.probability}%</span>
                          </div>
                        </div>
                        {deal.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {deal.tags.slice(0, 3).map(tag => (
                              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{tag}</span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground">
                          <Calendar size={10} />
                          <span>Close: {new Date(deal.expectedCloseDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        </div>
                      </div>
                    );
                  })}
                  {stageDeals.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-8">No deals</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Deal Detail Sheet */}
      {selectedDeal && (
        <DealDetailSheet
          deal={selectedDeal}
          store={store}
          onClose={() => setSelectedDeal(null)}
          onUpdate={(updates) => {
            updateDeal(selectedDeal.id, updates);
            setSelectedDeal({ ...selectedDeal, ...updates });
          }}
        />
      )}

      {/* Add Deal Dialog */}
      <AddDealDialog
        open={showAddDeal}
        onOpenChange={setShowAddDeal}
        store={store}
        onSave={(data) => { addDeal(data); setShowAddDeal(false); }}
      />
    </div>
  );
}

function DealDetailSheet({ deal, store, onClose, onUpdate }: {
  deal: Deal; store: Store; onClose: () => void; onUpdate: (updates: Partial<Deal>) => void;
}) {
  const contact = store.getContact(deal.contactId);
  const activities = store.getDealActivities(deal.id);
  const stage = DEAL_STAGES.find(s => s.key === deal.stage);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/20" onClick={onClose} />
      <div className="w-[480px] bg-white shadow-lg overflow-y-auto border-l border-border">
        <div className="p-5 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold">{deal.name}</h3>
              <div className="text-sm text-muted-foreground">{contact?.firstName} {contact?.lastName} — {contact?.company}</div>
            </div>
            <Button size="sm" variant="ghost" onClick={onClose}><X size={16} /></Button>
          </div>

          {/* Stage Selector */}
          <div>
            <Label className="text-xs text-muted-foreground">Stage</Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {DEAL_STAGES.filter(s => s.key !== 'closed_lost').map(s => (
                <button
                  key={s.key}
                  onClick={() => onUpdate({ stage: s.key })}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    deal.stage === s.key
                      ? 'text-white border-transparent'
                      : 'text-muted-foreground border-border hover:border-gray-400'
                  }`}
                  style={deal.stage === s.key ? { background: s.color } : {}}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Deal Info Grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-muted/50 p-3 rounded">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Value</div>
              <div className="text-lg font-bold mt-0.5">${formatValue(deal.dealValue)}</div>
            </div>
            <div className="bg-muted/50 p-3 rounded">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Probability</div>
              <div className="text-lg font-bold mt-0.5">{deal.probability}%</div>
            </div>
            <div className="bg-muted/50 p-3 rounded">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Square Feet</div>
              <div className="text-lg font-bold mt-0.5">{deal.squareFeet.toLocaleString()}</div>
            </div>
            <div className="bg-muted/50 p-3 rounded">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Expected Close</div>
              <div className="text-lg font-bold mt-0.5">{new Date(deal.expectedCloseDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
            </div>
          </div>

          {/* Address */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">Property Address</div>
            <div className="text-sm">{deal.propertyAddress}</div>
          </div>

          {/* Notes */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">Notes</div>
            <div className="text-sm leading-relaxed bg-muted/30 p-3 rounded">{deal.notes || 'No notes yet.'}</div>
          </div>

          {/* Tags */}
          {deal.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {deal.tags.map(tag => <Badge key={tag} variant="secondary" className="text-[11px]">{tag}</Badge>)}
            </div>
          )}

          {/* Activity Timeline */}
          <div>
            <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-2">Activity</div>
            {activities.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">No activity logged yet</div>
            ) : (
              <div className="space-y-3">
                {activities.map(a => (
                  <div key={a.id} className="flex gap-3 text-sm">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-[9px] font-bold ${
                      a.type === 'tour' ? 'bg-blue-100 text-blue-700' :
                      a.type === 'call' ? 'bg-green-100 text-green-700' :
                      a.type === 'email' ? 'bg-gray-100 text-gray-600' :
                      a.type === 'loi_sent' ? 'bg-amber-100 text-amber-700' :
                      'bg-purple-100 text-purple-700'
                    }`}>{a.type[0].toUpperCase()}</div>
                    <div>
                      <div className="font-medium">{a.subject}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{a.description}</div>
                      <div className="text-[10px] text-muted-foreground mt-1">{formatDate(a.date)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AddDealDialog({ open, onOpenChange, store, onSave }: {
  open: boolean; onOpenChange: (open: boolean) => void; store: Store;
  onSave: (data: any) => void;
}) {
  const [form, setForm] = useState({
    name: '', stage: 'prospect' as DealStage, contactId: '', propertyType: 'industrial' as PropertyType,
    propertyAddress: '', squareFeet: 0, dealValue: 0, probability: 20,
    notes: '', expectedCloseDate: '', tags: [] as string[],
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New Deal</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Deal Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-1" placeholder="e.g. Pacific Logistics — Bothell Warehouse" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Contact</Label>
              <Select value={form.contactId} onValueChange={v => setForm({ ...form, contactId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select contact" /></SelectTrigger>
                <SelectContent>{store.contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Property Type</Label>
              <Select value={form.propertyType} onValueChange={v => setForm({ ...form, propertyType: v as PropertyType })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{PROPERTY_TYPES.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div><Label className="text-xs">Property Address</Label><Input value={form.propertyAddress} onChange={e => setForm({ ...form, propertyAddress: e.target.value })} className="mt-1" /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label className="text-xs">Square Feet</Label><Input type="number" value={form.squareFeet || ''} onChange={e => setForm({ ...form, squareFeet: Number(e.target.value) })} className="mt-1" /></div>
            <div><Label className="text-xs">Deal Value ($)</Label><Input type="number" value={form.dealValue || ''} onChange={e => setForm({ ...form, dealValue: Number(e.target.value) })} className="mt-1" /></div>
            <div><Label className="text-xs">Probability %</Label><Input type="number" value={form.probability} onChange={e => setForm({ ...form, probability: Number(e.target.value) })} className="mt-1" /></div>
          </div>
          <div><Label className="text-xs">Expected Close</Label><Input type="date" value={form.expectedCloseDate} onChange={e => setForm({ ...form, expectedCloseDate: e.target.value })} className="mt-1" /></div>
          <div><Label className="text-xs">Notes</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="mt-1" rows={2} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => { if (form.name) onSave(form); }} className="bg-[hsl(215,65%,45%)] hover:bg-[hsl(215,65%,40%)]">Create Deal</Button>
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
  if (diff < 7) return `${diff}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
