import { useState } from 'react';
import {
  LayoutDashboard, Users, Kanban, Bell, Mail, Sparkles, Calendar,
  ChevronLeft, ChevronRight, Search
} from 'lucide-react';

export type Page = 'dashboard' | 'contacts' | 'pipeline' | 'reminders' | 'email' | 'assistant' | 'digest';

const NAV_ITEMS: { page: Page; label: string; icon: React.ElementType; badge?: string }[] = [
  { page: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { page: 'contacts', label: 'Contacts', icon: Users },
  { page: 'pipeline', label: 'Pipeline', icon: Kanban },
  { page: 'reminders', label: 'Follow-Ups', icon: Bell },
  { page: 'email', label: 'Email Log', icon: Mail },
  { page: 'assistant', label: 'AI Assistant', icon: Sparkles },
  { page: 'digest', label: 'Daily Digest', icon: Calendar },
];

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  reminderCount: number;
  suggestionCount: number;
  unreadEmailCount: number;
}

export function Sidebar({ currentPage, onNavigate, reminderCount, suggestionCount, unreadEmailCount }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  const getBadge = (page: Page) => {
    if (page === 'reminders' && reminderCount > 0) return reminderCount;
    if (page === 'assistant' && suggestionCount > 0) return suggestionCount;
    if (page === 'email' && unreadEmailCount > 0) return unreadEmailCount;
    return null;
  };

  return (
    <div className={`flex flex-col border-r border-border bg-white transition-all duration-200 ${collapsed ? 'w-16' : 'w-56'}`}>
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-4 border-b border-border">
        <div className="w-8 h-8 rounded bg-[hsl(215,65%,45%)] flex items-center justify-center flex-shrink-0">
          <span className="text-white text-sm font-bold">EC</span>
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <div className="text-sm font-semibold text-foreground leading-tight">Eastside CRM</div>
            <div className="text-[10px] text-muted-foreground">Kidder Mathews</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 px-2 space-y-0.5">
        {NAV_ITEMS.map(({ page, label, icon: Icon }) => {
          const isActive = currentPage === page;
          const badge = getBadge(page);
          return (
            <button
              key={page}
              onClick={() => onNavigate(page)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${
                isActive
                  ? 'bg-[hsl(215,65%,45%)]/10 text-[hsl(215,65%,45%)] font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon size={18} className="flex-shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">{label}</span>
                  {badge && (
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
                      page === 'assistant' ? 'bg-amber-100 text-amber-700' : 'bg-[hsl(215,65%,45%)]/15 text-[hsl(215,65%,45%)]'
                    }`}>
                      {badge}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="px-2 py-3 border-t border-border">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded hover:bg-muted transition-colors"
        >
          {collapsed ? <ChevronRight size={14} /> : <><ChevronLeft size={14} /> <span>Collapse</span></>}
        </button>
      </div>
    </div>
  );
}
