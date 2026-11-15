/** The printable scouting report for one note — the coach's notes and drawn diagrams, laid out for print. */
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { TEAM_BRANDING } from "@/lib/plays/export/branding";
import { LOGO_DATA_URI } from "@/lib/plays/export/generated/player-bundle";
import { parseScoutingNotes } from "@/lib/scouting/report";
import { ScoutingReportDocument } from "@/lib/scouting/pdf/report-document";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get("teamId");
  const noteId = searchParams.get("noteId");
  if (!teamId || !noteId) return new NextResponse("Missing teamId or noteId.", { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Not signed in.", { status: 401 });

  const hoops = supabase.schema("hoops");
  const { data: team } = await hoops.from("teams").select("owner_id").eq("id", teamId).maybeSingle();
  if (!team) return new NextResponse("Team not found.", { status: 404 });

  let allowed = team.owner_id === user.id;
  if (!allowed) {
    const { data: membership } = await hoops.from("team_members").select("role").eq("team_id", teamId).eq("user_id", user.id).maybeSingle();
    allowed = membership?.role === "coach" || membership?.role === "assistant_coach";
  }
  if (!allowed) return new NextResponse("Only a coach on this team can download the scouting report.", { status: 403 });

  const { data: note } = await hoops.from("scouting_notes").select("opponent_name, notes").eq("id", noteId).eq("team_id", teamId).maybeSingle();
  if (!note) return new NextResponse("Scouting note not found.", { status: 404 });

  const buffer = await renderToBuffer(
    <ScoutingReportDocument
      data={{
        teamName: TEAM_BRANDING.name,
        teamSubtitle: TEAM_BRANDING.subtitle,
        logoDataUri: LOGO_DATA_URI,
        opponent: note.opponent_name,
        doc: parseScoutingNotes(note.notes),
        generatedAt: new Date().toISOString(),
      }}
    />
  );
  const slug = note.opponent_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "opponent";
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="scouting-report-${slug}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
