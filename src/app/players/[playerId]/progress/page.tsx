import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProgressView } from "@/components/progress/progress-view";
import { loadActivity } from "@/lib/basketball/activity-server";
import { loadProgressRows } from "@/lib/basketball/progress-server";
import { parseRange } from "@/lib/basketball/progress-range";
import { BENCHMARK_WORKOUT_NAME, BENCHMARKS } from "@/lib/basketball/benchmarks";
import { loadLessonContext } from "@/lib/basketball/drill-film-server";
import { lessonsForDrill, lessonUrl } from "@/lib/basketball/drill-film";
import { daysAgo } from "@/lib/basketball/progress-range";
import type { LessonLite } from "@/lib/basketball/insights";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
type Search = { range?: string; from?: string; to?: string; view?: string; benchmark?: string; category?: string; drill?: string };

export default async function ProgressPage({ params, searchParams }: { params: Promise<{ playerId: string }>; searchParams: Promise<Search> }) {
  const { playerId } = await params;
  const sp = await searchParams;
  const range = parseRange({ range: first(sp.range), from: first(sp.from), to: first(sp.to) });

  const supabase = await createClient();
  const hoops = supabase.schema("hoops");
  const [{ data: { user } }, { data: player }, activity, progress, { data: benchmarkWorkout }] = await Promise.all([
    supabase.auth.getUser(),
    hoops.from("players").select("id, display_name, household_id").eq("id", playerId).maybeSingle(),
    loadActivity(supabase, playerId),
    loadProgressRows(supabase, playerId),
    hoops.from("workouts").select("id").eq("name", BENCHMARK_WORKOUT_NAME).limit(1).maybeSingle(),
  ]);
  if (!user) redirect("/login");
  if (!player) notFound();

  // The Film Room lesson for each drill shown here, from the lessons the Film Room already links to that drill (read only).
  const names = [...new Set([...progress.rows.map((r) => r.drillName), ...BENCHMARKS.map((b) => b.drillName)])];
  const [{ data: drillRows }, film] = await Promise.all([
    hoops.from("drills").select("id, name").in("name", names),
    loadLessonContext(supabase, playerId, (player as { household_id?: string | null }).household_id ?? null),
  ]);
  const lessons = new Map<string, LessonLite>();
  for (const d of (drillRows ?? []) as { id: string; name: string }[]) {
    const found = lessonsForDrill(d, film.lessons);
    if (found) lessons.set(d.name, { title: found.primary.title, watched: film.watched.has(found.primary.id), url: lessonUrl(found.primary, film.householdLinks), href: `/players/${playerId}/film?lesson=${found.primary.id}` });
  }

  return (
    <ProgressView
      playerId={playerId}
      playerName={player.display_name}
      range={range}
      view={first(sp.view) === "benchmarks" ? "benchmarks" : first(sp.view) === "shooting" ? "shooting" : "overview"}
      selected={first(sp.benchmark)}
      category={first(sp.category)}
      drill={first(sp.drill)}
      now={daysAgo(0)}
      lessonFor={(name) => lessons.get(name) ?? null}
      rows={progress.rows}
      workoutAts={activity.activities.filter((a) => a.kind === "workout").map((a) => a.at)}
      hasBenchmarkWorkout={Boolean(benchmarkWorkout)}
      truncated={progress.truncated}
    />
  );
}
