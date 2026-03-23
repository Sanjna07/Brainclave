/**
 * Brainclave Memory Management — High-level API (memory.ts)
 *
 * This is what your teammate's AI tabs import to read/write memory.
 * Never import from db.ts directly in components — use this instead.
 *
 * Usage:
 *   import { addSubject, getTasks, getDueReminders } from '../lib/memory';
 */

import {
  dbPut, dbGet, dbGetAll, dbGetByIndex, dbDelete, generateId,
} from './db';
import type {
  Subject, Note, NoteFormat, Flashcard, Task, TaskPriority, TaskStatus,
  WeakTopic, ConversationEntry, ConversationRole, Reminder,
} from './types';

// Re-export types so consumers only need one import
export type {
  Subject, Note, NoteFormat, Flashcard, Task, TaskPriority, TaskStatus,
  WeakTopic, ConversationEntry, ConversationRole, Reminder,
};

// ---------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------

const SUBJECT_COLORS = [
  '#6C63FF', '#FF6584', '#43B89C', '#F5A623',
  '#4ECDC4', '#A78BFA', '#F97316', '#10B981',
];

let _colorIdx = 0;
function nextColor(): string {
  const color = SUBJECT_COLORS[_colorIdx % SUBJECT_COLORS.length];
  _colorIdx++;
  return color;
}

export async function addSubject(name: string, color?: string): Promise<Subject> {
  const subject: Subject = {
    id: generateId(),
    name: name.trim(),
    color: color ?? nextColor(),
    createdAt: new Date().toISOString(),
  };
  return dbPut('subjects', subject);
}

export async function getSubjects(): Promise<Subject[]> {
  const all = await dbGetAll<Subject>('subjects');
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getSubjectById(id: string): Promise<Subject | undefined> {
  return dbGet<Subject>('subjects', id);
}

export async function deleteSubject(id: string): Promise<void> {
  // Cascade: delete linked notes, flashcards, weak topics
  const [notes, flashcards, weakTopics] = await Promise.all([
    dbGetByIndex<Note>('notes', 'bySubject', id),
    dbGetByIndex<Flashcard>('flashcards', 'bySubject', id),
    dbGetByIndex<WeakTopic>('weakTopics', 'bySubject', id),
  ]);
  await Promise.all([
    ...notes.map((n) => dbDelete('notes', n.id)),
    ...flashcards.map((f) => dbDelete('flashcards', f.id)),
    ...weakTopics.map((w) => dbDelete('weakTopics', w.id)),
    dbDelete('subjects', id),
  ]);
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export async function addNote(
  subjectId: string,
  title: string,
  content: string,
  format: NoteFormat = 'raw',
  tags: string[] = [],
): Promise<Note> {
  const note: Note = {
    id: generateId(),
    subjectId,
    title: title.trim(),
    content,
    format,
    tags,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return dbPut('notes', note);
}

export async function updateNote(id: string, patch: Partial<Omit<Note, 'id' | 'createdAt'>>): Promise<Note | undefined> {
  const existing = await dbGet<Note>('notes', id);
  if (!existing) return undefined;
  const updated: Note = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  return dbPut('notes', updated);
}

export async function getNotesBySubject(subjectId: string): Promise<Note[]> {
  const notes = await dbGetByIndex<Note>('notes', 'bySubject', subjectId);
  return notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getAllNotes(): Promise<Note[]> {
  return dbGetAll<Note>('notes');
}

export async function deleteNote(id: string): Promise<void> {
  // Also remove linked flashcards
  const cards = await dbGetByIndex<Flashcard>('flashcards', 'byNote', id);
  await Promise.all([
    ...cards.map((c) => dbDelete('flashcards', c.id)),
    dbDelete('notes', id),
  ]);
}

// ---------------------------------------------------------------------------
// Flashcards
// ---------------------------------------------------------------------------

export async function addFlashcard(
  subjectId: string,
  front: string,
  back: string,
  noteId?: string,
): Promise<Flashcard> {
  const card: Flashcard = {
    id: generateId(),
    subjectId,
    noteId,
    front: front.trim(),
    back: back.trim(),
    confidence: 0,
    createdAt: new Date().toISOString(),
  };
  return dbPut('flashcards', card);
}

export async function updateFlashcardConfidence(id: string, confidence: 0 | 1 | 2): Promise<void> {
  const card = await dbGet<Flashcard>('flashcards', id);
  if (!card) return;
  await dbPut('flashcards', { ...card, confidence, lastReviewedAt: new Date().toISOString() });
}

export async function getFlashcardsBySubject(subjectId: string): Promise<Flashcard[]> {
  return dbGetByIndex<Flashcard>('flashcards', 'bySubject', subjectId);
}

export async function deleteFlashcard(id: string): Promise<void> {
  return dbDelete('flashcards', id);
}

// ---------------------------------------------------------------------------
// Tasks / Deadlines
// ---------------------------------------------------------------------------

export async function addTask(
  title: string,
  options: {
    subjectId?: string;
    description?: string;
    deadline?: string;
    priority?: TaskPriority;
  } = {},
): Promise<Task> {
  const task: Task = {
    id: generateId(),
    title: title.trim(),
    subjectId: options.subjectId,
    description: options.description,
    deadline: options.deadline,
    priority: options.priority ?? 'medium',
    status: 'pending',
    reminderShown: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return dbPut('tasks', task);
}

export async function updateTask(id: string, patch: Partial<Omit<Task, 'id' | 'createdAt'>>): Promise<Task | undefined> {
  const existing = await dbGet<Task>('tasks', id);
  if (!existing) return undefined;
  const updated: Task = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  return dbPut('tasks', updated);
}

export async function getTasks(statusFilter?: TaskStatus): Promise<Task[]> {
  const all = await dbGetAll<Task>('tasks');
  const filtered = statusFilter ? all.filter((t) => t.status === statusFilter) : all;
  // Auto-mark overdue
  const now = new Date();
  return filtered.map((t) => {
    if (t.deadline && t.status === 'pending' && new Date(t.deadline) < now) {
      return { ...t, status: 'overdue' as TaskStatus };
    }
    return t;
  }).sort((a, b) => {
    // Sort: overdue first, then by deadline, then by priority
    if (a.status === 'overdue' && b.status !== 'overdue') return -1;
    if (b.status === 'overdue' && a.status !== 'overdue') return 1;
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return 0;
  });
}

export async function getTasksBySubject(subjectId: string): Promise<Task[]> {
  return dbGetByIndex<Task>('tasks', 'bySubject', subjectId);
}

export async function markTaskDone(id: string): Promise<void> {
  await updateTask(id, { status: 'done' });
}

export async function deleteTask(id: string): Promise<void> {
  return dbDelete('tasks', id);
}

// ---------------------------------------------------------------------------
// Due Reminders (computed, not stored)
// ---------------------------------------------------------------------------

/**
 * Returns tasks due within `withinHours` hours (default 24).
 * Only includes pending/overdue tasks, not done ones.
 * Used by ReminderBanner.
 */
export async function getDueReminders(withinHours = 24): Promise<Reminder[]> {
  const tasks = await getTasks();
  const subjects = await getSubjects();
  const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));

  const now = Date.now();
  const windowMs = withinHours * 60 * 60 * 1000;

  return tasks
    .filter((t) => t.status !== 'done' && t.deadline)
    .map((t) => {
      const deadlineMs = new Date(t.deadline!).getTime();
      const diffMs = deadlineMs - now;
      const hoursUntilDue = diffMs / (1000 * 60 * 60);
      return {
        taskId: t.id,
        taskTitle: t.title,
        subjectName: t.subjectId ? subjectMap.get(t.subjectId) : undefined,
        deadline: t.deadline!,
        hoursUntilDue,
      };
    })
    .filter((r) => r.hoursUntilDue <= withinHours) // within window
    .sort((a, b) => a.hoursUntilDue - b.hoursUntilDue);
}

/** Mark a reminder's task as "shown" so the banner doesn't repeat this session. */
export async function markReminderShown(taskId: string): Promise<void> {
  await updateTask(taskId, { reminderShown: true });
}

// ---------------------------------------------------------------------------
// Weak Topics
// ---------------------------------------------------------------------------

export async function markWeak(subjectId: string, topic: string, reason?: string): Promise<WeakTopic> {
  const entry: WeakTopic = {
    id: generateId(),
    subjectId,
    topic: topic.trim(),
    reason,
    resolved: false,
    createdAt: new Date().toISOString(),
  };
  return dbPut('weakTopics', entry);
}

export async function resolveWeakTopic(id: string): Promise<void> {
  const existing = await dbGet<WeakTopic>('weakTopics', id);
  if (!existing) return;
  await dbPut('weakTopics', { ...existing, resolved: true });
}

export async function getWeakTopics(subjectId?: string): Promise<WeakTopic[]> {
  const all = subjectId
    ? await dbGetByIndex<WeakTopic>('weakTopics', 'bySubject', subjectId)
    : await dbGetAll<WeakTopic>('weakTopics');
  return all.filter((w) => !w.resolved);
}

export async function deleteWeakTopic(id: string): Promise<void> {
  return dbDelete('weakTopics', id);
}

// ---------------------------------------------------------------------------
// Conversation History
// ---------------------------------------------------------------------------

export async function addConversationEntry(
  role: ConversationRole,
  content: string,
  inputMode: ConversationEntry['inputMode'],
  subjectId?: string,
): Promise<ConversationEntry> {
  const entry: ConversationEntry = {
    id: generateId(),
    subjectId,
    role,
    content,
    inputMode,
    createdAt: new Date().toISOString(),
  };
  return dbPut('conversations', entry);
}

export async function getConversationHistory(
  options: { subjectId?: string; limit?: number } = {},
): Promise<ConversationEntry[]> {
  const all = options.subjectId
    ? await dbGetByIndex<ConversationEntry>('conversations', 'bySubject', options.subjectId)
    : await dbGetAll<ConversationEntry>('conversations');

  const sorted = all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return options.limit ? sorted.slice(0, options.limit) : sorted;
}

/**
 * Get recent conversation history formatted as a context string for LLM prompts.
 * Teammate's AI tabs call this to inject memory into prompts.
 *
 * @param limit - max entries to include (keep small to stay within context window)
 */
export async function getConversationContext(subjectId?: string, limit = 10): Promise<string> {
  const entries = await getConversationHistory({ subjectId, limit });
  return entries
    .reverse() // chronological
    .map((e) => `${e.role === 'user' ? 'Student' : 'Assistant'}: ${e.content}`)
    .join('\n');
}

export async function clearConversationHistory(subjectId?: string): Promise<void> {
  if (subjectId) {
    const entries = await dbGetByIndex<ConversationEntry>('conversations', 'bySubject', subjectId);
    await Promise.all(entries.map((e) => dbDelete('conversations', e.id)));
  } else {
    const { dbClear } = await import('./db');
    await dbClear('conversations');
  }
}

// ---------------------------------------------------------------------------
// Memory context summary for AI prompts (teammate helper)
// ---------------------------------------------------------------------------

/**
 * Builds a compact memory context string for injection into LLM system prompts.
 * Keeps it under ~300 tokens to avoid blowing the context window.
 *
 * Teammate usage:
 *   const context = await getMemoryContext();
 *   systemPrompt = `You are a study assistant. Student context:\n${context}\nAnswer concisely.`;
 */
export async function getMemoryContext(subjectId?: string): Promise<string> {
  const [subjects, weakTopics, tasks, recentConvo] = await Promise.all([
    getSubjects(),
    getWeakTopics(subjectId),
    getTasks('pending'),
    getConversationContext(subjectId, 6),
  ]);

  const parts: string[] = [];

  if (subjects.length > 0) {
    parts.push(`Subjects: ${subjects.map((s) => s.name).join(', ')}`);
  }

  const upcoming = tasks.filter((t) => t.deadline).slice(0, 3);
  if (upcoming.length > 0) {
    parts.push(`Upcoming deadlines: ${upcoming.map((t) => `${t.title} (${t.deadline})`).join('; ')}`);
  }

  if (weakTopics.length > 0) {
    parts.push(`Weak topics: ${weakTopics.slice(0, 5).map((w) => w.topic).join(', ')}`);
  }

  if (recentConvo) {
    parts.push(`Recent conversation:\n${recentConvo}`);
  }

  return parts.join('\n');
}
