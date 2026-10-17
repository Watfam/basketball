import { parseTracked, type TrackedMetrics } from "./drill-tracking.ts";
import type { BenchmarkRow } from "./benchmark-analysis.ts";

/** A tracked drill result with where and when it happened: the one shape every progress screen is built from. */
export type ProgressRow = BenchmarkRow & { drillName: string; status: string | null };

type Maybe<T> = T | T[] | null | undefined;
const one = <T,>(x: Maybe<T>): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));

type RawRow = {
  id: string; session_id: string; metrics: unknown; created_at: string;
  drills: Maybe<{ name: string }>;
  workout_sessions: Maybe<{ started_at: string | null; status: string | null; program_days: Maybe<{ week_number: number; day_number: number }> }>;
};

/** Rows as the database returns them (nested objects may arrive as one or as a list) to rows the screens use. Anything that is not a tracked result is dropped. */
export function toProgressRows(raw: unknown[]): ProgressRow[] {
  const out: ProgressRow[] = [];
  for (const r of raw as RawRow[]) {
    const metrics: TrackedMetrics | null = parseTracked(r.metrics);
    const ws = one(r.workout_sessions), d = one(r.drills);
    if (!metrics || !ws || !d) continue;
    const pd = one(ws.program_days);
    out.push({ logId: r.id, workoutSessionId: r.session_id, at: ws.started_at ?? r.created_at, week: pd?.week_number ?? null, day: pd?.day_number ?? null, drillName: d.name, status: ws.status, metrics });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}
