/**
 * Brainclave Memory Management — Shared TypeScript types
 *
 * All entities stored in IndexedDB. Each has a string `id` (UUID)
 * and a `createdAt` ISO timestamp. These types are the single source
 * of truth shared between the data layer (db.ts / memory.ts) and the UI.
 */

// ---------------------------------------------------------------------------
// Subject
// ---------------------------------------------------------------------------

export interface Subject {
  id: string;
  name: string;          // e.g. "Computer Networks"
  color: string;         // hex color for UI tag
  createdAt: string;     // ISO 8601
}

// ---------------------------------------------------------------------------
// Note
// ---------------------------------------------------------------------------

export type NoteFormat = 'raw' | 'bullets' | 'flashcards' | 'summary' | 'comparison';

export interface Note {
  id: string;
  subjectId: string;     // FK → Subject.id
  title: string;
  content: string;       // raw or AI-structured text
  format: NoteFormat;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Flashcard
// ---------------------------------------------------------------------------

export interface Flashcard {
  id: string;
  subjectId: string;
  noteId?: string;       // optional: linked source note
  front: string;         // question / concept
  back: string;          // answer / explanation
  confidence: 0 | 1 | 2; // 0=unseen, 1=shaky, 2=confident
  lastReviewedAt?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Task / Deadline
// ---------------------------------------------------------------------------

export type TaskStatus = 'pending' | 'done' | 'overdue';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface Task {
  id: string;
  subjectId?: string;    // optional FK → Subject.id
  title: string;
  description?: string;
  deadline?: string;     // ISO 8601 date string, optional
  priority: TaskPriority;
  status: TaskStatus;
  reminderShown: boolean; // prevent repeat banners
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Weak Topic
// ---------------------------------------------------------------------------

export interface WeakTopic {
  id: string;
  subjectId: string;
  topic: string;         // e.g. "Subnetting"
  reason?: string;       // optional note on why it's weak
  resolved: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Conversation History Entry
// ---------------------------------------------------------------------------

export type ConversationRole = 'user' | 'assistant';

export interface ConversationEntry {
  id: string;
  subjectId?: string;    // optional: linked subject context
  role: ConversationRole;
  content: string;
  inputMode: 'text' | 'voice' | 'image' | 'camera'; // how it was entered
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Reminder (derived — not stored, computed from Tasks)
// ---------------------------------------------------------------------------

export interface Reminder {
  taskId: string;
  taskTitle: string;
  subjectName?: string;
  deadline: string;       // ISO 8601
  hoursUntilDue: number;  // negative = overdue
}
