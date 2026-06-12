import type { AppSnapshot, CaseItem, CaseNotes, SyncQueueItem, Topic, UiState } from "../types";
import { localUserId, nowIso } from "./id";

const DB_NAME = "case-editor-db";
const DB_VERSION = 1;
const STORES = ["topics", "cases", "user_ui_state", "sync_queue"] as const;
const ALL_STORES = ["topics", "cases", "case_notes", "user_ui_state", "sync_queue"] as const;

type StoreName = (typeof ALL_STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      STORES.forEach((store) => {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: "id" });
      });
      if (!db.objectStoreNames.contains("case_notes")) {
        db.createObjectStore("case_notes", { keyPath: "case_id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function tx<T>(storeName: StoreName, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = work(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll<T>(storeName: StoreName) {
  return tx<T[]>(storeName, "readonly", (store) => store.getAll());
}

export async function put<T>(storeName: StoreName, value: T) {
  await tx<IDBValidKey>(storeName, "readwrite", (store) => store.put(value));
}

export async function remove(storeName: StoreName, key: string) {
  await tx<undefined>(storeName, "readwrite", (store) => store.delete(key));
}

export async function clearStore(storeName: StoreName) {
  await tx<undefined>(storeName, "readwrite", (store) => store.clear());
}

export async function readSnapshot(userId = localUserId()): Promise<AppSnapshot> {
  const [topics, cases, notes, uiStates] = await Promise.all([
    getAll<Topic>("topics"),
    getAll<CaseItem>("cases"),
    getAll<CaseNotes>("case_notes"),
    getAll<UiState>("user_ui_state")
  ]);

  const uiState =
    uiStates.find((item) => item.user_id === userId) ||
    ({
      id: userId,
      user_id: userId,
      expanded_topic_ids: [],
      collapsed_fields: [],
      split_width: 52,
      pane_widths: {},
      updated_at: nowIso()
    } as UiState & { id: string });

  return {
    topics: topics.filter((item) => item.user_id === userId),
    cases: cases.filter((item) => item.user_id === userId),
    notes: notes.filter((item) => item.user_id === userId),
    uiState
  };
}

export async function enqueue(item: SyncQueueItem) {
  await put("sync_queue", item);
}

export async function queueItems(userId: string) {
  return (await getAll<SyncQueueItem>("sync_queue"))
    .filter((item) => item.user_id === userId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}
