"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computePlayerType, type AssessmentAnswers } from "@/lib/basketball/assessment";

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
 * Onboarding (or periodic re-) assessment submit. Writes the raw answers to
 * hoops.assessments and the derived snapshot to both
 * assessments.computed_player_type and players.player_type — the latter is
 * what curated content actually matches against.
 */
export async function submitAssessment(playerId: string, answers: AssessmentAnswers) {
  if (!playerId) return { error: "Missing player." };

  const supabase = await createClient();
  const computed = computePlayerType(answers);

  const { error: assessmentError } = await supabase
    .schema("hoops")
    .from("assessments")
    .insert({
      player_id: playerId,
      kind: "onboarding",
      answers,
      computed_player_type: computed,
    });

  if (assessmentError) return { error: assessmentError.message };

  const { error: playerError } = await supabase
    .schema("hoops")
    .from("players")
    .update({
      player_type: computed,
      primary_position: answers.primary_position || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", playerId);

  if (playerError) return { error: playerError.message };

  revalidatePath("/");
  return { error: null, computed };
}
