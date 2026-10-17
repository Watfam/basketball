import type { createClient } from "@/lib/supabase/server";
import { playerLevel } from "@/lib/basketball/assessment";
import { buildEntryExtras } from "@/lib/basketball/drill-session-view";
import { loadLessonContext } from "@/lib/basketball/drill-film-server";
import type { DrillStart, DrillStartProblem } from "@/lib/basketball/drill-start";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Reads the workout and the drill entry the player came from, under the player's own access, and says whether the camera can be offered for it.
 * Anything wrong (a workout that is gone or finished, a drill that is not about makes) comes back as a plain problem, never as a guess.
 */
export async function loadDrillStart(supabase: Supabase, a: { playerId: string; workoutSessionId: string; workoutDrillId: string }): Promise<DrillStart | DrillStartProblem> {
  const hoops = supabase.schema("hoops");
  const [{ data: ws }, { data: entry }, { data: player }] = await Promise.all([
    hoops.from("workout_sessions").select("id, status, workout_id, program_days(volume_step, week_number, day_number), workouts(name)").eq("id", a.workoutSessionId).eq("player_id", a.playerId).maybeSingle(),
    hoops.from("workout_drills").select("id, workout_id, drill_id, sort_order, block, variant_label, levels, level_targets, target_sets, target_reps, target_duration_seconds, drills(id, name, skill_tags)").eq("id", a.workoutDrillId).maybeSingle(),
    hoops.from("players").select("player_type, household_id").eq("id", a.playerId).maybeSingle(),
  ]);
  if (!ws) return { problem: "That workout is no longer there." };
  if (ws.status !== "in_progress") return { problem: "That workout is already finished." };
  if (!entry || entry.workout_id !== ws.workout_id) return { problem: "That drill is not part of this workout." };
  const day = ws.program_days as unknown as { volume_step: number; week_number: number; day_number: number } | null;
  const workoutName = (ws.workouts as unknown as { name: string } | null)?.name ?? null;
  const drill = (Array.isArray(entry.drills) ? entry.drills[0] : entry.drills) as { id: string; name: string; skill_tags: string[] | null } | null;
  const film = await loadLessonContext(supabase, a.playerId, (player as { household_id?: string | null } | null)?.household_id ?? null);
  const extras = buildEntryExtras({ entries: [{ ...entry, drills: drill } as unknown as Parameters<typeof buildEntryExtras>[0]["entries"][number]], level: playerLevel(player?.player_type), volumeStep: day?.volume_step ?? 0, ...film });
  const x = extras[entry.id];
  if (!x || !x.tracking.trackable || !drill) return { problem: x ? x.tracking.why : "This drill is not one that counts makes and attempts." };
  return {
    context: { workoutSessionId: ws.id, workoutDrillId: entry.id, drillName: drill.name, variant: entry.variant_label, goal: x.tracking.goal },
    categoryLabel: x.tracking.categoryLabel ?? "Shooting",
    planLabel: day ? `Week ${day.week_number} · Day ${day.day_number}` : null,
    workoutName,
    lesson: x.lesson,
    benchmark: x.benchmark,
  };
}
