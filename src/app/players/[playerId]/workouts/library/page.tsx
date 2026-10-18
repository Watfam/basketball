import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rankWorkouts, type PlayerType } from "@/lib/basketball/workout-matching";
import { playerLevel, type ComputedPlayerType } from "@/lib/basketball/assessment";
import type { Workout } from "@/components/workout-card";
import { parseWorkoutFilters } from "@/lib/basketball/train-library";
import { WorkoutLibraryView } from "@/components/train/workout-library-view";
import { isCustomWorkout } from "@/lib/basketball/workout-minutes";

/**
 * The whole workout library, with filters. Train shows what to do next; this is where a player finds what they want to train:
 * a skill, a length, a level. The count always says how many of how many are showing.
 */
export default async function WorkoutLibraryPage({ params, searchParams }: { params: Promise<{ playerId: string }>; searchParams: Promise<{ skill?: string; time?: string; level?: string }> }) {
  const { playerId } = await params;
  const filters = parseWorkoutFilters(await searchParams);
  const supabase = await createClient();
  const hoops = supabase.schema("hoops");
  const [{ data: { user } }, { data: player }, { data: workouts, error }, { data: completed }] = await Promise.all([
    supabase.auth.getUser(),
    hoops.from("players").select("id, display_name, player_type").eq("id", playerId).maybeSingle(),
    hoops
      .from("workouts")
      .select("id, name, description, focus_areas, estimated_minutes, player_type_tags, workout_drills(id, drill_id, sort_order, block, variant_label, levels, level_targets, target_sets, target_reps, target_duration_seconds, drills(id, name, description, video_url, source_trainer, difficulty))"),
    hoops.from("workout_sessions").select("workout_id, completed_at").eq("player_id", playerId).eq("status", "completed").order("completed_at", { ascending: false }),
  ]);
  if (!user) redirect("/login");
  if (!player) notFound();

  const playerType = (player.player_type ?? {}) as ComputedPlayerType & PlayerType;
  if (!playerType.archetype) redirect(`/players/${playerId}/assessment`);
  const level = playerLevel(player.player_type);
  const lastDone: Record<string, string> = {};
  for (const s of completed ?? []) if (s.workout_id && s.completed_at && !lastDone[s.workout_id]) lastDone[s.workout_id] = s.completed_at;

  const library = (workouts ?? []).filter((w) => !isCustomWorkout(w)) as unknown as Workout[];
  const ranked = rankWorkouts(playerType, library, { playerLevel: level, lastCompletedByWorkoutId: lastDone });
  return <WorkoutLibraryView playerId={playerId} ranked={ranked} filters={filters} level={level} lastDone={lastDone} error={Boolean(error)} />;
}
