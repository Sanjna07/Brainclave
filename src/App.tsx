import { useState, useEffect, useCallback } from 'react';
import { initSDK, getAccelerationMode } from './runanywhere';
import { ChatTab } from './components/ChatTab';
import { VisionTab } from './components/VisionTab';
import { VoiceTab } from './components/VoiceTab';
import { ToolsTab } from './components/ToolsTab';
import { MemoryTab } from './components/MemoryTab';
import { ReminderBanner } from './components/ReminderBanner';
import { getDueReminders, markReminderShown } from './lib/memory';
import type { Reminder } from './lib/types';

type Tab = 'chat' | 'vision' | 'voice' | 'tools' | 'memory';

export function App() {
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('memory');

  // Global reminders state — shown above the nav regardless of active tab
  const [reminders, setReminders] = useState<Reminder[]>([]);

  useEffect(() => {
    initSDK()
      .then(() => setSdkReady(true))
      .catch((err) => setSdkError(err instanceof Error ? err.message : String(err)));
  }, []);

  // Load reminders once on startup (and again when memory tab is visited)
  useEffect(() => {
    getDueReminders(48).then(setReminders);
    // Re-check every 5 minutes in case the user leaves the tab open
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
        <h2>SDK Error</h2>
        <p className="error-text">{sdkError}</p>
      </div>
    );
  }

  if (!sdkReady) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <h2>Loading RunAnywhere SDK...</h2>
        <p>Initializing on-device AI engine</p>
      </div>
    );
  }

  const accel = getAccelerationMode();

  return (
    <div className="app">
      {/* Global reminder banners */}
      <ReminderBanner reminders={reminders} onDismiss={handleDismissReminder} />

      <header className="app-header">
        <h1>RunAnywhere AI</h1>
        {accel && <span className="badge">{accel === 'webgpu' ? 'WebGPU' : 'CPU'}</span>}
      </header>

      <nav className="tab-bar">
        <button className={activeTab === 'memory' ? 'active' : ''} onClick={() => setActiveTab('memory')}>
          🧠 Memory
        </button>
        <button className={activeTab === 'chat' ? 'active' : ''} onClick={() => setActiveTab('chat')}>
          💬 Chat
        </button>
        <button className={activeTab === 'vision' ? 'active' : ''} onClick={() => setActiveTab('vision')}>
          📷 Vision
        </button>
        <button className={activeTab === 'voice' ? 'active' : ''} onClick={() => setActiveTab('voice')}>
          🎙️ Voice
        </button>
        <button className={activeTab === 'tools' ? 'active' : ''} onClick={() => setActiveTab('tools')}>
          🔧 Tools
        </button>
      </nav>

      <main className="tab-content">
        {activeTab === 'memory' && <MemoryTab />}
        {activeTab === 'chat' && <ChatTab />}
        {activeTab === 'vision' && <VisionTab />}
        {activeTab === 'voice' && <VoiceTab />}
        {activeTab === 'tools' && <ToolsTab />}
      </main>
    </div>
  );
}
