"use server";

/** Builds a downloadable, self-contained HTML playbook export from a coach's selected plays. */

import { createClient } from "@/lib/supabase/server";
import { LIBRARY_PLAYS, PLAY_CATEGORY_LABEL } from "@/lib/plays/library";
import { getMasterOverridesAll, getPlayEditsForTeam } from "@/lib/plays/play-edits-store";
import { mergeLibraryWithEdits } from "@/lib/plays/merge-edits";
import { deriveDefenseType, deriveSetType } from "@/lib/plays/export/derive";
import { renderExportHtml } from "@/lib/plays/export/render-html";
import { TEAM_BRANDING } from "@/lib/plays/export/branding";
import { PLAYER_BUNDLE_JS, LOGO_DATA_URI } from "@/lib/plays/export/generated/player-bundle";
import type { ExportData } from "@/lib/plays/export/types";

export async function buildPlaybookExportHtml(teamId: string, playIds: string[]): Promise<{ html: string } | { error: string }> {
  if (!playIds.length) return { error: "Select at least one play first." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const hoops = supabase.schema("hoops");
  const { data: team } = await hoops.from("teams").select("owner_id").eq("id", teamId).maybeSingle();
  if (!team) return { error: "Team not found." };

  let canExport = team.owner_id === user.id;
  if (!canExport) {
    const { data: membership } = await hoops.from("team_members").select("role").eq("team_id", teamId).eq("user_id", user.id).maybeSingle();
    canExport = membership?.role === "coach" || membership?.role === "assistant_coach";
  }
  if (!canExport) return { error: "Only a coach on this team can download the playbook." };

  const [masters, edits] = await Promise.all([getMasterOverridesAll(hoops), getPlayEditsForTeam(hoops, teamId)]);
  const resolved = mergeLibraryWithEdits(LIBRARY_PLAYS, masters, edits);

  const byId = new Map(resolved.map((p) => [p.id, p]));
  const plays: ExportData["plays"] = [];
  for (const id of playIds) {
    const p = byId.get(id);
    if (!p) continue;
    plays.push({
      id: p.id,
      name: p.name,
      category: p.category,
      categoryLabel: PLAY_CATEGORY_LABEL[p.category],
      setType: deriveSetType(p.category),
      defenseType: deriveDefenseType(p.category, p.vs),
      vs: p.vs,
      about: p.about,
      keys: p.keys,
      frames: p.frames,
    });
  }
  if (!plays.length) return { error: "None of the selected plays could be found." };

  const data: ExportData = {
    generatedAt: new Date().toISOString(),
    team: {
      name: TEAM_BRANDING.name,
      subtitle: TEAM_BRANDING.subtitle,
      logoDataUri: LOGO_DATA_URI,
      navy: TEAM_BRANDING.navy,
      gold: TEAM_BRANDING.gold,
      silver: TEAM_BRANDING.silver,
      paper: TEAM_BRANDING.paper,
      stripe: TEAM_BRANDING.stripe,
    },
    plays,
  };

  return { html: renderExportHtml(data, PLAYER_BUNDLE_JS) };
}
