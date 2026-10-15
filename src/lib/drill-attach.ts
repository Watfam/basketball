"use client";

import { saveDrillTracking } from "@/app/actions";
import { readDraft, writeDraft } from "@/lib/use-local-draft";
import { DEFINITIVE_FAILURES, parsePending, pendingKey, type DrillContext, type PendingAttach } from "@/lib/basketball/drill-context";

export type DrillOutcome = { phase: "saving" | "saved" | "waiting" | "failed"; message: string | null; metrics: Record<string, unknown> | null };

const inFlight = new Map<string, Promise<DrillOutcome>>();

/**
 * Attach a saved shot set to its workout drill. The marker stays on this phone until the server has answered for good, so a dropped signal or a
 * closed app only delays the result. The server keeps one result per workout drill, so asking twice is harmless; asking twice at the same moment from
 * this phone shares one request.
 */
export function attachDrillResult(playerId: string, context: DrillContext, shotSessionId: string): Promise<DrillOutcome> {
  const k = `${shotSessionId}|${context.workoutSessionId}|${context.workoutDrillId}`;
  const running = inFlight.get(k);
  if (running) return running;
  writeDraft(pendingKey(playerId), JSON.stringify({ playerId, shotSessionId, context }));
  const p = (async (): Promise<DrillOutcome> => {
    let res: Awaited<ReturnType<typeof saveDrillTracking>>;
    try {
      res = await saveDrillTracking({ playerId, workoutSessionId: context.workoutSessionId, workoutDrillId: context.workoutDrillId, shotSessionId, goal: context.goal });
    } catch {
      res = { error: "offline", code: "offline" };
    }
    if (!res.error) {
      writeDraft(pendingKey(playerId), null);
      return { phase: "saved", message: null, metrics: res.metrics ?? null };
    }
    if (res.code && DEFINITIVE_FAILURES.has(res.code)) {
      writeDraft(pendingKey(playerId), null);
      return { phase: "failed", message: res.error, metrics: null };
    }
    return { phase: "waiting", message: null, metrics: null };
  })().finally(() => inFlight.delete(k));
  inFlight.set(k, p);
  return p;
}

export const pendingDrill = (playerId: string): PendingAttach | null => parsePending(readDraft(pendingKey(playerId)), playerId);

/** Try again for a result that did not land last time. Null when nothing is waiting. */
export async function retryPendingDrill(playerId: string): Promise<{ pending: PendingAttach; outcome: DrillOutcome } | null> {
  const pending = pendingDrill(playerId);
  if (!pending) return null;
  return { pending, outcome: await attachDrillResult(playerId, pending.context, pending.shotSessionId) };
}
