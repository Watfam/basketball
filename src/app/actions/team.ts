"use server";

/** Teams: the team itself, its roster, scouting notes and games. */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Creates a team. The caller becomes owner_id — no separate coach
 * team_members row is written for them, since RLS grants the owner full
 * access to their own team directly through teams.owner_id.
 */
export async function createTeam(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Team name is required." };

  const defensiveScheme = String(formData.get("defensive_scheme") ?? "").trim();
  const defensiveSchemeCustom = String(formData.get("defensive_scheme_custom") ?? "").trim();
  const offensiveScheme = String(formData.get("offensive_scheme") ?? "").trim();
  const offensiveSchemeCustom = String(formData.get("offensive_scheme_custom") ?? "").trim();
  const focusAreas = formData.getAll("focus_areas").map(String);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: team, error } = await supabase
    .schema("hoops")
    .from("teams")
    .insert({
      owner_id: user.id,
      name,
      defensive_scheme: defensiveScheme || null,
      defensive_scheme_custom: defensiveScheme === "custom" ? defensiveSchemeCustom || null : null,
      offensive_scheme: offensiveScheme || null,
      offensive_scheme_custom: offensiveScheme === "custom" ? offensiveSchemeCustom || null : null,
      focus_areas: focusAreas,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/");
  return { error: null, teamId: team.id as string };
}

export async function updateTeam(teamId: string, formData: FormData) {
  if (!teamId) return { error: "Missing team." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Team name is required." };

  const defensiveScheme = String(formData.get("defensive_scheme") ?? "").trim();
  const defensiveSchemeCustom = String(formData.get("defensive_scheme_custom") ?? "").trim();
  const offensiveScheme = String(formData.get("offensive_scheme") ?? "").trim();
  const offensiveSchemeCustom = String(formData.get("offensive_scheme_custom") ?? "").trim();
  const focusAreas = formData.getAll("focus_areas").map(String);

  const supabase = await createClient();
  const { error } = await supabase
    .schema("hoops")
    .from("teams")
    .update({
      name,
      defensive_scheme: defensiveScheme || null,
      defensive_scheme_custom: defensiveScheme === "custom" ? defensiveSchemeCustom || null : null,
      offensive_scheme: offensiveScheme || null,
      offensive_scheme_custom: offensiveScheme === "custom" ? offensiveSchemeCustom || null : null,
      focus_areas: focusAreas,
      updated_at: new Date().toISOString(),
    })
    .eq("id", teamId);

  if (error) return { error: error.message };

  revalidatePath(`/teams/${teamId}`);
  return { error: null };
}

/**
 * Deletes a team and everything under it (roster, practice plans,
 * scouting notes — all cascade via FK). Mirrors deleteHousehold: RLS
 * already scopes this to teams the caller owns.
 */
export async function deleteTeam(teamId: string) {
  if (!teamId) return { error: "Missing team." };

  const supabase = await createClient();
  const { error } = await supabase.schema("hoops").from("teams").delete().eq("id", teamId);

  if (error) return { error: error.message };

  revalidatePath("/");
  revalidatePath("/coach");
  return { error: null };
}

/**
 * Adds a roster entry — either linked to a real Hardwood Lab player, or
 * a bare name for a kid whose family isn't in the app. Exactly one of
 * playerId / rosterName must be given; the DB check constraint enforces
 * this too, but failing fast here gives a clearer message than a
 * constraint-violation error would.
 */
export async function addRosterPlayer(
  teamId: string,
  input: { playerId?: string; rosterName?: string; rosterPosition?: string; jerseyNumber?: string }
) {
  if (!teamId) return { error: "Missing team." };

  const playerId = input.playerId?.trim() || null;
  const rosterName = input.rosterName?.trim() || null;
  if (!playerId && !rosterName) return { error: "Pick a player or enter a name." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("hoops")
    .from("team_members")
    .insert({
      team_id: teamId,
      role: "player",
      player_id: playerId,
      roster_name: playerId ? null : rosterName,
      roster_position: playerId ? null : input.rosterPosition?.trim() || null,
      jersey_number: input.jerseyNumber?.trim() || null,
    });

  if (error) return { error: error.message };

  revalidatePath(`/teams/${teamId}`);
  return { error: null };
}

export async function updateRosterPlayer(
  teamMemberId: string,
  teamId: string,
  input: { jerseyNumber?: string; rosterPosition?: string }
) {
  if (!teamMemberId) return { error: "Missing roster entry." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("hoops")
    .from("team_members")
    .update({
      jersey_number: input.jerseyNumber?.trim() || null,
      roster_position: input.rosterPosition?.trim() || null,
    })
    .eq("id", teamMemberId);

  if (error) return { error: error.message };

  revalidatePath(`/teams/${teamId}`);
  return { error: null };
}

export async function removeRosterPlayer(teamMemberId: string, teamId: string) {
  if (!teamMemberId) return { error: "Missing roster entry." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("hoops")
    .from("team_members")
    .delete()
    .eq("id", teamMemberId);

  if (error) return { error: error.message };

  revalidatePath(`/teams/${teamId}`);
  return { error: null };
}

/**
 * Upgrades a roster-only entry once that family joins Hardwood Lab —
 * links the real player row rather than deleting and recreating the
 * roster row, so the jersey number and any plan history tied to this
 * team_members row survive.
 */
export async function linkRosterPlayer(teamMemberId: string, teamId: string, playerId: string) {
  if (!teamMemberId || !playerId) return { error: "Missing roster entry or player." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("hoops")
    .from("team_members")
    .update({ player_id: playerId, roster_name: null, roster_position: null })
    .eq("id", teamMemberId);

  if (error) return { error: error.message };

  revalidatePath(`/teams/${teamId}`);
  return { error: null };
}

/**
 * Creates or updates a scouting note for one opponent. notes is a small
 * fixed-shape JSONB object (tendencies / personnel / game_plan) rather
 * than fully freeform — enough structure that re-reading an old note
 * before a rematch is fast, without a schema rigid enough to fight a
 * coach's actual notes.
 */
export async function saveScoutingNote(
  teamId: string,
  noteId: string | null,
  input: { opponentName: string; notes: Record<string, string> }
) {
  if (!teamId) return { error: "Missing team." };
  const opponentName = input.opponentName.trim();
  if (!opponentName) return { error: "Name the opponent." };

  const supabase = await createClient();
  const payload = { team_id: teamId, opponent_name: opponentName, notes: input.notes };

  if (noteId) {
    const { error } = await supabase
      .schema("hoops")
      .from("scouting_notes")
      .update(payload)
      .eq("id", noteId);
    if (error) return { error: error.message };
    revalidatePath(`/teams/${teamId}/scouting`);
    return { error: null, noteId };
  }

  const { data, error } = await supabase
    .schema("hoops")
    .from("scouting_notes")
    .insert(payload)
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath(`/teams/${teamId}/scouting`);
  return { error: null, noteId: data.id as string };
}

export async function deleteScoutingNote(noteId: string, teamId: string) {
  if (!noteId) return { error: "Missing note." };

  const supabase = await createClient();
  const { error } = await supabase.schema("hoops").from("scouting_notes").delete().eq("id", noteId);

  if (error) return { error: error.message };

  revalidatePath(`/teams/${teamId}/scouting`);
  return { error: null };
}

/**
 * Adds a game to the schedule — for filling in a reschedule or a game
 * the imported MaxPreps schedule didn't have yet. Score and notes come
 * later, through saveGameResult, once the game's actually been played.
 */
export async function addGame(
  teamId: string,
  input: { opponent: string; gameDate: string; gameTime?: string; location?: string }
) {
  if (!teamId || !input.opponent.trim() || !input.gameDate) {
    return { error: "Opponent and date are required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("hoops")
    .from("games")
    .insert({
      team_id: teamId,
      opponent: input.opponent.trim(),
      game_date: input.gameDate,
      game_time: input.gameTime?.trim() || null,
      location: input.location || null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/teams/${teamId}/games`);
  return { error: null, gameId: data.id as string };
}

/**
 * Records the final score and/or post-game notes. Both optional and
 * independent — a coach might jot notes the night of but not know the
 * final tournament-bracket score until later, or vice versa.
 */
export async function saveGameResult(
  gameId: string,
  teamId: string,
  input: { teamScore: number | null; opponentScore: number | null; notes: string | null }
) {
  if (!gameId) return { error: "Missing game." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("hoops")
    .from("games")
    .update({
      team_score: input.teamScore,
      opponent_score: input.opponentScore,
      notes: input.notes?.trim() || null,
    })
    .eq("id", gameId);

  if (error) return { error: error.message };

  revalidatePath(`/teams/${teamId}/games`);
  return { error: null };
}

export async function deleteGame(gameId: string, teamId: string) {
  if (!gameId) return { error: "Missing game." };

  const supabase = await createClient();
  const { error } = await supabase.schema("hoops").from("games").delete().eq("id", gameId);

  if (error) return { error: error.message };

  revalidatePath(`/teams/${teamId}/games`);
  return { error: null };
}
