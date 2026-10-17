import type { Shot, ZoneKey } from "./shooting.ts";
import { parseGoal, type Goal } from "./goals.ts";
import type { DrillContext } from "./drill-context.ts";

/**
 * The shooting session as it lives on the phone (local storage), before and while it is synced. Everything the
 * counter does is an edit of this; src/components/shooting-hub.tsx owns the storing.
 */

/** Where a player's set in progress is kept on this phone. */
export const draftKey = (playerId: string) => `hl:shots:${playerId}:draft`;

export type Draft = {
  v: 1;
  sessionId: string | null;
  label: string;
  startedAt: string;
  /**
   * When the set's clock started: its first shot, not the tap on Start shooting, so setting up (opening the camera, aiming) never
   * eats a timed set. Null until then. Sets begun before this existed have none and use startedAt.
   */
  clockStartedAt?: string | null;
  shots: Shot[];
  /** Sticky: stays on the last chosen spot until changed. */
  zone: ZoneKey | null;
  /**
   * What ends the set (src/lib/basketball/goals.ts); it saves itself the
   * moment the goal is reached. Null: no goal, ended by hand.
   */
  goal?: Goal | null;
  /** Drafts from the first version of this, which only counted shots. */
  stopAt?: number | null;
  /**
   * A drill set that runs to a clock, in seconds ("Beat the Clock": 90). Kept apart from goal on purpose: a goal of kind time is in whole minutes
   * and is what the saved set's history shows, so a 90-second drill clock must not be squeezed into it. Drill sets only.
   */
  clockSeconds?: number;
  /** When the player ended the set (ms since 1970), so the time spent reviewing the calls is not counted as shooting time. */
  endedAtMs?: number;
  /** Counted by the camera (taps can still add a shot it missed). */
  mode?: "camera";
  /** Where the rim was aimed, as fractions of the picture, once counting started. */
  camera?: { rimX: number; rimY: number } | null;
  /** Set when the set was started from a workout drill ("Track with Camera"); see drill-context.ts. Absent for every ordinary set. */
  context?: DrillContext;
  /** The set has ended and is being reviewed before saving; kept here so a restarted phone comes back to the review. */
  reviewing?: boolean;
  /** How the camera ran (speed, size), noted when the set ends, for the camera report. This phone only. */
  cameraStats?: { avgFps: number; minFps: number; slowSeen: boolean; scale: number | null; ballWidth: number | null };
  /** Bumped on every edit; a session is synced once syncedRev catches up. */
  rev: number;
  syncedRev: number;
};

export function draftGoal(d: Draft): Goal | null {
  if (d.goal) return parseGoal(d.goal);
  return d.stopAt ? { kind: "shots", target: d.stopAt } : null;
}

/** The goal the counter runs to: the player's own goal, or the drill's clock expressed as minutes for the counter only (never saved as the set's goal). */
export function effectiveGoal(d: Draft): Goal | null {
  return draftGoal(d) ?? (typeof d.clockSeconds === "number" && d.clockSeconds > 0 ? { kind: "time", target: d.clockSeconds / 60 } : null);
}

/** When a set's clock started (ms), or null if it is waiting for the first shot. */
export const clockStart = (d: Pick<Draft, "startedAt" | "clockStartedAt">): number | null =>
  d.clockStartedAt === undefined ? Date.parse(d.startedAt) : d.clockStartedAt ? Date.parse(d.clockStartedAt) : null;

export function parseDraft(raw: string | null): Draft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Draft;
    if (d?.v !== 1 || !Array.isArray(d.shots) || typeof d.startedAt !== "string") return null;
    return d;
  } catch {
    return null;
  }
}

