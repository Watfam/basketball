import type { createClient } from "@/lib/supabase/server";
import { categoryStats, compareCategoriesAtSameSpot, describeSeries, drillSeries, type CategoryStat, type SpotComparison, type Statement, type TrackedRow } from "@/lib/basketball/drill-analytics";
import { parseTracked } from "@/lib/basketball/drill-tracking";
import type { ShootingCategory } from "@/lib/basketball/drill-shooting";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type KindsOfShotData = { stats: CategoryStat[]; comparisons: SpotComparison[]; repeated: { name: string; statement: Statement }[]; drills: number };

const PAIRS: [ShootingCategory, ShootingCategory][] = [["catch_and_shoot", "off_the_dribble"], ["stationary", "catch_and_shoot"], ["stationary", "off_the_dribble"], ["stationary", "movement"], ["movement", "off_the_dribble"]];

/** The player's tracked workout drills, kept by kind of shot. Null until at least one drill has been tracked. */
export async function loadKindsOfShot(supabase: Supabase, playerId: string): Promise<KindsOfShotData | null> {
  const { data, error } = await supabase
    .schema("hoops")
    .from("session_logs")
    .select("id, session_id, metrics, drills(name), workout_sessions!inner(player_id, started_at)")
    .eq("workout_sessions.player_id", playerId)
    .eq("metrics->>type", "shooting")
    .limit(1000);
  if (error || !data) return null;
  const rows: TrackedRow[] = [];
  for (const r of data as unknown as { id: string; session_id: string; metrics: unknown; drills: { name: string } | { name: string }[] | null; workout_sessions: { started_at: string } | { started_at: string }[] }[]) {
    const m = parseTracked(r.metrics);
    const d = Array.isArray(r.drills) ? r.drills[0] : r.drills;
    const w = Array.isArray(r.workout_sessions) ? r.workout_sessions[0] : r.workout_sessions;
    if (m && d && w) rows.push({ logId: r.id, workoutSessionId: r.session_id, at: w.started_at, drillName: d.name, metrics: m });
  }
  if (rows.length === 0) return null;
  const stats = categoryStats(rows), present = new Set(stats.map((s) => s.category));
  const comparisons = PAIRS.filter(([a, b]) => present.has(a) && present.has(b)).flatMap(([a, b]) => compareCategoriesAtSameSpot(rows, a, b));
  const repeated = drillSeries(rows).filter((s) => s.points.length >= 2).slice(0, 4).map((s) => ({ name: `${s.drillName}${s.variant ? ` (${s.variant})` : ""}`, statement: describeSeries(s) }));
  return { stats, comparisons, repeated, drills: rows.length };
}
