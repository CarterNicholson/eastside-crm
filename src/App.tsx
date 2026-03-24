import { useState, useCallback, useEffect } from 'react';
import { Sidebar, type Page } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { Contacts } from './components/Contacts';
import { Pipeline } from './components/Pipeline';
import { Reminders } from './components/Reminders';
import { EmailLog } from './components/EmailLog';
import { Assistant } from './components/Assistant';
import { DailyDigest } from './components/DailyDigest';
import { PropertyMap } from './components/PropertyMap';
import { Login } from './components/Login';
import { useStore } from './store';

interface CRMUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [focusContactId, setFocusContactId] = useState<string | null>(null);
  const [user, setUser] = useState<CRMUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const store = useStore();

  // Check for existing session on mount
  useEffect(() => {
    const token = localStorage.getItem('crm_token');
    const savedUser = localStorage.getItem('crm_user');
    if (token && savedUser) {
      // Verify token is still valid
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => {
          if (r.ok) return r.json();
          throw new Error('Invalid session');
        })
        .then(userData => {
          setUser(userData);
          setAuthChecked(true);
        })
        .catch(() => {
          localStorage.removeItem('crm_token');
          localStorage.removeItem('crm_user');
          setAuthChecked(true);
        });
    } else {
      setAuthChecked(true);
    }
  }, []);

  const handleLogin = useCallback((userData: CRMUser, _token: string) => {
    setUser(userData);
  }, []);

  const handleLogout = useCallback(() => {
    const token = localStorage.getItem('crm_token');
    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
    setUser(null);
    setCurrentPage('dashboard');
  }, []);

  const pendingReminders = store.reminders.filter(r => r.status === 'pending').length;
  const activeSuggestions = store.getActiveSuggestions().length;
  const unreadEmails = store.emails.filter(e => !e.isRead && e.isInbound).length;

  const navigateToContact = useCallback((contactId: string) => {
    setFocusContactId(contactId);
    setCurrentPage('contacts');
  }, []);

  const handleNavigate = useCallback((page: Page) => {
    if (page !== 'contacts') setFocusContactId(null);
    setCurrentPage(page);
  }, []);

  // Show nothing while checking auth
  if (!authChecked) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent" />
      </div>
    );
  }

  // Show login if not authenticated
  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  if (store.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-primary border-r-transparent mb-4" />
          <p className="text-muted-foreground text-sm">Loading your CRM data...</p>
          <p className="text-muted-foreground text-xs mt-1">5,000+ contacts</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        reminderCount={pendingReminders}
        suggestionCount={activeSuggestions}
        unreadEmailCount={unreadEmails}
        user={user}
        onLogout={handleLogout}
      />
      <main className="flex-1 overflow-y-auto">
        {currentPage === 'dashboard' && <Dashboard store={store} onNavigate={handleNavigate} />}
        {currentPage === 'contacts' && <Contacts store={store} focusContactId={focusContactId} onFocusHandled={() => setFocusContactId(null)} />}
        {currentPage === 'pipeline' && <Pipeline store={store} />}
        {currentPage === 'reminders' && <Reminders store={store} onNavigateToContact={navigateToContact} />}
        {currentPage === 'email' && <EmailLog store={store} />}
        {currentPage === 'map' && <PropertyMap store={store} onNavigateToContact={navigateToContact} />}
        {currentPage === 'assistant' && <Assistant store={store} onNavigate={handleNavigate} onNavigateToContact={navigateToContact} />}
        {currentPage === 'digest' && <DailyDigest store={store} />}
      </main>
    </div>
  );
}
