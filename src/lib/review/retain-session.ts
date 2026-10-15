"use client";

import type { Shot } from "../basketball/shooting.ts";
import { retainSession, type RetainResult } from "./history-core.ts";
import { idbHistory } from "./history-store.ts";
import { historyRetentionEnabled } from "./history-settings.ts";
import { getReviewRecords } from "./review-store.ts";
import { markHistoryUsed, reconcileHistoryNow } from "./history-ops.ts";
import { record as recordDiag, debugEnabled, persist as persistDiag } from "./diagnostics.ts";

export const LAST_RESULT_KEY = "hl:history:last";

type Snapshot = {
  startedAt: string;
  label: string | null | undefined;
  sessionId: string | null | undefined;
  shots: Shot[];
  camera?: { rimX: number; rimY: number } | null;
  cameraStats?: { scale: number | null; ballWidth: number | null } | null;
};

/**
 * Called once when a set is saved. Does nothing (and returns null) unless the session-review flag and the player's retention opt-in are both on.
 * Reads the transient review records the camera loop noted (coordinates only), keeps the compact history rows locally, never throws, never
 * touches the network, and never blocks the save: the caller does not wait for it.
 */
export async function retainHistory(args: { playerId: string; snapshot: Snapshot }): Promise<RetainResult | null> {
  if (!historyRetentionEnabled()) return null;
  try {
    const { snapshot: s, playerId } = args;
    const ids = s.shots.map((x) => x.replayId).filter((x): x is string => !!x);
    const records = await getReviewRecords(ids);
    const first = [...records.values()][0];
    markHistoryUsed();
    void reconcileHistoryNow();
    const res = await retainSession(idbHistory, {
      playerId,
      sessionKey: `${playerId}:${s.startedAt}`,
      sessionId: s.sessionId ?? null,
      label: s.label ?? null,
      startedAt: s.startedAt,
      shots: s.shots.map((x) => ({ seq: x.seq, made: x.made, detectedMade: x.detectedMade, flagged: x.flagged, tMs: x.tMs, replayId: x.replayId })),
      records,
      framing: s.camera ? { rimX: s.camera.rimX, rimY: s.camera.rimY, scale: s.cameraStats?.scale ?? first?.scale ?? 1, ballWidthPx: s.cameraStats?.ballWidth ?? null } : null,
    });
    try { window.localStorage.setItem(LAST_RESULT_KEY, JSON.stringify({ at: Date.now(), status: res.status, shots: res.shots, tracked: res.tracked, bytes: res.bytes, ms: Math.round(res.ms), message: res.message ?? null })); } catch { /* storage unavailable */ }
    if (debugEnabled()) { recordDiag("history.retain", res.ms); persistDiag(); }
    return res;
  } catch {
    return null;
  }
}
