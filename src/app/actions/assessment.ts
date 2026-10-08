"use server";

/** Self-assessment and the combine: the ratings on the player card. */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { computePlayerType, type AssessmentAnswers } from "@/lib/basketball/assessment";

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
 * Sets the two fields the combine needs to pick a benchmark band.
 *
 * There is no player edit screen, so without this an existing player
 * could never supply them and would be measured against the middle band
 * forever. Both are optional and independent — supplying only one still
 * narrows the band.
 */
export async function setPlayerProfile(
  playerId: string,
  input: { gender?: string | null; birthYear?: number | null }
) {
  if (!playerId) return { error: "Missing player." };

  const patch: Record<string, unknown> = {};
  if (input.gender === "male" || input.gender === "female") patch.gender = input.gender;
  if (typeof input.birthYear === "number" && Number.isFinite(input.birthYear)) {
    const year = Math.round(input.birthYear);
    // Anything outside this is a typo, and storing it would silently pick
    // the wrong benchmark band.
    if (year < 1990 || year > new Date().getFullYear()) {
      return { error: "That birth year doesn't look right." };
    }
    patch.birth_year = year;
  }

  if (Object.keys(patch).length === 0) return { error: "Nothing to save." };

  const supabase = await createClient();
  const { error } = await supabase.schema("hoops").from("players").update(patch).eq("id", playerId);

  if (error) return { error: error.message };

  revalidatePath(`/players/${playerId}/combine`);
  revalidatePath(`/players/${playerId}`);
  return { error: null };
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
