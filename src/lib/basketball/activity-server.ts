import type { createClient } from "@/lib/supabase/server";
import { toActivities, type Activity } from "@/lib/basketball/activity";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type CompletedWorkout = { id: string; workout_id: string | null; completed_at: string | null };

/**
 * A player's whole activity log (src/lib/basketball/activity.ts), read in
 * one batch plus one follow-up. Also returns the completed workouts it
 * counted, which the workout ranking needs ("you did this yesterday").
 */
export async function loadActivity(
  supabase: Supabase,
  playerId: string
): Promise<{ activities: Activity[]; completedWorkouts: CompletedWorkout[] }> {
  const hoops = supabase.schema("hoops");
  const [{ data: workouts }, { data: shots }, { data: combines }, { data: filmViews }, { data: filmSessions }] =
    await Promise.all([
      hoops
        .from("workout_sessions")
        .select("id, workout_id, completed_at")
        .eq("player_id", playerId)
        .eq("status", "completed")
        .order("completed_at", { ascending: false }),
      // Finished, kept sets with at least one shot.
      hoops
        .from("shot_sessions")
        .select("started_at")
        .eq("player_id", playerId)
        .not("ended_at", "is", null)
        .is("deleted_at", null)
        .gt("attempts", 0),
      hoops.from("assessments").select("completed_at").eq("player_id", playerId).eq("kind", "combine"),
      hoops.from("film_views").select("watched_at").eq("player_id", playerId),
      hoops.from("film_session_progress").select("completed_at").eq("player_id", playerId).not("completed_at", "is", null),
    ]);

  // A workout counts once work was logged against it: one finished with
  // nothing done would otherwise feed the streak.
  const ids = (workouts ?? []).map((w: CompletedWorkout) => w.id);
  const { data: logs } = ids.length
    ? await hoops.from("session_logs").select("session_id").in("session_id", ids)
    : { data: [] as { session_id: string }[] };
  const withWork = new Set((logs ?? []).map((l: { session_id: string }) => l.session_id));
  const completedWorkouts = ((workouts ?? []) as CompletedWorkout[]).filter((w) => withWork.has(w.id));

  const activities = toActivities({
    workout: completedWorkouts.map((w) => w.completed_at),
    shooting: (shots ?? []).map((s: { started_at: string }) => s.started_at),
    combine: (combines ?? []).map((c: { completed_at: string | null }) => c.completed_at),
    film: [
      ...(filmViews ?? []).map((v: { watched_at: string }) => v.watched_at),
      ...(filmSessions ?? []).map((v: { completed_at: string }) => v.completed_at),
    ],
  });

  return { activities, completedWorkouts };
}
