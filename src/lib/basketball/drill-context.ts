import type { TrackingGoal } from "./drill-shooting.ts";

/**
 * The workout drill a shooting set was started for. It travels with the set while it is shot (inside the phone's own draft of the set) so the
 * set can still be attached to its drill after the app is closed and reopened, and it gives the way back to the right step of the workout.
 * The way back is BUILT from the ids here, never taken from the address bar, so it cannot be pointed somewhere else.
 */
export type DrillContext = {
  workoutSessionId: string;
  workoutDrillId: string;
  drillName: string;
  variant: string | null;
  goal: TrackingGoal | null;
};

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isId = (v: unknown): v is string => typeof v === "string" && ID.test(v);

/** The name the set is saved under in the shooting history: the drill, and which version of it. */
export const drillSetLabel = (c: Pick<DrillContext, "drillName" | "variant">): string => (c.variant ? `${c.drillName} · ${c.variant}` : c.drillName).slice(0, 60);

export function parseContext(raw: unknown): DrillContext | null {
  const c = raw as Partial<DrillContext> | null;
  if (!c || typeof c !== "object" || !isId(c.workoutSessionId) || !isId(c.workoutDrillId) || typeof c.drillName !== "string" || !c.drillName) return null;
  const g = c.goal;
  const goal = g && (g.kind === "shots" || g.kind === "time") && Number.isInteger(g.target) && g.target > 0 && g.target <= 3600 ? { kind: g.kind, target: g.target } : null;
  return { workoutSessionId: c.workoutSessionId, workoutDrillId: c.workoutDrillId, drillName: c.drillName.slice(0, 80), variant: typeof c.variant === "string" ? c.variant.slice(0, 60) : null, goal };
}

export const sameDrill = (a: DrillContext | null | undefined, b: DrillContext | null | undefined) => !!a && !!b && a.workoutSessionId === b.workoutSessionId && a.workoutDrillId === b.workoutDrillId;

/** Back to the workout, on the drill that was just tracked. */
export const workoutReturnPath = (playerId: string, c: Pick<DrillContext, "workoutSessionId" | "workoutDrillId">): string => `/players/${playerId}/sessions/${c.workoutSessionId}?tracked=${c.workoutDrillId}`;

/** The way into tracking, from a drill card. */
export const trackingPath = (playerId: string, workoutSessionId: string, workoutDrillId: string): string => `/players/${playerId}/shooting?workout=${workoutSessionId}&entry=${workoutDrillId}`;

/** A result still waiting to be attached to its drill (the set is saved; the drill's log is not yet). Kept on the phone until it lands. */
export type PendingAttach = { playerId: string; shotSessionId: string; context: DrillContext };
export const pendingKey = (playerId: string) => `hl:drill-pending:${playerId}`;
export function parsePending(raw: string | null, playerId: string): PendingAttach | null {
  try {
    const p = JSON.parse(raw ?? "null") as Partial<PendingAttach> | null;
    const context = parseContext(p?.context);
    if (!p || p.playerId !== playerId || !isId(p.shotSessionId) || !context) return null;
    return { playerId, shotSessionId: p.shotSessionId, context };
  } catch {
    return null;
  }
}
/** Failures that retrying cannot fix: the pending result is dropped rather than retried forever. */
export const DEFINITIVE_FAILURES = new Set(["no_workout", "closed", "no_entry", "not_trackable", "no_shots", "bad_input"]);
