import type { HistoryBackend } from "./history-core.ts";
import type { HistoryMeta, HistorySession, HistoryShot } from "./history-types.ts";

/** A throwaway in-memory store with the same interface as the phone's, for the on-phone replay test: it never touches saved history. */
export function memoryBackend(): HistoryBackend & { sessions: Map<string, unknown>; shots: Map<string, unknown> } {
  let meta: unknown = null;
  const sessions = new Map<string, unknown>(), shots = new Map<string, unknown>();
  return {
    sessions, shots,
    async readMeta() { return meta; },
    async writeMeta(m: HistoryMeta) { meta = m; },
    async saveSession(s: HistorySession, rows: HistoryShot[]) { sessions.set(s.sessionKey, structuredClone(s)); for (const r of rows) shots.set(r.id, structuredClone(r)); },
    async listSessionsRaw() { return [...sessions.values()].map((x) => structuredClone(x)); },
    async listShotsRaw(k?: string) { return [...shots.values()].filter((x) => !k || (x as HistoryShot).sessionKey === k).map((x) => structuredClone(x)); },
    async deleteSession(k: string) { sessions.delete(k); for (const [id, v] of shots) if ((v as HistoryShot).sessionKey === k) shots.delete(id); },
    async deleteShots(ids: string[]) { for (const id of ids) shots.delete(id); },
    async deleteAll() { meta = null; sessions.clear(); shots.clear(); },
  };
}
