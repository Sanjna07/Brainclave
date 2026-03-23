/**
 * useMemory — React hook for the Brainclave memory system.
 *
 * Provides live state + actions for all memory entities.
 * Components should use this hook instead of calling memory.ts directly,
 * so UI stays in sync after mutations.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getSubjects, addSubject, deleteSubject,
  getTasks, addTask, updateTask, markTaskDone, deleteTask,
  getWeakTopics, markWeak, resolveWeakTopic, deleteWeakTopic,
  getConversationHistory, clearConversationHistory, addConversationEntry,
  getDueReminders,
  getNotesBySubject, addNote, deleteNote,
  getFlashcardsBySubject,
} from '../lib/memory';
import type {
  Subject, Task, TaskPriority, WeakTopic, ConversationEntry,
  Note, NoteFormat, Flashcard, Reminder,
} from '../lib/types';

export type { Subject, Task, WeakTopic, ConversationEntry, Note, Flashcard, Reminder };

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseMemoryReturn {
  // Loading state
  loading: boolean;

  // Subjects
  subjects: Subject[];
  addSubject: (name: string, color?: string) => Promise<void>;
  deleteSubject: (id: string) => Promise<void>;

  // Tasks
  tasks: Task[];
  addTask: (
    title: string,
    options?: { subjectId?: string; description?: string; deadline?: string; priority?: TaskPriority }
  ) => Promise<void>;
  markTaskDone: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;

  // Weak topics
  weakTopics: WeakTopic[];
  markWeak: (subjectId: string, topic: string, reason?: string) => Promise<void>;
  resolveWeakTopic: (id: string) => Promise<void>;
  deleteWeakTopic: (id: string) => Promise<void>;

  // Conversation history
  history: ConversationEntry[];
  addHistory: (inputMode: 'text'|'voice'|'image'|'camera', role: 'user'|'assistant', content: string, subjectId?: string) => Promise<void>;
  clearHistory: (subjectId?: string) => Promise<void>;

  // Notes (per subject, loaded on demand)
  notes: Note[];
  loadNotes: (subjectId: string) => Promise<void>;
  addNote: (subjectId: string, title: string, content: string, format?: NoteFormat) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;

  // Flashcards (per subject, loaded on demand)
  flashcards: Flashcard[];
  loadFlashcards: (subjectId: string) => Promise<void>;

  // Reminders
  reminders: Reminder[];
  refreshReminders: () => Promise<void>;

  // General refresh (call after external writes, e.g. from AI tabs)
  refresh: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

export function useMemory(): UseMemoryReturn {
  const [loading, setLoading] = useState(true);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [weakTopics, setWeakTopics] = useState<WeakTopic[]>([]);
  const [history, setHistory] = useState<ConversationEntry[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);

  // Load all core data on mount
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [s, t, w, h, r] = await Promise.all([
        getSubjects(),
        getTasks(),
        getWeakTopics(),
        getConversationHistory({ limit: 50 }),
        getDueReminders(48), // show reminders up to 48h out
      ]);
      setSubjects(s);
      setTasks(t);
      setWeakTopics(w);
      setHistory(h);
      setReminders(r);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // ---- Subject actions ----
  const handleAddSubject = useCallback(async (name: string, color?: string) => {
    await addSubject(name, color);
    const updated = await getSubjects();
    setSubjects(updated);
  }, []);

  const handleDeleteSubject = useCallback(async (id: string) => {
    await deleteSubject(id);
    const [s, w] = await Promise.all([getSubjects(), getWeakTopics()]);
    setSubjects(s);
    setWeakTopics(w);
    setNotes([]);
    setFlashcards([]);
  }, []);

  // ---- Task actions ----
  const handleAddTask = useCallback(async (
    title: string,
    options?: { subjectId?: string; description?: string; deadline?: string; priority?: TaskPriority },
  ) => {
    await addTask(title, options);
    const [t, r] = await Promise.all([getTasks(), getDueReminders(48)]);
    setTasks(t);
    setReminders(r);
  }, []);

  const handleMarkTaskDone = useCallback(async (id: string) => {
    await markTaskDone(id);
    const [t, r] = await Promise.all([getTasks(), getDueReminders(48)]);
    setTasks(t);
    setReminders(r);
  }, []);

  const handleDeleteTask = useCallback(async (id: string) => {
    await deleteTask(id);
    const [t, r] = await Promise.all([getTasks(), getDueReminders(48)]);
    setTasks(t);
    setReminders(r);
  }, []);

  // ---- Weak topic actions ----
  const handleMarkWeak = useCallback(async (subjectId: string, topic: string, reason?: string) => {
    await markWeak(subjectId, topic, reason);
    setWeakTopics(await getWeakTopics());
  }, []);

  const handleResolveWeak = useCallback(async (id: string) => {
    await resolveWeakTopic(id);
    setWeakTopics(await getWeakTopics());
  }, []);

  const handleDeleteWeak = useCallback(async (id: string) => {
    await deleteWeakTopic(id);
    setWeakTopics(await getWeakTopics());
  }, []);

  // ---- History ----
  const handleAddHistory = useCallback(async (inputMode: 'text'|'voice'|'image'|'camera', role: 'user'|'assistant', content: string, subjectId?: string) => {
    await addConversationEntry(role, content, inputMode, subjectId);
    setHistory(await getConversationHistory({ limit: 50 }));
  }, []);

  const handleClearHistory = useCallback(async (subjectId?: string) => {
    await clearConversationHistory(subjectId);
    setHistory(await getConversationHistory({ limit: 50 }));
  }, []);

  // ---- Notes (loaded per subject on demand) ----
  const loadNotes = useCallback(async (subjectId: string) => {
    setNotes(await getNotesBySubject(subjectId));
  }, []);

  const handleAddNote = useCallback(async (
    subjectId: string, title: string, content: string, format: NoteFormat = 'raw',
  ) => {
    await addNote(subjectId, title, content, format);
    setNotes(await getNotesBySubject(subjectId));
  }, []);

  const handleDeleteNote = useCallback(async (id: string) => {
    const { deleteNote: del } = await import('../lib/memory');
    await del(id);
    // Re-fetch for current subject
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // ---- Flashcards (loaded per subject on demand) ----
  const loadFlashcards = useCallback(async (subjectId: string) => {
    setFlashcards(await getFlashcardsBySubject(subjectId));
  }, []);

  // ---- Reminders ----
  const refreshReminders = useCallback(async () => {
    setReminders(await getDueReminders(48));
  }, []);

  return {
    loading,
    subjects,
    addSubject: handleAddSubject,
    deleteSubject: handleDeleteSubject,
    tasks,
    addTask: handleAddTask,
    markTaskDone: handleMarkTaskDone,
    deleteTask: handleDeleteTask,
    weakTopics,
    markWeak: handleMarkWeak,
    resolveWeakTopic: handleResolveWeak,
    deleteWeakTopic: handleDeleteWeak,
    history,
    addHistory: handleAddHistory,
    clearHistory: handleClearHistory,
    notes,
    loadNotes,
    addNote: handleAddNote,
    deleteNote: handleDeleteNote,
    flashcards,
    loadFlashcards,
    reminders,
    refreshReminders,
    refresh,
  };
}
