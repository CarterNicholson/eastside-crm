import { useState } from 'react';
import {
  LayoutDashboard, Users, Kanban, Bell, Mail, Sparkles, MapPin,
  ChevronLeft, ChevronRight, LogOut, Shield
} from 'lucide-react';

export type Page = 'dashboard' | 'contacts' | 'pipeline' | 'reminders' | 'email' | 'assistant' | 'map' | 'team';

const NAV_ITEMS: { page: Page; label: string; icon: React.ElementType; badge?: string }[] = [
  { page: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { page: 'contacts', label: 'Contacts', icon: Users },
  { page: 'pipeline', label: 'Pipeline', icon: Kanban },
  { page: 'reminders', label: 'Follow-Ups', icon: Bell },
  { page: 'email', label: 'Email Log', icon: Mail },
  { page: 'map', label: 'Property Map', icon: MapPin },
  { page: 'assistant', label: 'AI Assistant', icon: Sparkles },
];

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  reminderCount: number;
  suggestionCount: number;
  unreadEmailCount: number;
  user?: { id: string; name: string; email: string; role: string } | null;
  onLogout?: () => void;
}

export function Sidebar({ currentPage, onNavigate, reminderCount, suggestionCount, unreadEmailCount, user, onLogout }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  const isAdmin = user?.role === 'admin';

  const allNavItems = isAdmin
    ? [...NAV_ITEMS, { page: 'team' as Page, label: 'Team', icon: Shield }]
    : NAV_ITEMS;

  const getBadge = (page: Page) => {
    if (page === 'reminders' && reminderCount > 0) return reminderCount;
    if (page === 'assistant' && suggestionCount > 0) return suggestionCount;
    if (page === 'email' && unreadEmailCount > 0) return unreadEmailCount;
    return null;
  };

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : 'U';

  return (
    <div
      className={`flex flex-col transition-all duration-300 ease-in-out dark-scroll ${collapsed ? 'w-[68px]' : 'w-[240px]'}`}
      style={{
        background: 'linear-gradient(180deg, hsl(222, 47%, 11%) 0%, hsl(224, 50%, 8%) 100%)',
      }}
    >
      {/* Logo */}
      <div className={`flex items-center gap-3 px-4 py-5 ${collapsed ? 'justify-center' : ''}`}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, hsl(220, 70%, 55%), hsl(250, 60%, 50%))' }}>
          <span className="text-white text-sm font-bold tracking-tight">EC</span>
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <div className="text-[13px] font-semibold text-white leading-tight tracking-tight">Eastside CRM</div>
            <div className="text-[10px] text-white/40 font-medium">Kidder Mathews</div>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="mx-4 border-t border-white/[0.06]" />

      {/* Nav */}
      <nav className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto dark-scroll">
        {allNavItems.map(({ page, label, icon: Icon }) => {
          const isActive = currentPage === page;
          const badge = getBadge(page);
          return (
            <button
              key={page}
              onClick={() => onNavigate(page)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-all duration-150 ${
                isActive
                  ? 'bg-white/[0.1] text-white font-medium shadow-sm'
                  : 'text-white/50 hover:bg-white/[0.06] hover:text-white/80'
              }`}
              style={isActive ? { backdropFilter: 'blur(10px)' } : {}}
            >
              <Icon size={17} className={`flex-shrink-0 ${isActive ? 'text-blue-400' : ''}`} />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">{label}</span>
                  {badge && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold min-w-[20px] text-center ${
                      page === 'assistant'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-blue-500/20 text-blue-300'
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

      {/* User & Logout */}
      {user && (
        <div className="px-3 py-3 border-t border-white/[0.06]">
          <div className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg ${collapsed ? 'justify-center' : ''}`}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, hsl(220, 70%, 55%), hsl(250, 60%, 50%))' }}>
              <span className="text-white">{initials}</span>
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-white/80 truncate">{user.name}</div>
                <div className="text-[10px] text-white/30 truncate">{user.role}</div>
              </div>
            )}
            {!collapsed && onLogout && (
              <button
                onClick={onLogout}
                className="text-white/30 hover:text-white/60 transition-colors p-1 rounded hover:bg-white/[0.06]"
                title="Sign out"
              >
                <LogOut size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Collapse toggle */}
      <div className="px-3 py-3 border-t border-white/[0.06]">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-[11px] text-white/30 hover:text-white/50 rounded-lg hover:bg-white/[0.04] transition-all"
        >
          {collapsed ? <ChevronRight size={14} /> : <><ChevronLeft size={14} /> <span>Collapse</span></>}
        </button>
      </div>
    </div>
  );
}
