import { useState, useEffect, useCallback } from 'react';
import { initSDK, getAccelerationMode } from './runanywhere';
import { TutorTab } from './components/TutorTab';
import { MemoryTab } from './components/MemoryTab';
import { ReminderBanner } from './components/ReminderBanner';
import { getDueReminders, markReminderShown } from './lib/memory';
import type { Reminder } from './lib/types';

type Tab = 'tutor' | 'history';

export function App() {
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('tutor');
  const [reminders, setReminders] = useState<Reminder[]>([]);

  useEffect(() => {
    initSDK()
      .then(() => setSdkReady(true))
      .catch((err) => setSdkError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    getDueReminders(48).then(setReminders);
    const interval = setInterval(async () => {
      setReminders(await getDueReminders(48));
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleDismissReminder = useCallback(async (taskId: string) => {
    await markReminderShown(taskId);
    setReminders((prev) => prev.filter((r) => r.taskId !== taskId));
  }, []);

  if (sdkError) {
    return (
      <div className="app-loading">
        <div className="app-error-icon">!</div>
        <h2>Startup Error</h2>
        <p className="error-text">{sdkError}</p>
      </div>
    );
  }

  if (!sdkReady) {
    return (
      <div className="app-loading">
        <div className="bc-spinner" />
        <h2>BrainClave</h2>
        <p>Initialising on-device AI…</p>
      </div>
    );
  }

  const accel = getAccelerationMode();

  return (
    <div className="app">
      <ReminderBanner reminders={reminders} onDismiss={handleDismissReminder} />

      <header className="bc-header">
        <div className="bc-header-left">
          <div className="bc-logo">
            <img src="https://res.cloudinary.com/dx0r0pbgb/image/upload/v1774338707/Screenshot_2026-03-24_131005-removebg-preview_syduni.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div className="bc-header-text">
            <span className="bc-title">BrainClave</span>
          </div>
        </div>
      </header>

      <nav className="bc-nav">
        <button
          className={`bc-nav-btn ${activeTab === 'tutor' ? 'active' : ''}`}
          onClick={() => setActiveTab('tutor')}
        >
          <span className="bc-nav-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.58 3.44 2 2 0 0 1 3.57 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.1a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.03z" />
            </svg>
          </span>
          Tutor
        </button>
        <button
          className={`bc-nav-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <span className="bc-nav-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M12 7v5l4 2" />
            </svg>
          </span>
          History
        </button>
      </nav>

      <main className="tab-content">
        {activeTab === 'tutor' && <TutorTab />}
        {activeTab === 'history' && <MemoryTab />}
      </main>
    </div>
  );
}
