/** The server action behind the picker's "Get playbook link" action — builds the export HTML, saves it as a shareable row (hoops.playbook_exports, migration 0031), and returns the public URL. */
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { LIBRARY_PLAYS, PLAY_CATEGORY_LABEL } from "@/lib/plays/library";
import { getMasterOverridesAll, getPlayEditsForTeam } from "@/lib/plays/play-edits-store";
import { mergeLibraryWithEdits } from "@/lib/plays/merge-edits";
import { deriveDefenseType, deriveSetType } from "./derive";
import { renderExportHtml } from "./render-html";
import { savePlaybookExport } from "./export-store";
import { TEAM_BRANDING } from "./branding";
import { PLAYER_BUNDLE_JS, LOGO_DATA_URI } from "./generated/player-bundle";
import type { ExportData } from "./types";

export async function createPlaybookExportLink(teamId: string, playIds: string[]): Promise<{ url: string } | { error: string }> {
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
  if (!canExport) return { error: "Only a coach on this team can share the playbook." };

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

  const html = renderExportHtml(data, PLAYER_BUNDLE_JS);
  const saved = await savePlaybookExport(hoops, teamId, user.id, html);
  if ("error" in saved) return { error: saved.error };

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${h.get("host")}`;
  return { url: `${origin}/playbook/${saved.id}` };
}
