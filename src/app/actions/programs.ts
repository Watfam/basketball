"use server";

/** Multi-week programs: enrol, run a day, finish or leave. */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { revalidatePlayerSessionViews } from "./revalidate";

/**
 * Puts a player on a program. One active program at a time — a partial
 * unique index enforces that at the database level, so any previously
 * active one is stood down first rather than relying on this being the
 * only code path that ever enrolls.
 */
export async function enrollInProgram(playerId: string, programId: string) {
  if (!playerId || !programId) return { error: "Missing player or program." };

  const supabase = await createClient();

  const { error: standDownError } = await supabase
    .schema("hoops")
    .from("player_programs")
    .update({ status: "abandoned" })
    .eq("player_id", playerId)
    .eq("status", "active");

  if (standDownError) return { error: standDownError.message };

  const { error } = await supabase
    .schema("hoops")
    .from("player_programs")
    .insert({ player_id: playerId, program_id: programId, status: "active" });

  if (error) return { error: error.message };

  revalidatePath(`/players/${playerId}`);

  revalidatePath(`/players/${playerId}/me`);
  return { error: null };
}

/**
 * Closes out a finished block. Kept as an explicit action rather than
 * flipping the row the moment the last day is logged: the enrollment
 * staying active is what keeps the "Block Complete" state on screen, and
 * a player should get to see they finished before the app moves on. It
 * also frees the one-active-program slot so a new block can start.
 */
export async function completeProgram(playerId: string) {
  if (!playerId) return { error: "Missing player." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("hoops")
    .from("player_programs")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("player_id", playerId)
    .eq("status", "active");

  if (error) return { error: error.message };

  revalidatePath(`/players/${playerId}`);

  revalidatePath(`/players/${playerId}/me`);
  return { error: null };
}

/**
 * Steps off a program mid-block. Sessions already logged against it stay
 * — the work happened, and it still counts toward totals and streaks
 * even though the plan was abandoned.
 */
export async function leaveProgram(playerId: string) {
  if (!playerId) return { error: "Missing player." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("hoops")
    .from("player_programs")
    .update({ status: "abandoned" })
    .eq("player_id", playerId)
    .eq("status", "active");

  if (error) return { error: error.message };

  revalidatePath(`/players/${playerId}`);

  revalidatePath(`/players/${playerId}/me`);
  return { error: null };
}

/**
 * Starts the scheduled session for a specific program day, rather than
 * for a freely chosen workout. Resumes an existing unfinished session for
 * that same day instead of stacking up duplicates, matching
 * startWorkoutSession's behaviour.
 */
export async function startProgramDay(playerId: string, programDayId: string) {
  if (!playerId || !programDayId) return { error: "Missing player or day." };

  const supabase = await createClient();

  const { data: day, error: dayError } = await supabase
    .schema("hoops")
    .from("program_days")
    .select("id, workout_id")
    .eq("id", programDayId)
    .single();

  if (dayError) return { error: dayError.message };

  const { data: existing } = await supabase
    .schema("hoops")
    .from("workout_sessions")
    .select("id")
    .eq("player_id", playerId)
    .eq("program_day_id", programDayId)
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
      workout_id: day.workout_id,
      program_day_id: programDayId,
      status: "in_progress",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePlayerSessionViews();
  return { error: null, sessionId: session.id as string };
}
