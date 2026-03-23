/**
 * MemoryTab — the main Memory Management UI.
 *
 * Four panels:
 *   1. Subjects — add/delete subjects; view notes & weak topics per subject
 *   2. Tasks & Deadlines — add/edit/delete tasks with optional deadline
 *   3. Weak Topics — mark topics as weak per subject; resolve them
 *   4. History — recent conversation history with optional clear
 */

import { useState, useCallback } from 'react';
import { useMemory } from '../hooks/useMemory';
import type { Subject, Task, WeakTopic, Note } from '../lib/types';

type MemoryPanel = 'subjects' | 'tasks' | 'weak' | 'history';

const PRIORITY_COLORS = { low: '#10B981', medium: '#F5A623', high: '#FF6584' };
const PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDeadline(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function deadlineBadgeClass(task: Task): string {
  if (task.status === 'done') return 'deadline-badge done';
  if (!task.deadline) return '';
  const diff = new Date(task.deadline).getTime() - Date.now();
  const hours = diff / (1000 * 60 * 60);
  if (hours < 0) return 'deadline-badge overdue';
  if (hours < 24) return 'deadline-badge urgent';
  return 'deadline-badge upcoming';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SubjectsPanel({ memory }: { memory: ReturnType<typeof useMemory> }) {
  const [newName, setNewName] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const handleAdd = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    await memory.addSubject(name);
    setNewName('');
  }, [newName, memory]);

  const handleSelect = useCallback(async (subject: Subject) => {
    if (selectedSubject?.id === subject.id) {
      setSelectedSubject(null);
      setShowNotes(false);
      return;
    }
    setSelectedSubject(subject);
    setShowNotes(false);
    await memory.loadNotes(subject.id);
    await memory.loadFlashcards(subject.id);
  }, [selectedSubject, memory]);

  const subjectWeakTopics = selectedSubject
    ? memory.weakTopics.filter((w) => w.subjectId === selectedSubject.id)
    : [];

  return (
    <div className="memory-panel">
      <h3 className="memory-panel-title">📚 Subjects</h3>

      {/* Add subject */}
      <div className="memory-input-row">
        <input
          className="memory-input"
          placeholder="Add a subject (e.g. Computer Networks)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={!newName.trim()}>
          Add
        </button>
      </div>

      {/* Subject list */}
      {memory.subjects.length === 0 && (
        <p className="memory-empty">No subjects yet. Add one above!</p>
      )}
      <div className="subject-list">
        {memory.subjects.map((s) => (
          <div key={s.id} className={`subject-card ${selectedSubject?.id === s.id ? 'selected' : ''}`}>
            <div className="subject-card-header" onClick={() => handleSelect(s)}>
              <span className="subject-dot" style={{ background: s.color }} />
              <span className="subject-name">{s.name}</span>
              <span className="subject-meta">
                {memory.weakTopics.filter((w) => w.subjectId === s.id).length > 0 && (
                  <span className="weak-badge">
                    ⚠ {memory.weakTopics.filter((w) => w.subjectId === s.id).length} weak
                  </span>
                )}
              </span>
              <button
                className="btn btn-sm subject-delete"
                onClick={(e) => { e.stopPropagation(); memory.deleteSubject(s.id); }}
                title="Delete subject"
              >×</button>
            </div>

            {/* Expanded view */}
            {selectedSubject?.id === s.id && (
              <div className="subject-expanded">
                {/* Notes */}
                <div className="subject-section">
                  <div className="subject-section-header">
                    <strong>📝 Notes ({memory.notes.length})</strong>
                    <button className="btn btn-sm" onClick={() => setShowNotes(!showNotes)}>
                      {showNotes ? 'Hide' : 'View'}
                    </button>
                  </div>
                  {showNotes && (
                    <div className="notes-list">
                      {memory.notes.length === 0 && <p className="memory-empty">No notes yet.</p>}
                      {memory.notes.map((n: Note) => (
                        <div key={n.id} className="note-item">
                          <div className="note-item-header">
                            <span className="note-title">{n.title}</span>
                            <span className="note-format">{n.format}</span>
                            <button
                              className="btn btn-sm"
                              onClick={() => memory.deleteNote(n.id)}
                            >×</button>
                          </div>
                          <p className="note-preview">{n.content.slice(0, 120)}{n.content.length > 120 ? '…' : ''}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Flashcards count */}
                <div className="subject-section">
                  <strong>🃏 Flashcards: {memory.flashcards.length}</strong>
                </div>

                {/* Weak topics for this subject */}
                <div className="subject-section">
                  <strong>⚠ Weak Topics ({subjectWeakTopics.length})</strong>
                  {subjectWeakTopics.length === 0 && <p className="memory-empty">None marked.</p>}
                  <div className="weak-chips">
                    {subjectWeakTopics.map((w) => (
                      <span key={w.id} className="weak-chip">
                        {w.topic}
                        <button onClick={() => memory.resolveWeakTopic(w.id)} title="Mark resolved">✓</button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function TasksPanel({ memory }: { memory: ReturnType<typeof useMemory> }) {
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [subjectId, setSubjectId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'done'>('all');

  const handleAdd = useCallback(async () => {
    if (!title.trim()) return;
    await memory.addTask(title.trim(), {
      deadline: deadline || undefined,
      priority,
      subjectId: subjectId || undefined,
    });
    setTitle('');
    setDeadline('');
    setPriority('medium');
    setSubjectId('');
    setShowForm(false);
  }, [title, deadline, priority, subjectId, memory]);

  const filtered = memory.tasks.filter((t) =>
    filterStatus === 'all' ? true : t.status === filterStatus,
  );

  return (
    <div className="memory-panel">
      <h3 className="memory-panel-title">✅ Tasks & Deadlines</h3>

      <div className="tasks-toolbar">
        <div className="filter-tabs">
          {(['all', 'pending', 'done'] as const).map((f) => (
            <button
              key={f}
              className={`filter-tab ${filterStatus === f ? 'active' : ''}`}
              onClick={() => setFilterStatus(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Add Task'}
        </button>
      </div>

      {showForm && (
        <div className="memory-form">
          <input
            className="memory-input"
            placeholder="Task title (e.g. Revise subnetting)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="memory-form-row">
            <input
              className="memory-input"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              title="Deadline (optional)"
            />
            <select
              className="memory-input"
              value={priority}
              onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')}
            >
              <option value="low">Low priority</option>
              <option value="medium">Medium priority</option>
              <option value="high">High priority</option>
            </select>
          </div>
          <select
            className="memory-input"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            <option value="">No subject</option>
            {memory.subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleAdd}
            disabled={!title.trim()}
          >
            Save Task
          </button>
        </div>
      )}

      {filtered.length === 0 && (
        <p className="memory-empty">No {filterStatus !== 'all' ? filterStatus : ''} tasks yet.</p>
      )}

      <div className="task-list">
        {filtered.map((task) => {
          const subject = memory.subjects.find((s) => s.id === task.subjectId);
          return (
            <div key={task.id} className={`task-item task-${task.status}`}>
              <div className="task-item-left">
                <button
                  className={`task-check ${task.status === 'done' ? 'checked' : ''}`}
                  onClick={() => task.status !== 'done' && memory.markTaskDone(task.id)}
                  title={task.status === 'done' ? 'Done' : 'Mark done'}
                >
                  {task.status === 'done' ? '✓' : '○'}
                </button>
              </div>
              <div className="task-item-body">
                <span className={`task-title ${task.status === 'done' ? 'done-text' : ''}`}>
                  {task.title}
                </span>
                <div className="task-meta">
                  {subject && (
                    <span className="task-subject" style={{ background: subject.color + '22', color: subject.color }}>
                      {subject.name}
                    </span>
                  )}
                  <span
                    className="task-priority"
                    style={{ color: PRIORITY_COLORS[task.priority] }}
                  >
                    {PRIORITY_LABELS[task.priority]}
                  </span>
                  {task.deadline && (
                    <span className={deadlineBadgeClass(task)}>
                      📅 {formatDeadline(task.deadline)}
                    </span>
                  )}
                </div>
              </div>
              <button
                className="btn btn-sm task-delete"
                onClick={() => memory.deleteTask(task.id)}
                title="Delete task"
              >×</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function WeakTopicsPanel({ memory }: { memory: ReturnType<typeof useMemory> }) {
  const [topic, setTopic] = useState('');
  const [reason, setReason] = useState('');
  const [subjectId, setSubjectId] = useState('');

  const handleAdd = useCallback(async () => {
    if (!topic.trim() || !subjectId) return;
    await memory.markWeak(subjectId, topic.trim(), reason.trim() || undefined);
    setTopic('');
    setReason('');
  }, [topic, reason, subjectId, memory]);

  // Group by subject
  const grouped = memory.subjects.map((s) => ({
    subject: s,
    topics: memory.weakTopics.filter((w) => w.subjectId === s.id),
  })).filter((g) => g.topics.length > 0);

  return (
    <div className="memory-panel">
      <h3 className="memory-panel-title">⚠ Weak Topics</h3>
      <p className="memory-subtitle">Track topics you're not confident in — resolve them as you improve.</p>

      <div className="memory-form">
        <select
          className="memory-input"
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
        >
          <option value="">Select a subject</option>
          {memory.subjects.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <div className="memory-input-row">
          <input
            className="memory-input"
            placeholder="Topic (e.g. Subnetting)"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <button
            className="btn btn-primary btn-sm"
            onClick={handleAdd}
            disabled={!topic.trim() || !subjectId}
          >
            Mark Weak
          </button>
        </div>
        <input
          className="memory-input"
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      {grouped.length === 0 && (
        <p className="memory-empty">No weak topics tracked. Great job — or add some above!</p>
      )}

      {grouped.map(({ subject, topics }) => (
        <div key={subject.id} className="weak-group">
          <div className="weak-group-header">
            <span className="subject-dot" style={{ background: subject.color }} />
            <strong>{subject.name}</strong>
          </div>
          <div className="weak-chips">
            {topics.map((w: WeakTopic) => (
              <div key={w.id} className="weak-chip-full">
                <span>⚠ {w.topic}</span>
                {w.reason && <span className="weak-reason">({w.reason})</span>}
                <div className="weak-actions">
                  <button className="btn btn-sm" onClick={() => memory.resolveWeakTopic(w.id)} title="Resolved">✓ Got it</button>
                  <button className="btn btn-sm" onClick={() => memory.deleteWeakTopic(w.id)} title="Remove">×</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

function HistoryPanel({ memory }: { memory: ReturnType<typeof useMemory> }) {
  const [filterSubject, setFilterSubject] = useState('');

  const filtered = filterSubject
    ? memory.history.filter((h) => h.subjectId === filterSubject)
    : memory.history;

  const modeIcon: Record<string, string> = {
    text: '💬', voice: '🎙', image: '📷', camera: '📸',
  };

  return (
    <div className="memory-panel">
      <h3 className="memory-panel-title">🕑 Conversation History</h3>

      <div className="memory-input-row">
        <select
          className="memory-input"
          value={filterSubject}
          onChange={(e) => setFilterSubject(e.target.value)}
        >
          <option value="">All subjects</option>
          {memory.subjects.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <button
          className="btn btn-sm"
          onClick={() => memory.clearHistory(filterSubject || undefined)}
        >
          Clear
        </button>
      </div>

      {filtered.length === 0 && (
        <p className="memory-empty">No conversation history yet.</p>
      )}

      <div className="history-list">
        {filtered.map((entry) => {
          const subject = memory.subjects.find((s) => s.id === entry.subjectId);
          return (
            <div key={entry.id} className={`history-entry history-${entry.role}`}>
              <div className="history-meta">
                <span className="history-mode">{modeIcon[entry.inputMode] ?? '💬'}</span>
                <span className="history-role">{entry.role === 'user' ? 'You' : 'AI'}</span>
                {subject && (
                  <span className="history-subject" style={{ color: subject.color }}>
                    {subject.name}
                  </span>
                )}
                <span className="history-time">
                  {new Date(entry.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="history-content">{entry.content}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main MemoryTab
// ---------------------------------------------------------------------------

export function MemoryTab() {
  const memory = useMemory();
  const [activePanel, setActivePanel] = useState<MemoryPanel>('subjects');

  const panels: { id: MemoryPanel; label: string; icon: string }[] = [
    { id: 'subjects', label: 'Subjects', icon: '📚' },
    { id: 'tasks', label: 'Tasks', icon: '✅' },
    { id: 'weak', label: 'Weak Topics', icon: '⚠' },
    { id: 'history', label: 'History', icon: '🕑' },
  ];

  if (memory.loading) {
    return (
      <div className="tab-panel memory-panel-wrapper">
        <div className="memory-loading">
          <div className="spinner" />
          <p>Loading memory...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-panel memory-panel-wrapper">
      {/* Panel nav */}
      <nav className="memory-nav">
        {panels.map((p) => (
          <button
            key={p.id}
            className={`memory-nav-btn ${activePanel === p.id ? 'active' : ''}`}
            onClick={() => setActivePanel(p.id)}
          >
            {p.icon} {p.label}
          </button>
        ))}
      </nav>

      {/* Active panel */}
      <div className="memory-content">
        {activePanel === 'subjects' && <SubjectsPanel memory={memory} />}
        {activePanel === 'tasks' && <TasksPanel memory={memory} />}
        {activePanel === 'weak' && <WeakTopicsPanel memory={memory} />}
        {activePanel === 'history' && <HistoryPanel memory={memory} />}
      </div>
    </div>
  );
}
