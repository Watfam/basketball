/**
 * A real, printable PDF of the selected plays — the actual fix for "the HTML download doesn't work
 * on iPhone." A PDF has no JavaScript to disable, so none of the Quick Look problems that killed the
 * HTML download/blob approaches apply here at all: every platform's native PDF viewer (iOS Safari's
 * Quick Look included) renders it directly, and its own Share sheet works normally from there.
 */
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { LIBRARY_PLAYS, PLAY_CATEGORY_LABEL } from "@/lib/plays/library";
import { getMasterOverridesAll, getPlayEditsForTeam } from "@/lib/plays/play-edits-store";
import { getTeamPhilosophy } from "@/lib/plays/philosophy-store";
import { TEAM_PHILOSOPHY } from "@/lib/plays/philosophy";
import { mergeLibraryWithEdits } from "@/lib/plays/merge-edits";
import { getTeamPlayOrder } from "@/lib/plays/play-order-store";
import { getTeamHidden } from "@/lib/plays/hidden-store";
import { applyPlayOrder } from "@/lib/plays/play-order";
import { deriveDefenseType, deriveSetType } from "@/lib/plays/export/derive";
import { TEAM_BRANDING } from "@/lib/plays/export/branding";
import { LOGO_DATA_URI } from "@/lib/plays/export/generated/player-bundle";
import { stripDefense } from "@/lib/plays/export/strip-defense";
import { PlaybookPdfDocument } from "@/lib/plays/pdf/document";
import type { ExportData } from "@/lib/plays/export/types";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get("teamId");
  const idsParam = searchParams.get("ids");
  if (!teamId || !idsParam) {
    return new NextResponse("Missing teamId or ids.", { status: 400 });
  }
  const playIds = idsParam.split(",").filter(Boolean);
  if (!playIds.length) {
    return new NextResponse("Select at least one play first.", { status: 400 });
  }
  const hideSet = new Set((searchParams.get("hideDefense") ?? "").split(",").filter(Boolean));
  const includePhilosophy = searchParams.get("philosophy") !== "0";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Not signed in.", { status: 401 });

  const hoops = supabase.schema("hoops");
  const { data: team } = await hoops.from("teams").select("owner_id").eq("id", teamId).maybeSingle();
  if (!team) return new NextResponse("Team not found.", { status: 404 });

  let canExport = team.owner_id === user.id;
  if (!canExport) {
    const { data: membership } = await hoops.from("team_members").select("role").eq("team_id", teamId).eq("user_id", user.id).maybeSingle();
    canExport = membership?.role === "coach" || membership?.role === "assistant_coach";
  }
  if (!canExport) return new NextResponse("Only a coach on this team can download the playbook.", { status: 403 });

  const [masters, edits, playOrder, hidden, philosophy] = await Promise.all([
    getMasterOverridesAll(hoops),
    getPlayEditsForTeam(hoops, teamId),
    getTeamPlayOrder(hoops, teamId),
    getTeamHidden(hoops, teamId),
    includePhilosophy ? getTeamPhilosophy(hoops, teamId) : Promise.resolve(null),
  ]);
  const hiddenSet = new Set(hidden);
  const resolved = applyPlayOrder(mergeLibraryWithEdits(LIBRARY_PLAYS, masters, edits), playOrder).filter((p) => !hiddenSet.has(p.id));

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
      frames: hideSet.has(id) ? stripDefense(p.frames) : p.frames,
    });
  }
  if (!plays.length) return new NextResponse("None of the selected plays could be found.", { status: 400 });

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
    philosophy: includePhilosophy ? (philosophy ?? TEAM_PHILOSOPHY) : null,
  };

  const buffer = await renderToBuffer(<PlaybookPdfDocument data={data} />);
  const filename = `evangel-lightning-playbook-${new Date().toISOString().slice(0, 10)}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
