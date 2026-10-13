import { formatPercentage, summarize, type Shot } from "./shooting.ts";
import { goalState, type Goal } from "./goals.ts";

/**
 * What the camera screen's score bar shows, worked out from the shots and the
 * clock so the screen itself only lays it out.
 */

export type ScoreBug = {
  makes: number;
  attempts: number;
  /** "62%" or "—". */
  pct: string;
  /** The run you are on right now: makes, or (when the last shots missed) misses. */
  streak: { kind: "make" | "miss" | "none"; n: number; hot: boolean };
  /** Longest make run in this set. */
  best: number;
  /** The clock cell. */
  clock: {
    /** "down": a time goal counting down; "up": elapsed time; "waiting": nothing started yet. */
    mode: "down" | "up" | "waiting";
    text: string;
    /** 0 to 1 for a time goal; null otherwise. */
    fraction: number | null;
    /** The last stretch of a time goal. */
    urgent: boolean;
  };
  /** A shots / makes / in-a-row goal, shown as its own cell; null without one (a time goal lives in the clock). */
  goal: { label: string; fraction: number } | null;
};

/** Runs of this many makes light the streak cell. */
export const HOT_STREAK = 3;

/** 83000 -> "1:23"; an hour or more -> "1:02:03". */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** `elapsedMs` is null until the set's clock starts (its first shot). */
export function scoreBug(shots: Pick<Shot, "made">[], goal: Goal | null, elapsedMs: number | null): ScoreBug {
  const sum = summarize(shots as Shot[]);
  const run = sum.currentStreak;
  const streak: ScoreBug["streak"] =
    run > 0 ? { kind: "make", n: run, hot: run >= HOT_STREAK } : run < 0 ? { kind: "miss", n: -run, hot: false } : { kind: "none", n: 0, hot: false };

  let clock: ScoreBug["clock"];
  if (goal?.kind === "time") {
    const total = goal.target * 60000;
    const left = Math.max(0, total - (elapsedMs ?? 0));
    clock = {
      mode: "down",
      // Whole seconds rounded up, as the goal itself counts, so 0:00 only shows when time is up.
      text: formatClock(Math.ceil(left / 1000) * 1000),
      fraction: Math.min(1, (elapsedMs ?? 0) / total),
      urgent: elapsedMs !== null && left > 0 && left <= 10_000,
    };
  } else if (elapsedMs === null) {
    clock = { mode: "waiting", text: "0:00", fraction: null, urgent: false };
  } else {
    clock = { mode: "up", text: formatClock(elapsedMs), fraction: null, urgent: false };
  }

  const g = goal && goal.kind !== "time" ? goalState(goal, shots, elapsedMs ?? 0) : null;

  return {
    makes: sum.makes,
    attempts: sum.attempts,
    pct: formatPercentage(sum.pct),
    streak,
    best: sum.longestMakeStreak,
    clock,
    goal: g ? { label: g.label, fraction: g.fraction } : null,
  };
}
