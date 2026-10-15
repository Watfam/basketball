import { planImport, runImport, type ImportPlan } from "./history-transfer.ts";
import { loadHistory, parseSession, type HistoryBackend } from "./history-core.ts";

/**
 * The replay sample (a file of real tracked shot paths made on the computer from existing recordings) is imported into a SEPARATE area, under the
 * player name "sample", so it can never mix into a real player's history, appear in their lists, comparisons or patterns, or be touched by deleting
 * one of their saved sessions. Removing the sample deletes only that area. Everything is local.
 */
export const SAMPLE_PLAYER = "sample";

export const previewSample = (text: string, backend: HistoryBackend, now: number = Date.now()): Promise<ImportPlan> => planImport(text, backend, SAMPLE_PLAYER, { onDuplicate: "skip" }, now);

export async function importSample(text: string, backend: HistoryBackend, now: number = Date.now()): Promise<{ ok: true; added: number; shots: number; skipped: number } | { ok: false; message: string }> {
  const plan = await previewSample(text, backend, now);
  if (!plan.ok) return { ok: false, message: plan.message };
  const res = await runImport(plan, backend);
  return { ok: true, added: res.added, shots: res.shots, skipped: plan.sessions.length - res.added };
}

export async function sampleCounts(backend: HistoryBackend): Promise<{ sessions: number; shots: number }> {
  const h = await loadHistory(backend, SAMPLE_PLAYER);
  return { sessions: h.sessions.length, shots: h.shots.length };
}

/** Delete the sample area and nothing else: only sessions whose player is exactly "sample". Returns how many sets were removed. */
export async function removeSample(backend: HistoryBackend): Promise<number> {
  const keys: string[] = [];
  for (const raw of await backend.listSessionsRaw()) { const p = parseSession(raw); if (p.ok && p.value.playerId === SAMPLE_PLAYER) keys.push(p.value.sessionKey); }
  for (const k of keys) await backend.deleteSession(k);
  return keys.length;
}
