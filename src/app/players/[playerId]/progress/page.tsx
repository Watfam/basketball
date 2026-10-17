import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProgressView } from "@/components/progress/progress-view";
import { loadActivity } from "@/lib/basketball/activity-server";
import { loadProgressRows } from "@/lib/basketball/progress-server";
import { parseRange } from "@/lib/basketball/progress-range";
import { BENCHMARK_WORKOUT_NAME } from "@/lib/basketball/benchmarks";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
type Search = { range?: string; from?: string; to?: string; view?: string; benchmark?: string };

export default async function ProgressPage({ params, searchParams }: { params: Promise<{ playerId: string }>; searchParams: Promise<Search> }) {
  const { playerId } = await params;
  const sp = await searchParams;
  const range = parseRange({ range: first(sp.range), from: first(sp.from), to: first(sp.to) });

  const supabase = await createClient();
  const hoops = supabase.schema("hoops");
  const [{ data: { user } }, { data: player }, activity, progress, { data: benchmarkWorkout }] = await Promise.all([
    supabase.auth.getUser(),
    hoops.from("players").select("id, display_name").eq("id", playerId).maybeSingle(),
    loadActivity(supabase, playerId),
    loadProgressRows(supabase, playerId),
    hoops.from("workouts").select("id").eq("name", BENCHMARK_WORKOUT_NAME).limit(1).maybeSingle(),
  ]);
  if (!user) redirect("/login");
  if (!player) notFound();

  return (
    <ProgressView
      playerId={playerId}
      playerName={player.display_name}
      range={range}
      view={first(sp.view) === "benchmarks" ? "benchmarks" : "overview"}
      selected={first(sp.benchmark)}
      rows={progress.rows}
      workoutAts={activity.activities.filter((a) => a.kind === "workout").map((a) => a.at)}
      hasBenchmarkWorkout={Boolean(benchmarkWorkout)}
      truncated={progress.truncated}
    />
  );
}
