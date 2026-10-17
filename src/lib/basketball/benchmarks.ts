import type { ShootingCategory } from "./drill-shooting.ts";

/**
 * Standardized shooting benchmarks: three existing drills, run under one fixed protocol so a result in week 1 can be compared with the same
 * benchmark in week 3 and week 6. A benchmark is a clearly labelled VARIATION of an existing drill ("Benchmark v1" in the workout entry's variant
 * label); the original drill and every existing workout entry are left alone.
 *
 * The protocol is versioned. Anything that changes what the player does (the attempts, the clock, the spot, the instructions) is a new version, and
 * results from different versions are never compared. The instructions below are what every player sees every time; they are not edited per session.
 *
 * What the camera contributes is only the count: attempts, makes and misses (checked by the player). The movement, the spot and the way the
 * test was run are prescribed here and reported by the player. Nothing below is measured by the camera.
 */

export type BenchmarkKey = "free_throw" | "catch_and_shoot" | "beat_the_clock";

/** A condition of the test the player states before it starts, because it changes what the number means (who passes the ball). */
export type BenchmarkCondition = { key: string; question: string; options: { value: string; label: string }[] };

export type BenchmarkProtocol = {
  key: BenchmarkKey;
  version: number;
  /** What the player sees as the name of the test. */
  title: string;
  /** What this benchmark stands for. */
  skill: string;
  category: ShootingCategory;
  /** The existing drill this is a variation of (exact name) and the exact variant label of the workout entry. */
  drillName: string;
  variantLabel: string;
  /** How the test is bounded: a fixed number of attempts, or a fixed clock. Exactly one is set. */
  attempts: number | null;
  clockSeconds: number | null;
  /** The workout entry's own prescription, which must equal the above (sets x reps, or seconds). */
  entry: { block: "main" | "finisher"; sortOrder: number; sets: number | null; reps: number | null; seconds: number | null };
  /** Where on the floor, in words. */
  spot: string;
  /** The same for every player and every level. */
  difficulty: string;
  instructions: string[];
  conditions: BenchmarkCondition[];
  /** What the result means, and what it does not. */
  reads: string;
};

const COMMON_FRESH = "Do this on a day you feel fresh, not straight after another workout, and do the warm-up first.";

export const BENCHMARKS: BenchmarkProtocol[] = [
  {
    key: "free_throw", version: 1, title: "Free Throw Benchmark",
    skill: "Shooting foundation: the same shot, standing still, fresh.",
    category: "stationary", drillName: "Free Throw Reset", variantLabel: "Benchmark v1",
    attempts: 30, clockSeconds: null,
    entry: { block: "main", sortOrder: 1, sets: 3, reps: 10, seconds: null },
    spot: "The free-throw line.",
    difficulty: "Standard: the same for every player and level.",
    instructions: [
      COMMON_FRESH,
      "Warm up with ten easy form shots, then rest 30 seconds.",
      "Stand at the free-throw line. Use the exact same routine on every shot: the same number of dribbles, the same breath, your eyes on the same spot on the rim.",
      "Shoot 30 free throws, one at a time. Count every shot you take, including the ones you would rather forget.",
      "Get your own rebound and go straight back to the line. Take no more than 20 seconds between shots.",
      "Do not stop and redo it. If you lose count, finish the set and fix the numbers afterwards.",
    ],
    conditions: [],
    reads: "How often you make a free throw, fresh, under the same routine. The Free Throw Reset drill is two shots between blocks at game fatigue; this is 30 in a row, fresh, so the two are not comparable.",
  },
  {
    key: "catch_and_shoot", version: 1, title: "Catch-and-Shoot Benchmark",
    skill: "Movement into shooting: sprint off a screen, catch, shoot.",
    category: "catch_and_shoot", drillName: "Catch-and-Shoot off the Pin-Down", variantLabel: "Benchmark v1 · both wings",
    attempts: 30, clockSeconds: null,
    entry: { block: "main", sortOrder: 2, sets: 2, reps: 15, seconds: null },
    spot: "The right wing for the first 15, then the left wing for the next 15. Mark both spots with tape or chalk the first time and use the same marks every time.",
    difficulty: "Standard: the same for every player and level.",
    instructions: [
      COMMON_FRESH,
      "Set a chair or cone at the elbow as the screener, as in the Pin-Down drill. Mark your two wing spots the first time and keep them.",
      "Each rep: start under the rim, sprint off the chair to the wing spot, catch the pass and shoot.",
      "First set: 15 reps to the right wing. Rest 20 seconds. Second set: 15 reps to the left wing.",
      "Say before you start who is passing, and use the same every time: a partner, or you passing to yourself.",
      "Count every shot you take. If the pass is bad and you do not shoot, repeat the rep; it does not count.",
      "Do not stop and redo it. If you lose count, finish the set and fix the numbers afterwards.",
    ],
    conditions: [{ key: "pass_from", question: "Who is passing to you?", options: [{ value: "partner", label: "A partner" }, { value: "self", label: "I pass to myself" }] }],
    reads: "How often you make a catch-and-shoot after a sprint, from your two marked wing spots, with the same kind of pass. Results with a partner and results passing to yourself are kept apart.",
  },
  {
    key: "beat_the_clock", version: 1, title: "Beat the Clock Benchmark",
    skill: "Time-constrained shooting: make as many as you can from one spot in a fixed time.",
    category: "pressure_challenge", drillName: "Beat the Clock Finisher", variantLabel: "Benchmark v1 · right elbow",
    attempts: null, clockSeconds: 90,
    entry: { block: "finisher", sortOrder: 3, sets: null, reps: null, seconds: 90 },
    spot: "The right elbow. Mark it with tape or chalk the first time and use the same mark every time.",
    difficulty: "Standard: the same for every player and level.",
    instructions: [
      COMMON_FRESH,
      "This is the last test of the day. The clock is 90 seconds and starts with your first shot.",
      "One spot: your marked right elbow. Shoot, chase your own rebound, return to the spot, shoot again, until the clock ends.",
      "Game speed the whole time: no walking after the rebound.",
      "Count every shot you take. Your score is your makes in the 90 seconds; your attempts and percentage are kept too.",
      "One try per benchmark day. Do not stop and redo it.",
    ],
    conditions: [],
    reads: "How many you make, and what share of your shots go in, in 90 seconds from one spot. More makes can come from taking more shots (pace) or from making a higher share, so the share is what is compared.",
  },
];

export const protocolId = (p: Pick<BenchmarkProtocol, "key" | "version">) => `${p.key}@v${p.version}`;
export const BENCHMARK_WORKOUT_NAME = "Shot Builder — Benchmark Check (v1)";
/** The planned benchmark weeks of the Six-Week Shot Builder. */
export const BENCHMARK_WEEKS = [1, 3, 6] as const;
export const BENCHMARK_PROGRAM_NAME = "Six-Week Shot Builder";

const LABEL = /^Benchmark v(\d+)\b/;
/** True for a workout entry's variant label that claims to be a benchmark. Used only to keep such entries from being scaled by the weekly volume step. */
export const isBenchmarkLabel = (label: string | null | undefined): boolean => typeof label === "string" && LABEL.test(label);

export type EntryShape = { drillName: string; variantLabel: string | null; sets: number | null; reps: number | null; seconds: number | null; levels?: string[] | null; levelTargets?: unknown };

/**
 * The protocol a workout entry is an exact copy of, or null. The drill name, the variant label and the prescription must all match the protocol:
 * an entry someone has edited, or that only looks similar, is just an ordinary drill and is never counted as a benchmark.
 */
export function benchmarkForEntry(e: EntryShape): BenchmarkProtocol | null {
  if (!isBenchmarkLabel(e.variantLabel)) return null;
  const p = BENCHMARKS.find((b) => b.drillName === e.drillName && b.variantLabel === e.variantLabel);
  if (!p) return null;
  const same = (e.sets ?? null) === p.entry.sets && (e.reps ?? null) === p.entry.reps && (e.seconds ?? null) === p.entry.seconds;
  const plain = (!e.levels || e.levels.length === 0) && (!e.levelTargets || Object.keys(e.levelTargets as object).length === 0);
  return same && plain ? p : null;
}

export function protocolFromId(id: string | null | undefined): BenchmarkProtocol | null {
  return BENCHMARKS.find((p) => protocolId(p) === id) ?? null;
}

/** The shot goal the hub runs a benchmark to: the protocol's own attempts or clock. */
export const benchmarkGoal = (p: BenchmarkProtocol) => (p.attempts ? { kind: "shots" as const, target: p.attempts } : { kind: "time" as const, target: p.clockSeconds! });

/** What the player said about the conditions, checked against the protocol. Unknown keys and values are refused; a missing answer is kept as unknown, not guessed. */
export function checkConditions(p: BenchmarkProtocol, given: unknown): { conditions: Record<string, string> | null; complete: boolean } {
  if (p.conditions.length === 0) return { conditions: null, complete: true };
  const out: Record<string, string> = {};
  const g = (given && typeof given === "object" ? given : {}) as Record<string, unknown>;
  for (const c of p.conditions) {
    const v = g[c.key];
    if (typeof v === "string" && c.options.some((o) => o.value === v)) out[c.key] = v;
  }
  const complete = p.conditions.every((c) => c.key in out);
  return { conditions: Object.keys(out).length ? out : null, complete };
}

export const conditionsKey = (c: Record<string, string> | null | undefined): string =>
  c ? Object.keys(c).sort().map((k) => `${k}=${c[k]}`).join("&") : "";

export function describeConditions(p: BenchmarkProtocol, c: Record<string, string> | null | undefined): string | null {
  if (!c) return p.conditions.length ? "conditions not recorded" : null;
  return p.conditions.map((q) => q.options.find((o) => o.value === c[q.key])?.label).filter(Boolean).join(", ") || null;
}

/** What is and is not claimed about a benchmark, in the words every benchmark screen uses. */
export const BENCHMARK_HONESTY = {
  counted: "The camera counts attempts and makes and calls each make or miss; you check them and can fix any it got wrong.",
  prescribed: "The spot, the movement and the way the test is run are set by the protocol and reported by you. The camera does not see them.",
  notMeasured: "Footwork, balance, release and decision-making are not measured.",
  notGame: "These are practice results. They do not show how the same shots go in a game.",
} as const;
