import { useState } from 'react';
import { Sidebar, type Page } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { Contacts } from './components/Contacts';
import { Pipeline } from './components/Pipeline';
import { Reminders } from './components/Reminders';
import { EmailLog } from './components/EmailLog';
import { Assistant } from './components/Assistant';
import { DailyDigest } from './components/DailyDigest';
import { useStore } from './store';

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const store = useStore();

  const pendingReminders = store.reminders.filter(r => r.status === 'pending').length;
  const activeSuggestions = store.getActiveSuggestions().length;
  const unreadEmails = store.emails.filter(e => !e.isRead && e.isInbound).length;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        reminderCount={pendingReminders}
        suggestionCount={activeSuggestions}
        unreadEmailCount={unreadEmails}
      />
      <main className="flex-1 overflow-y-auto">
        {currentPage === 'dashboard' && <Dashboard store={store} onNavigate={setCurrentPage} />}
        {currentPage === 'contacts' && <Contacts store={store} />}
        {currentPage === 'pipeline' && <Pipeline store={store} />}
        {currentPage === 'reminders' && <Reminders store={store} />}
        {currentPage === 'email' && <EmailLog store={store} />}
        {currentPage === 'assistant' && <Assistant store={store} onNavigate={setCurrentPage} />}
        {currentPage === 'digest' && <DailyDigest store={store} />}
      </main>
    </div>
  );
}
