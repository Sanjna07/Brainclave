/**
 * Brainclave Memory Management — IndexedDB wrapper (db.ts)
 *
 * Provides a thin, promise-based wrapper around the browser's IndexedDB API.
 * All object stores, indexes, and schema migrations live here.
 *
 * Object stores:
 *   subjects        — Subject records
 *   notes           — Note records (indexed by subjectId)
 *   flashcards      — Flashcard records (indexed by subjectId)
 *   tasks           — Task/Deadline records (indexed by deadline)
 *   weakTopics      — WeakTopic records (indexed by subjectId)
 *   conversations   — ConversationEntry records (indexed by subjectId)
 */

const DB_NAME = 'brainclave-memory';
const DB_VERSION = 1;

// Store names — typed for safety
export type StoreName =
  | 'subjects'
  | 'notes'
  | 'flashcards'
  | 'tasks'
  | 'weakTopics'
  | 'conversations';

// ---------------------------------------------------------------------------
// Open / upgrade
// ---------------------------------------------------------------------------

let _db: IDBDatabase | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // subjects
      if (!db.objectStoreNames.contains('subjects')) {
        db.createObjectStore('subjects', { keyPath: 'id' });
      }

      // notes — indexed by subjectId so we can quickly get all notes for a subject
      if (!db.objectStoreNames.contains('notes')) {
        const store = db.createObjectStore('notes', { keyPath: 'id' });
        store.createIndex('bySubject', 'subjectId', { unique: false });
      }

      // flashcards — indexed by subjectId
      if (!db.objectStoreNames.contains('flashcards')) {
        const store = db.createObjectStore('flashcards', { keyPath: 'id' });
        store.createIndex('bySubject', 'subjectId', { unique: false });
        store.createIndex('byNote', 'noteId', { unique: false });
      }

      // tasks — indexed by deadline for reminder queries
      if (!db.objectStoreNames.contains('tasks')) {
        const store = db.createObjectStore('tasks', { keyPath: 'id' });
        store.createIndex('byDeadline', 'deadline', { unique: false });
        store.createIndex('bySubject', 'subjectId', { unique: false });
        store.createIndex('byStatus', 'status', { unique: false });
      }

      // weakTopics — indexed by subjectId
      if (!db.objectStoreNames.contains('weakTopics')) {
        const store = db.createObjectStore('weakTopics', { keyPath: 'id' });
        store.createIndex('bySubject', 'subjectId', { unique: false });
      }

      // conversations — indexed by subjectId and createdAt for recency queries
      if (!db.objectStoreNames.contains('conversations')) {
        const store = db.createObjectStore('conversations', { keyPath: 'id' });
        store.createIndex('bySubject', 'subjectId', { unique: false });
        store.createIndex('byCreatedAt', 'createdAt', { unique: false });
      }
    };

    req.onsuccess = (event) => {
      _db = (event.target as IDBOpenDBRequest).result;
      resolve(_db);
    };

    req.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

// ---------------------------------------------------------------------------
// Generic CRUD helpers
// ---------------------------------------------------------------------------

/** Put (upsert) a single record into a store. */
export async function dbPut<T>(store: StoreName, record: T): Promise<T> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(record);
    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
  });
}

/** Get a single record by primary key. */
export async function dbGet<T>(store: StoreName, id: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(id);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

/** Get all records in a store. */
export async function dbGetAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

/** Get all records by an index value. */
export async function dbGetByIndex<T>(
  store: StoreName,
  indexName: string,
  value: IDBValidKey,
): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const idx = tx.objectStore(store).index(indexName);
    const req = idx.getAll(value);
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

/** Delete a record by primary key. */
export async function dbDelete(store: StoreName, id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Clear all records from a store (useful for dev/reset). */
export async function dbClear(store: StoreName): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------------
// Utility: generate a UUID-like id
// ---------------------------------------------------------------------------

export function generateId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
