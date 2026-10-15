"use client";

import { REVIEW_RECORD_VERSION, parseRecord, type ReviewRecord } from "./types.ts";

/**
 * Review records, kept on this phone only (IndexedDB, its own database so the replay store is untouched). They hold detection coordinates, no
 * pixels, and are never uploaded. Written only while the session-review flag is on. Records older than a day are dropped when a new one is saved.
 * Shape and version: types.ts (ReviewRecord v1). A record with an unknown version is ignored, never guessed at.
 */
const DB = "hl-review";
const STORE = "records";
const MAX_AGE_MS = 24 * 3600 * 1000;

type Stored = ReviewRecord & { savedAt: number };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "shotId" });
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

export async function saveReviewRecord(record: ReviewRecord): Promise<boolean> {
  try {
    await run("readwrite", (s) => s.put({ ...record, savedAt: Date.now() } as Stored));
    void pruneOld();
    return true;
  } catch {
    return false;
  }
}

export async function getReviewRecord(shotId: string): Promise<ReviewRecord | null> {
  try {
    const r = (await run("readonly", (s) => s.get(shotId))) as Stored | undefined;
    return r ? parseRecord(r) : null;
  } catch {
    return null;
  }
}

export async function getReviewRecords(shotIds: string[]): Promise<Map<string, ReviewRecord>> {
  const out = new Map<string, ReviewRecord>();
  for (const id of shotIds) {
    const r = await getReviewRecord(id);
    if (r && r.v === REVIEW_RECORD_VERSION) out.set(id, r);
  }
  return out;
}

export async function clearReviewRecords(): Promise<void> {
  try {
    await run("readwrite", (s) => s.clear());
  } catch {
    // Nothing stored, or storage unavailable.
  }
}

async function pruneOld(): Promise<void> {
  try {
    const all = (await run("readonly", (s) => s.getAll())) as Stored[];
    const old = all.filter((r) => Date.now() - r.savedAt > MAX_AGE_MS);
    for (const r of old) await run("readwrite", (s) => s.delete(r.shotId));
  } catch {
    // Pruning is housekeeping only.
  }
}
