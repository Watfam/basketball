import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rankWorkouts, explainMatch, type PlayerType } from "@/lib/basketball/workout-matching";
import { rankPrograms, explainProgram } from "@/lib/basketball/program";
import { rankFilm } from "@/lib/basketball/film";
import type { Workout } from "@/components/workout-card";
import { BENCHMARK_WORKOUT_NAME } from "@/lib/basketball/benchmarks";
import { analyzeBenchmarks } from "@/lib/basketball/benchmark-analysis";
import { loadProgressRows } from "@/lib/basketball/progress-server";
import { isCustomWorkout, isTemporaryWorkout, workoutMinutes } from "@/lib/basketball/workout-minutes";
import type { DrillEntry } from "@/lib/basketball/prescription";
import type { OfferedProgram } from "@/components/program-offer";
import { TrainHomeView } from "@/components/train/train-home-view";
import { playerLevel, WEAKNESS_THRESHOLD, type ComputedPlayerType } from "@/lib/basketball/assessment";

/**
 * Train: what to do next, and the doors to everything that builds the player: the workout library, the Film Room, building a workout of
 * your own, the program they're on (or the one that fits best), and the workouts they have saved. Each door says how much is behind it.
 */
export default async function TrainPage({ params, searchParams }: { params: Promise<{ playerId: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { playerId } = await params;
  const { saved } = await searchParams;
  const supabase = await createClient();
  const hoops = supabase.schema("hoops");

  const [
    { data: { user } },
    { data: player },
    { data: workouts, error: workoutsError },
    { data: completed },
    { data: enrollment },
    { data: programs },
    { data: filmRows },
    { data: filmViews },
    progress,
  ] = await Promise.all([
    supabase.auth.getUser(),
    hoops.from("players").select("id, display_name, player_type").eq("id", playerId).maybeSingle(),
    // The library is readable by anyone signed in; it's loaded by the coach, not written here.
    hoops
      .from("workouts")
      .select(
        "id, name, description, focus_areas, estimated_minutes, player_type_tags, workout_drills(id, drill_id, sort_order, block, variant_label, levels, level_targets, target_sets, target_reps, target_duration_seconds, drills(id, name, description, video_url, source_trainer, difficulty))"
      ),
    hoops
      .from("workout_sessions")
      .select("workout_id, completed_at")
      .eq("player_id", playerId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false }),
    hoops
      .from("player_programs")
      .select("program_id, programs(id, name, week_count, days_per_week)")
      .eq("player_id", playerId)
      .eq("status", "active")
      .maybeSingle(),
    hoops.from("programs").select("id, name, description, focus_areas, player_type_tags, level, week_count, days_per_week"),
    hoops.from("film_resources").select("id, title, kind, skill_tags, position_tags, sort_order"),
    hoops.from("film_views").select("film_resource_id").eq("player_id", playerId),
    loadProgressRows(supabase, playerId),
  ]);

  if (!user) redirect("/login");
  if (!player) notFound();
  if (workoutsError) console.error("[train] workouts fetch failed:", workoutsError);

  const playerType = (player.player_type ?? {}) as ComputedPlayerType & PlayerType;
  if (!playerType.archetype) redirect(`/players/${playerId}/assessment`);
  const level = playerLevel(player.player_type);

  const lastDone: Record<string, string> = {};
  for (const s of completed ?? []) {
    if (s.workout_id && s.completed_at && !lastDone[s.workout_id]) lastDone[s.workout_id] = s.completed_at;
  }
  const ranked = rankWorkouts(playerType, ((workouts ?? []) as unknown as Workout[]).filter((w) => !isCustomWorkout(w)), {
    playerLevel: level,
    lastCompletedByWorkoutId: lastDone,
  });

  const activeProgram = enrollment?.programs as unknown as
    | { id: string; name: string; week_count: number; days_per_week: number }
    | null
    | undefined;
  // Committing to a block is a real decision: offer the one that fits
  // best, the rest one tap away, and nothing at all while on one.
  const rankedPrograms = activeProgram ? [] : rankPrograms(playerType, level, programs ?? [], WEAKNESS_THRESHOLD);
  const programReasons: Record<string, string> = {};
  for (const p of rankedPrograms) programReasons[p.id] = explainProgram(playerType, p, WEAKNESS_THRESHOLD);

  const watched = new Set((filmViews ?? []).map((v) => v.film_resource_id));
  const nextFilm = rankFilm(playerType, (filmRows ?? []) as Parameters<typeof rankFilm>[1], watched, WEAKNESS_THRESHOLD)[0] ?? null;

  const mine = (workouts ?? []).filter((w) => isCustomWorkout(w) && !isTemporaryWorkout(w)) as unknown as Workout[];
  const minutesOf = (w: Workout) => workoutMinutes({ estimated_minutes: w.estimated_minutes, workout_drills: w.workout_drills as unknown as DrillEntry[] }, level);
  const next = ranked[0] ?? null;
  const nextWhy = next ? explainMatch(playerType, next, { playerLevel: level, lastCompletedIso: lastDone[next.id] }) : null;

  // The benchmark tests: the same three every time, with the latest comparable result of each and the workout that runs them.
  const benchmarkWorkout = (workouts ?? []).find((w) => w.name === BENCHMARK_WORKOUT_NAME) ?? null;
  const benchmarks = analyzeBenchmarks(progress.rows).map((r) => {
    const g = r.groups.find((x) => x.current && x.results.length > 0) ?? null;
    const latest = g ? g.results[g.results.length - 1] : null;
    return {
      key: r.protocol.key,
      title: r.protocol.title.replace(" Benchmark", ""),
      detail: r.protocol.attempts ? `${r.protocol.attempts} shots` : `${r.protocol.clockSeconds} seconds`,
      latest: latest ? { makes: latest.makes, attempts: latest.attempts, pct: latest.pct === null ? null : Math.round(latest.pct), at: latest.at } : null,
      runs: g?.results.length ?? 0,
    };
  });

  return (
    <TrainHomeView
      playerId={playerId}
      playerName={player.display_name}
      workoutsError={Boolean(workoutsError)}
      next={next ? { id: next.id, name: next.name, skills: next.focus_areas ?? [], why: nextWhy, minutes: minutesOf(next) } : null}
      workoutCount={ranked.length}
      filmTotal={(filmRows ?? []).length}
      filmStudied={watched.size}
      nextFilm={nextFilm ? { id: nextFilm.id, title: nextFilm.title } : null}
      activeProgram={activeProgram ?? null}
      programs={rankedPrograms as OfferedProgram[]}
      programReasons={programReasons}
      mine={mine.map((w) => ({ id: w.id, name: w.name, skills: w.focus_areas ?? [], minutes: minutesOf(w), drills: w.workout_drills.length }))}
      benchmarks={benchmarks}
      benchmarkWorkoutId={benchmarkWorkout?.id ?? null}
      saved={saved ?? null}
    />
  );
}
