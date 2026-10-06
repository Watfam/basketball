/**
 * What ends a shooting set. Chosen before the set starts; the set saves
 * itself the moment it is reached, so nobody walks back to the phone.
 *
 * - shots: a number of attempts ("50 shots").
 * - makes: until a number of makes ("Make 10").
 * - time: a number of minutes ("5 minutes"); the counter shows time left.
 * - streak: until that many makes in a row ("3 in a row"). That can take
 *   forever on a cold day, so it also ends at STREAK_CAP shots.
 *
 * Pure functions over the shot list, so the counter, the summary and the
 * tests all agree on when a set is over.
 */

export type GoalKind = "shots" | "makes" | "time" | "streak";
export type Goal = { kind: GoalKind; target: number };

export const STREAK_CAP = 100;

export const GOAL_KINDS: { kind: GoalKind; label: string; choices: number[]; step: number; min: number; max: number }[] = [
  { kind: "shots", label: "Shots", choices: [25, 50, 100], step: 5, min: 5, max: 500 },
  { kind: "makes", label: "Makes", choices: [10, 25, 50], step: 5, min: 1, max: 300 },
  { kind: "time", label: "Time", choices: [3, 5, 10], step: 1, min: 1, max: 60 },
  { kind: "streak", label: "In a row", choices: [3, 5, 10], step: 1, min: 2, max: 50 },
];

export function goalSpec(kind: GoalKind) {
  return GOAL_KINDS.find((k) => k.kind === kind) ?? GOAL_KINDS[0];
}

/** A goal read back from storage, or null when it isn't a valid one. */
export function parseGoal(value: unknown): Goal | null {
  if (!value || typeof value !== "object") return null;
  const { kind, target } = value as { kind?: unknown; target?: unknown };
  const spec = GOAL_KINDS.find((k) => k.kind === kind);
  if (!spec || typeof target !== "number" || !Number.isFinite(target)) return null;
  return { kind: spec.kind, target: Math.min(spec.max, Math.max(spec.min, Math.round(target))) };
}

export function clampGoal(goal: Goal): Goal {
  const spec = goalSpec(goal.kind);
  return { kind: goal.kind, target: Math.min(spec.max, Math.max(spec.min, Math.round(goal.target))) };
}

/** "50 shots", "Make 10", "5 min", "3 in a row". */
export function describeGoal(goal: Goal): string {
  switch (goal.kind) {
    case "shots":
      return `${goal.target} shots`;
    case "makes":
      return `Make ${goal.target}`;
    case "time":
      return `${goal.target} min`;
    case "streak":
      return `${goal.target} in a row`;
  }
}

type ShotLike = { made: boolean };

function currentMakeRun(shots: ShotLike[]): number {
  let run = 0;
  for (let i = shots.length - 1; i >= 0 && shots[i].made; i -= 1) run += 1;
  return run;
}

export type GoalState = {
  reached: boolean;
  /** For the counter: "12 of 50", "6 of 10 made", "3:12 left", "2 in a row · best 2". */
  label: string;
  /** 0 to 1, for a progress bar. */
  fraction: number;
  /** Streak goals only: ended by the safety cap rather than the streak. */
  capped?: boolean;
};

export function goalState(goal: Goal, shots: ShotLike[], elapsedMs: number): GoalState {
  const attempts = shots.length;
  const makes = shots.filter((s) => s.made).length;
  switch (goal.kind) {
    case "shots":
      return { reached: attempts >= goal.target, label: `${Math.min(attempts, goal.target)} of ${goal.target}`, fraction: Math.min(1, attempts / goal.target) };
    case "makes":
      return { reached: makes >= goal.target, label: `${Math.min(makes, goal.target)} of ${goal.target} made`, fraction: Math.min(1, makes / goal.target) };
    case "time": {
      const total = goal.target * 60000;
      const left = Math.max(0, total - elapsedMs);
      const s = Math.ceil(left / 1000);
      return {
        reached: left <= 0,
        label: left <= 0 ? "Time" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} left`,
        fraction: Math.min(1, elapsedMs / total),
      };
    }
    case "streak": {
      const run = currentMakeRun(shots);
      const reachedStreak = run >= goal.target;
      const capped = !reachedStreak && attempts >= STREAK_CAP;
      return {
        reached: reachedStreak || capped,
        capped,
        label: `${Math.min(run, goal.target)} in a row · goal ${goal.target}`,
        fraction: Math.min(1, run / goal.target),
      };
    }
  }
}

/** How a saved set's goal reads in history: "Make 10 ✓", "3 in a row · not reached". */
export function describeSavedGoal(kind: string | null, target: number | null, reached: boolean | null): string | null {
  const goal = parseGoal({ kind, target });
  if (!goal) return null;
  if (reached === null) return describeGoal(goal);
  return reached ? `${describeGoal(goal)} ✓` : `${describeGoal(goal)} · not reached`;
}
