"use server";

/** Workout sessions: start, log drills, finish or discard; and the training level. */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { type SkillLevel } from "@/lib/basketball/assessment";
import { revalidatePlayerSessionViews } from "./revalidate";

/**
 * Starts a workout session — creates the hoops.workout_sessions row the
 * session player writes drill logs against as the player works through it.
 * RLS (workout_sessions_household_all) already scopes this to players in
 * the caller's own household.
 */
export async function startWorkoutSession(playerId: string, workoutId: string) {
  if (!playerId || !workoutId) return { error: "Missing player or workout." };

  const supabase = await createClient();

  // Resume rather than duplicate. Starting a workout you already have an
  // unfinished session for used to insert a second in_progress row, which
  // stranded the first one (along with everything already logged against
  // it) and left two "unfinished" entries for one workout.
  const { data: existing } = await supabase
    .schema("hoops")
    .from("workout_sessions")
    .select("id")
    .eq("player_id", playerId)
    .eq("workout_id", workoutId)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return { error: null, sessionId: existing.id as string };

  const { data: session, error } = await supabase
    .schema("hoops")
    .from("workout_sessions")
    .insert({
      player_id: playerId,
      workout_id: workoutId,
      status: "in_progress",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePlayerSessionViews();
  return { error: null, sessionId: session.id as string };
}

/**
 * Logs a single drill's actual performance (not just "hit the target" —
 * metrics carries whatever was actually logged, per the schema's "never
 * limit what might be helpful to capture" JSONB design) as soon as that
 * drill is finished, rather than batching everything up for one write at
 * the very end. If the player closes the app mid-workout, whatever they
 * did up to that point is already saved and the session stays resumable.
 */
export async function logDrillProgress(
  sessionId: string,
  drillId: string,
  metrics: Record<string, unknown>,
  // The workout_drills entry this satisfied. A drill can appear twice in
  // one workout (right side, then left side), so drill_id alone can't say
  // which half just got done.
  workoutDrillId?: string
) {
  if (!sessionId || !drillId) return { error: "Missing session or drill." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("hoops")
    .from("session_logs")
    .insert({
      session_id: sessionId,
      drill_id: drillId,
      workout_drill_id: workoutDrillId ?? null,
      metrics,
    });

  if (error) return { error: error.message };

  return { error: null };
}

/**
 * Marks a session completed — whether every drill got logged or the
 * player chose to finish early with only some of them done. Drill logs
 * themselves are already saved via logDrillProgress by this point.
 */
export async function completeWorkoutSession(sessionId: string) {
  if (!sessionId) return { error: "Missing session." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("hoops")
    .from("workout_sessions")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", sessionId);

  if (error) return { error: error.message };

  revalidatePlayerSessionViews();
  return { error: null };
}

/**
 * Throws away a session that recorded no work.
 *
 * A session row is created the moment a workout is opened, so opening one
 * and backing out used to leave an empty session behind forever — and
 * "Finish workout now" would mark that same empty session *completed*,
 * which counted toward the streak, the session total, the milestones and
 * the training-load charts despite nothing having been done.
 *
 * Deliberately refuses to delete a session that has logs: once a player
 * has actually done a drill, leaving is "save and come back," never
 * "discard."
 */
export async function discardWorkoutSession(sessionId: string) {
  if (!sessionId) return { error: "Missing session." };

  const supabase = await createClient();

  const { count, error: countError } = await supabase
    .schema("hoops")
    .from("session_logs")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);

  if (countError) return { error: countError.message };
  if ((count ?? 0) > 0) return { error: null, kept: true };

  const { error } = await supabase
    .schema("hoops")
    .from("workout_sessions")
    .delete()
    .eq("id", sessionId);

  if (error) return { error: error.message };

  revalidatePlayerSessionViews();
  return { error: null, kept: false };
}

/**
 * Overrides the level the assessment suggested. Stored inside the same
 * player_type JSONB bag rather than a new column — consistent with how
 * every other player-type signal is stored, and needs no migration.
 */
export async function setPreferredLevel(playerId: string, level: SkillLevel) {
  if (!playerId) return { error: "Missing player." };

  const supabase = await createClient();
  const { data: player, error: fetchError } = await supabase
    .schema("hoops")
    .from("players")
    .select("player_type")
    .eq("id", playerId)
    .single();

  if (fetchError) return { error: fetchError.message };

  const nextPlayerType = { ...(player.player_type ?? {}), preferred_level: level };

  const { error } = await supabase
    .schema("hoops")
    .from("players")
    .update({ player_type: nextPlayerType, updated_at: new Date().toISOString() })
    .eq("id", playerId);

  if (error) return { error: error.message };

  revalidatePath(`/players/${playerId}`);

  revalidatePath(`/players/${playerId}/me`);
  return { error: null };
}
