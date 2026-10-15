"use client";

import { HISTORY_DB, type HistoryMeta, type HistorySession, type HistoryShot } from "./history-types.ts";
import type { HistoryBackend } from "./history-core.ts";

/**
 * The IndexedDB backend for saved tracking history: database hl-history, on this phone only. Stores: meta (schema marker), sessions, shots
 * (indexed by session). Opening only ever ADDS missing stores, so a database left by an earlier build is completed, never rewritten.
 * Session and shots are written in one transaction: a failed write (storage full) leaves nothing half saved.
 */
const DB_VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HISTORY_DB, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
      if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions", { keyPath: "sessionKey" });
      if (!db.objectStoreNames.contains("shots")) db.createObjectStore("shots", { keyPath: "id" }).createIndex("bySession", "sessionKey");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(stores: string[], mode: IDBTransactionMode, fn: (s: Record<string, IDBObjectStore>) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const t = db.transaction(stores, mode);
      const map: Record<string, IDBObjectStore> = {};
      for (const n of stores) map[n] = t.objectStore(n);
      const req = fn(map);
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export const idbHistory: HistoryBackend = {
  async readMeta() {
    const r = (await tx(["meta"], "readonly", (s) => s.meta.get("schema"))) as (HistoryMeta & { key: string }) | undefined;
    return r ?? null;
  },
  async writeMeta(meta) {
    await tx(["meta"], "readwrite", (s) => s.meta.put({ key: "schema", ...meta }));
  },
  async saveSession(session: HistorySession, shots: HistoryShot[]) {
    await tx(["sessions", "shots"], "readwrite", (s) => {
      s.sessions.put(session);
      for (const sh of shots) s.shots.put(sh);
    });
  },
  async listSessionsRaw() {
    return ((await tx(["sessions"], "readonly", (s) => s.sessions.getAll())) as unknown[]) ?? [];
  },
  async listShotsRaw(sessionKey) {
    if (!sessionKey) return ((await tx(["shots"], "readonly", (s) => s.shots.getAll())) as unknown[]) ?? [];
    return ((await tx(["shots"], "readonly", (s) => s.shots.index("bySession").getAll(sessionKey))) as unknown[]) ?? [];
  },
  async deleteSession(sessionKey) {
    await tx(["sessions", "shots"], "readwrite", (s) => {
      s.sessions.delete(sessionKey);
      const cur = s.shots.index("bySession").openKeyCursor(IDBKeyRange.only(sessionKey));
      cur.onsuccess = () => { const c = cur.result; if (c) { s.shots.delete(c.primaryKey); c.continue(); } };
    });
  },
  async deleteShots(ids) {
    await tx(["shots"], "readwrite", (s) => { for (const id of ids) s.shots.delete(id); });
  },
  async deleteAll() {
    await tx(["meta", "sessions", "shots"], "readwrite", (s) => { s.meta.clear(); s.sessions.clear(); s.shots.clear(); });
  },
};
