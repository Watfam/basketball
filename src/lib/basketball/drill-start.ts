import type { DrillContext } from "./drill-context.ts";
import type { LessonView } from "./drill-session-view.ts";
import type { BenchmarkProtocol } from "./benchmarks.ts";

/** What the shooting screen shows when it was opened from a workout drill ("Track with Camera"). */
export type DrillStart = { context: DrillContext; categoryLabel: string; planLabel: string | null; workoutName: string | null; lesson: LessonView | null; benchmark: BenchmarkProtocol | null };
export type DrillStartProblem = { problem: string };
export const isProblem = (x: DrillStart | DrillStartProblem): x is DrillStartProblem => "problem" in x;
