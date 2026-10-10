/**
 * Shooting session domain logic.
 *
 * Everything here is a pure function over a list of shots, so the same
 * code drives the live counter, the saved-session summary, and later the
 * camera tracker's scoring — one definition of "a make" and "a streak"
 * for all of them.
 */

export type ZoneKey =
  | "free_throw"
  | "paint"
  | "left_corner"
  | "left_wing"
  | "top"
  | "right_wing"
  | "right_corner";

/** Order is the order chips are shown and breakdowns are listed. */
export const ZONES: { key: ZoneKey; label: string }[] = [
  { key: "free_throw", label: "Free throw" },
  { key: "paint", label: "Paint" },
  { key: "left_corner", label: "Left corner" },
  { key: "left_wing", label: "Left wing" },
  { key: "top", label: "Top" },
  { key: "right_wing", label: "Right wing" },
  { key: "right_corner", label: "Right corner" },
];

export type ShotSource = "manual" | "camera";

export type Shot = {
  seq: number;
  /** The final, human-confirmed result. */
  made: boolean;
  zone: ZoneKey | null;
  source: ShotSource;
  /**
   * What the camera decided before any correction. Null for a tapped shot.
   * Kept so detector accuracy can be measured from real use.
   */
  detectedMade: boolean | null;
  /** Camera only: the rule wasn't sure (src/lib/vision/shotRules.ts FLAG); worth a look. */
  flagged?: boolean;
  /** Camera only: ms from the start of the set to the ball reaching the rim. */
  tMs?: number;
  /** In a camera set, a shot the player added because the camera missed it. */
  addedByHand?: boolean;
  /** Camera only, on this phone only: the shot's replay (src/lib/vision/replay-store.ts). Never synced. */
  replayId?: string;
};

/** Seq is always 1..n with no gaps, so a snapshot can be upserted on it. */
function renumber(shots: Shot[]): Shot[] {
  return shots.map((s, i) => (s.seq === i + 1 ? s : { ...s, seq: i + 1 }));
}

export function addShot(
  shots: Shot[],
  made: boolean,
  zone: ZoneKey | null,
  source: ShotSource = "manual",
  detectedMade: boolean | null = null,
  extra: Pick<Shot, "flagged" | "tMs" | "addedByHand" | "replayId"> = {}
): Shot[] {
  return [...shots, { seq: shots.length + 1, made, zone, source, detectedMade, ...extra }];
}

export function undoLastShot(shots: Shot[]): Shot[] {
  return shots.slice(0, -1);
}

/** Flips one shot's result — the correction path for a mis-tap or a mis-call. */
export function toggleShot(shots: Shot[], seq: number): Shot[] {
  return shots.map((s) => (s.seq === seq ? { ...s, made: !s.made } : s));
}

export function removeShot(shots: Shot[], seq: number): Shot[] {
  return renumber(shots.filter((s) => s.seq !== seq));
}

/** Null when there are no attempts — 0/0 is "no data", not 0%. */
export function percentage(makes: number, attempts: number): number | null {
  if (attempts <= 0) return null;
  return Math.round((makes / attempts) * 1000) / 10;
}

export function formatPercentage(pct: number | null): string {
  if (pct === null) return "—";
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;
}

export type ShotSummary = {
  makes: number;
  attempts: number;
  pct: number | null;
  /** Length of the run at the end of the session; positive = makes, negative = misses. */
  currentStreak: number;
  longestMakeStreak: number;
  longestMissStreak: number;
};

export function summarize(shots: Shot[]): ShotSummary {
  const makes = shots.filter((s) => s.made).length;

  let longestMake = 0;
  let longestMiss = 0;
  let run = 0; // signed: >0 make run, <0 miss run

  for (const s of shots) {
    if (s.made) run = run > 0 ? run + 1 : 1;
    else run = run < 0 ? run - 1 : -1;
    longestMake = Math.max(longestMake, run);
    longestMiss = Math.max(longestMiss, -run);
  }

  return {
    makes,
    attempts: shots.length,
    pct: percentage(makes, shots.length),
    currentStreak: run,
    longestMakeStreak: longestMake,
    longestMissStreak: longestMiss,
  };
}

export type ZoneBreakdown = {
  zone: ZoneKey;
  label: string;
  makes: number;
  attempts: number;
  pct: number | null;
};

/** Only zones that saw at least one attempt, in court order. */
export function byZone(shots: Shot[]): ZoneBreakdown[] {
  return ZONES.map(({ key, label }) => {
    const inZone = shots.filter((s) => s.zone === key);
    const makes = inZone.filter((s) => s.made).length;
    return { zone: key, label, makes, attempts: inZone.length, pct: percentage(makes, inZone.length) };
  }).filter((z) => z.attempts > 0);
}

/**
 * How often the camera's call survived review, over the camera shots that
 * have a recorded call. This is the accuracy number that matters, and the
 * only honest way to get it is from corrections made in real use.
 */
export function detectorAgreement(shots: Shot[]): { agreed: number; total: number; pct: number | null } {
  const judged = shots.filter((s) => s.source === "camera" && s.detectedMade !== null);
  const agreed = judged.filter((s) => s.detectedMade === s.made).length;
  return { agreed, total: judged.length, pct: percentage(agreed, judged.length) };
}

/** Elapsed minutes, for "20 shots in 6 min". Null if either end is missing. */
export function durationMinutes(startedAt: string | null, endedAt: string | null): number | null {
  if (!startedAt || !endedAt) return null;
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.max(1, Math.round(ms / 60000));
}

/**
 * Basketball seasons run across the new year, so "this season" starts on
 * August 1: this year's if that has passed, otherwise last year's.
 */
export function seasonStart(now: Date = new Date()): Date {
  const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(year, 7, 1);
}

export type SessionRow = { label: string | null; started_at: string; makes: number; attempts: number };

export type SessionTotals = {
  makes: number;
  attempts: number;
  pct: number | null;
  sessions: number;
  /** Best make % in one session of at least BEST_MIN_SHOTS shots; ties go to more makes. */
  best: (SessionRow & { pct: number }) | null;
};

/** A 3-for-3 day shouldn't count as a best session. */
export const BEST_MIN_SHOTS = 10;

/** Totals over saved sessions, read from each session row's own totals. */
export function totalSessions(rows: SessionRow[]): SessionTotals {
  let makes = 0;
  let attempts = 0;
  let best: SessionTotals["best"] = null;
  for (const r of rows) {
    makes += r.makes;
    attempts += r.attempts;
    const pct = percentage(r.makes, r.attempts);
    if (pct === null || r.attempts < BEST_MIN_SHOTS) continue;
    if (!best || pct > best.pct || (pct === best.pct && r.makes > best.makes)) best = { ...r, pct };
  }
  return { makes, attempts, pct: percentage(makes, attempts), sessions: rows.filter((r) => r.attempts > 0).length, best };
}

/** Shots a minute, to one decimal; null when the session is too short to say. */
export function shotsPerMinute(attempts: number, startedAt: string | null, endedAt: string | null): number | null {
  if (!startedAt || !endedAt || attempts === 0) return null;
  const minutes = (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000;
  if (!(minutes >= 0.5)) return null;
  return Math.round((attempts / minutes) * 10) / 10;
}
