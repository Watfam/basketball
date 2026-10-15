"use client";

import { applyDeletion, applyRestore, runPending, type OpStore, type PendingOp, type SessionMatch } from "./history-core.ts";
import { idbHistory } from "./history-store.ts";

/**
 * Client glue for deleting a saved session's tracking history. Called AFTER the server delete succeeded (a failed server delete leaves the
 * history alone). Costs nothing for a player who never used history: it only touches the store if this phone has ever saved any
 * (marker hl:history:used, set at the first save), whatever the feature flag says now.
 */
export const HISTORY_USED_KEY = "hl:history:used";
export const PENDING_KEY = "hl:history:pending";

const ls = () => { try { return window.localStorage; } catch { return null; } };
export const historyEverUsed = () => ls()?.getItem(HISTORY_USED_KEY) === "1";
export function markHistoryUsed() { try { ls()?.setItem(HISTORY_USED_KEY, "1"); } catch { /* storage unavailable */ } }

export const localOps: OpStore = {
  read(): PendingOp[] { try { const v = JSON.parse(ls()?.getItem(PENDING_KEY) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } },
  write(ops) { try { if (ops.length) ls()?.setItem(PENDING_KEY, JSON.stringify(ops)); else ls()?.removeItem(PENDING_KEY); } catch { /* storage unavailable */ } },
};

/** The saved session was deleted: hide its tracking history now (removed for good after the undo window). Never throws. */
export async function forgetSessionHistory(m: SessionMatch): Promise<void> {
  if (!historyEverUsed() && localOps.read().length === 0) return;
  try { await applyDeletion(idbHistory, localOps, m, Date.now()); } catch { /* queued or unavailable: retried by reconcileHistoryNow */ }
}
/** Undo of a delete: bring the hidden history back. Never throws. */
export async function restoreSessionHistory(m: SessionMatch): Promise<void> {
  if (!historyEverUsed() && localOps.read().length === 0) return;
  try { await applyRestore(idbHistory, localOps, m, Date.now()); } catch { /* retried later */ }
}
/** Finish anything waiting and remove expired hidden history. Safe to call often. */
export async function reconcileHistoryNow(): Promise<void> {
  if (!historyEverUsed() && localOps.read().length === 0) return;
  try { await runPending(idbHistory, localOps, Date.now()); } catch { /* try again next time */ }
}
