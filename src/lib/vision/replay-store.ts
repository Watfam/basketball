"use client";

/**
 * Shot replays, kept on this phone only (IndexedDB) and only until the set
 * is saved or thrown away. Never uploaded: the video is of children, and a
 * replay's only job is to settle one call before saving.
 */

const DB = "hl-replays";
const STORE = "clips";

export type ReplayClip = { id: string; frames: { t: number; blob: Blob }[] };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Save a clip. Failure (private mode, storage full) only loses the replay. */
export async function saveReplay(clip: ReplayClip): Promise<boolean> {
  try {
    await run("readwrite", (s) => s.put(clip));
    return true;
  } catch {
    return false;
  }
}

export async function getReplay(id: string): Promise<ReplayClip | null> {
  try {
    return ((await run("readonly", (s) => s.get(id))) as ReplayClip | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Delete every replay on this phone: when a set is saved, thrown away, or a new one starts. */
export async function clearReplays(): Promise<void> {
  try {
    await run("readwrite", (s) => s.clear());
  } catch {
    // Nothing stored, or storage unavailable.
  }
}
