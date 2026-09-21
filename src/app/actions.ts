"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computePlayerType, type AssessmentAnswers, type SkillLevel } from "@/lib/basketball/assessment";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Combined first-run flow: "Set up your family." Creates the household and
 * the first player profile together in one submit, so a new user never sees
 * a bare "create household" screen with nothing in it yet. Every player
 * added after this one goes through `addPlayer` instead.
 */
export async function createHouseholdWithFirstPlayer(formData: FormData) {
  const householdName = String(formData.get("household_name") ?? "").trim();
  const displayName = String(formData.get("display_name") ?? "").trim();
  const birthYearRaw = String(formData.get("birth_year") ?? "").trim();
  const primaryPosition = String(formData.get("primary_position") ?? "").trim();

  if (!householdName) return { error: "Household name is required." };
  if (!displayName) return { error: "Player name is required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: household, error: householdError } = await supabase
    .schema("hoops")
    .from("households")
    .insert({ owner_id: user.id, name: householdName })
    .select("id")
    .single();

  if (householdError) return { error: householdError.message };

  const { data: player, error: playerError } = await supabase
    .schema("hoops")
    .from("players")
    .insert({
      household_id: household.id,
      display_name: displayName,
      birth_year: birthYearRaw ? Number(birthYearRaw) : null,
      primary_position: primaryPosition || null,
    })
    .select("id")
    .single();

  if (playerError) return { error: playerError.message };

  revalidatePath("/");
  return { error: null, playerId: player.id as string };
}

export async function addPlayer(formData: FormData) {
  const householdId = String(formData.get("household_id") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const birthYearRaw = String(formData.get("birth_year") ?? "").trim();
  const primaryPosition = String(formData.get("primary_position") ?? "").trim();

  if (!householdId || !displayName) {
    return { error: "Player name is required." };
  }

  const supabase = await createClient();
  const { data: player, error } = await supabase
    .schema("hoops")
    .from("players")
    .insert({
      household_id: householdId,
      display_name: displayName,
      birth_year: birthYearRaw ? Number(birthYearRaw) : null,
      primary_position: primaryPosition || null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/");
  return { error: null, playerId: player.id as string };
}

/**
 * Removes a single player profile and everything nested under it
 * (assessments, workout sessions — cascades via FK) without touching the
 * household. RLS (players_household_owner_all) already scopes this to
 * players in the caller's own household, so there's nothing extra to
 * check here.
 */
export async function removePlayer(playerId: string) {
  if (!playerId) return { error: "Missing player." };

  const supabase = await createClient();
  const { error } = await supabase.schema("hoops").from("players").delete().eq("id", playerId);

  if (error) return { error: error.message };

  revalidatePath("/");
  return { error: null };
}

/**
 * Deletes the caller's household and every player nested under it
 * (cascades via FK). RLS (household_owner_all) already scopes this to
 * households the caller owns.
 */
export async function deleteHousehold(householdId: string) {
  if (!householdId) return { error: "Missing household." };

  const supabase = await createClient();
  const { error } = await supabase.schema("hoops").from("households").delete().eq("id", householdId);

  if (error) return { error: error.message };

  revalidatePath("/");
  return { error: null };
}

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

  return { error: null, kept: false };
}

/**
 * Onboarding (or periodic re-) assessment submit. Writes the raw answers to
 * hoops.assessments and the derived snapshot to both
 * assessments.computed_player_type and players.player_type — the latter is
 * what curated content actually matches against.
 */
export async function submitAssessment(
  playerId: string,
  answers: AssessmentAnswers,
  // Retests record as "checkin" so the history stays readable — and so
  // the hub can tell a genuine re-measure from the original baseline.
  kind: "onboarding" | "checkin" | "annual" = "onboarding"
) {
  if (!playerId) return { error: "Missing player." };

  const supabase = await createClient();
  const computed = computePlayerType(answers);

  const { error: assessmentError } = await supabase
    .schema("hoops")
    .from("assessments")
    .insert({
      player_id: playerId,
      kind,
      answers,
      computed_player_type: computed,
    });

  if (assessmentError) return { error: assessmentError.message };

  // Merged into the existing player_type rather than replacing it. The
  // computed snapshot doesn't carry preferred_level, so overwriting
  // wholesale would silently reset a player's chosen training level every
  // time they retested — and anything else later stored in this bag would
  // go the same way.
  const { data: existing } = await supabase
    .schema("hoops")
    .from("players")
    .select("player_type")
    .eq("id", playerId)
    .maybeSingle();

  const nextPlayerType = { ...(existing?.player_type ?? {}), ...computed };

  const { error: playerError } = await supabase
    .schema("hoops")
    .from("players")
    .update({
      player_type: nextPlayerType,
      primary_position: answers.primary_position || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", playerId);

  if (playerError) return { error: playerError.message };

  revalidatePath("/");
  revalidatePath(`/players/${playerId}`);
  return { error: null, computed };
}

/**
 * Records a measured combine.
 *
 * Writes an assessment of kind "combine" so it flows through the same
 * history, charts and rankings as a self-rating, plus one result row per
 * test holding the raw score and the rating it converted to. The derived
 * rating is stored rather than recomputed on read, so recalibrating the
 * benchmarks later never silently rewrites a player's history.
 */
export async function submitCombine(
  playerId: string,
  ratings: Record<string, number>,
  results: { drillId: string; rawScore: number; derivedRating: number }[]
) {
  if (!playerId) return { error: "Missing player." };
  if (results.length === 0) return { error: "Record at least one test." };

  const supabase = await createClient();

  const { data: player, error: playerFetchError } = await supabase
    .schema("hoops")
    .from("players")
    .select("player_type")
    .eq("id", playerId)
    .maybeSingle();

  if (playerFetchError) return { error: playerFetchError.message };

  const existing = (player?.player_type ?? {}) as Record<string, unknown>;
  // Keeps archetype, style tags, goal and preferred_level — a combine
  // measures the four ratings and nothing else, so it must not clear the
  // parts of the card it never looked at.
  const nextPlayerType = { ...existing, ratings };

  const { data: assessment, error: assessmentError } = await supabase
    .schema("hoops")
    .from("assessments")
    .insert({
      player_id: playerId,
      kind: "combine",
      answers: { measured: true },
      computed_player_type: nextPlayerType,
    })
    .select("id")
    .single();

  if (assessmentError) return { error: assessmentError.message };

  const { error: resultsError } = await supabase
    .schema("hoops")
    .from("assessment_results")
    .insert(
      results.map((r) => ({
        assessment_id: assessment.id,
        assessment_drill_id: r.drillId,
        raw_score: r.rawScore,
        derived_rating: r.derivedRating,
      }))
    );

  if (resultsError) return { error: resultsError.message };

  const { error: updateError } = await supabase
    .schema("hoops")
    .from("players")
    .update({ player_type: nextPlayerType, updated_at: new Date().toISOString() })
    .eq("id", playerId);

  if (updateError) return { error: updateError.message };

  revalidatePath(`/players/${playerId}`);
  revalidatePath(`/players/${playerId}/assessments`);
  return { error: null };
}

/**
 * Pushes the combine prompt out without dismissing it for good. The
 * combine is the measurement everything else depends on, so "not now"
 * has to mean not now rather than never.
 */
export async function snoozeCombine(playerId: string) {
  if (!playerId) return { error: "Missing player." };

  const supabase = await createClient();
  const { data: player } = await supabase
    .schema("hoops")
    .from("players")
    .select("player_type")
    .eq("id", playerId)
    .maybeSingle();

  const nextPlayerType = {
    ...((player?.player_type ?? {}) as Record<string, unknown>),
    combine_snoozed_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .schema("hoops")
    .from("players")
    .update({ player_type: nextPlayerType })
    .eq("id", playerId);

  if (error) return { error: error.message };

  revalidatePath(`/players/${playerId}`);
  return { error: null };
}

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

  return { error: null, sessionId: session.id as string };
}

/**
 * Marks a film watched and saves the takeaway. The takeaway is the whole
 * point of the interaction — watching without writing down what you're
 * taking into the next session is scrolling, not studying — so this
 * upserts rather than inserting: a player can come back and change what
 * they wrote.
 */
export async function logFilmView(playerId: string, filmResourceId: string, takeaway: string) {
  if (!playerId || !filmResourceId) return { error: "Missing player or film." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("hoops")
    .from("film_views")
    .upsert(
      {
        player_id: playerId,
        film_resource_id: filmResourceId,
        watched_at: new Date().toISOString(),
        takeaway: takeaway.trim() || null,
      },
      { onConflict: "player_id,film_resource_id" }
    );

  if (error) return { error: error.message };

  revalidatePath(`/players/${playerId}/film`);
  revalidatePath(`/players/${playerId}`);
  return { error: null };
}

/**
 * Finishes a film study session. Marks every lesson in it studied too —
 * a player who has worked through the whole course has, by definition,
 * studied its parts, and making them mark each one again is busywork.
 */
export async function completeFilmSession(
  playerId: string,
  filmSessionId: string,
  takeaway: string,
  filmResourceIds: string[]
) {
  if (!playerId || !filmSessionId) return { error: "Missing player or session." };

  const supabase = await createClient();

  const { error } = await supabase
    .schema("hoops")
    .from("film_session_progress")
    .upsert(
      {
        player_id: playerId,
        film_session_id: filmSessionId,
        completed_at: new Date().toISOString(),
        takeaway: takeaway.trim() || null,
      },
      { onConflict: "player_id,film_session_id" }
    );

  if (error) return { error: error.message };

  if (filmResourceIds.length > 0) {
    // Existing views are left alone so a takeaway a player already wrote
    // on an individual lesson isn't overwritten by finishing the course.
    const { data: existing } = await supabase
      .schema("hoops")
      .from("film_views")
      .select("film_resource_id")
      .eq("player_id", playerId)
      .in("film_resource_id", filmResourceIds);

    const already = new Set((existing ?? []).map((v) => v.film_resource_id));
    const toInsert = filmResourceIds
      .filter((id) => !already.has(id))
      .map((id) => ({ player_id: playerId, film_resource_id: id }));

    if (toInsert.length > 0) {
      await supabase.schema("hoops").from("film_views").insert(toInsert);
    }
  }

  revalidatePath(`/players/${playerId}/film`);
  revalidatePath(`/players/${playerId}`);
  return { error: null };
}

export async function removeFilmView(playerId: string, filmResourceId: string) {
  if (!playerId || !filmResourceId) return { error: "Missing player or film." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("hoops")
    .from("film_views")
    .delete()
    .eq("player_id", playerId)
    .eq("film_resource_id", filmResourceId);

  if (error) return { error: error.message };

  revalidatePath(`/players/${playerId}/film`);
  return { error: null };
}

/**
 * Adds a household's own film link.
 *
 * The curated library ships without video URLs on purpose — inventing
 * plausible-looking links would be worse than having none — so this is
 * how real links actually get in. Rows created here carry the household
 * id, which is what keeps them out of everyone else's library (see the
 * film_resources RLS policies in migration 0004).
 */
export async function addFilmResource(
  householdId: string,
  playerId: string,
  input: { title: string; url: string; kind: string; skillTags: string[]; notes: string }
) {
  if (!householdId) return { error: "Missing household." };

  const title = input.title.trim();
  const url = input.url.trim();
  if (!title) return { error: "Give it a title." };

  // Only http(s) — a javascript: or data: URL pasted in here would
  // otherwise be rendered as a link for the player to tap.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: "That doesn't look like a link. Paste the full URL, starting with https://" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { error: "Links have to start with https://" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .schema("hoops")
    .from("film_resources")
    .insert({
      title,
      url: parsed.toString(),
      kind: input.kind || null,
      skill_tags: input.skillTags,
      notes: input.notes.trim() || null,
      added_by_household_id: householdId,
    });

  if (error) return { error: error.message };

  revalidatePath(`/players/${playerId}/film`);
  return { error: null };
}

/**
 * Attaches a household's own video link to a curated lesson.
 *
 * Curated rows are service-role only and shared across everyone, so this
 * stores the URL alongside rather than editing the lesson. The app
 * prefers the override when rendering. Previously the only option was to
 * create a whole second entry, which left a duplicate sitting next to the
 * lesson it was meant to complete.
 */
export async function setFilmLink(
  householdId: string,
  filmResourceId: string,
  url: string,
  playerId: string
) {
  if (!householdId || !filmResourceId) return { error: "Missing household or film." };

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { error: "That doesn't look like a link. Paste the full URL, starting with https://" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { error: "Links have to start with https://" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .schema("hoops")
    .from("film_links")
    .upsert(
      { household_id: householdId, film_resource_id: filmResourceId, url: parsed.toString() },
      { onConflict: "household_id,film_resource_id" }
    );

  if (error) return { error: error.message };

  revalidatePath(`/players/${playerId}/film`);
  return { error: null };
}

export async function removeFilmLink(
  householdId: string,
  filmResourceId: string,
  playerId: string
) {
  if (!householdId || !filmResourceId) return { error: "Missing household or film." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("hoops")
    .from("film_links")
    .delete()
    .eq("household_id", householdId)
    .eq("film_resource_id", filmResourceId);

  if (error) return { error: error.message };

  revalidatePath(`/players/${playerId}/film`);
  return { error: null };
}

export async function deleteFilmResource(filmResourceId: string, playerId: string) {
  if (!filmResourceId) return { error: "Missing film." };

  const supabase = await createClient();
  // RLS (film_resources_own_write) already restricts this to rows the
  // caller's household added — curated rows can't be deleted here.
  const { error } = await supabase
    .schema("hoops")
    .from("film_resources")
    .delete()
    .eq("id", filmResourceId);

  if (error) return { error: error.message };

  revalidatePath(`/players/${playerId}/film`);
  return { error: null };
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
  return { error: null };
}
