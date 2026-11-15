/** Server-side loading shared by the matchup pages: the scouting note plus the team's playbook as it stands today (edits applied, hidden plays dropped). */
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LIBRARY_PLAYS, type LibraryPlay } from "@/lib/plays/library";
import { getMasterOverridesAll, getPlayEditsForTeam } from "@/lib/plays/play-edits-store";
import { mergeLibraryWithEdits } from "@/lib/plays/merge-edits";
import { getTeamHidden } from "@/lib/plays/hidden-store";
import { parseScoutingNotes, type ScoutDoc } from "@/lib/scouting/report";

export async function loadMatchupContext(teamId: string, noteId: string): Promise<{ opponent: string; doc: ScoutDoc; plays: LibraryPlay[] }> {
  const supabase = await createClient();
  const hoops = supabase.schema("hoops");
  const [{ data: { user } }, { data: note }] = await Promise.all([
    supabase.auth.getUser(),
    hoops.from("scouting_notes").select("id, opponent_name, notes").eq("id", noteId).eq("team_id", teamId).maybeSingle(),
  ]);
  if (!user) redirect("/login");
  if (!note) notFound();

  const [masters, edits, hidden] = await Promise.all([getMasterOverridesAll(hoops), getPlayEditsForTeam(hoops, teamId), getTeamHidden(hoops, teamId)]);
  const hiddenSet = new Set(hidden);
  const plays = mergeLibraryWithEdits(LIBRARY_PLAYS, masters, edits).filter((p) => !hiddenSet.has(p.id));
  return { opponent: note.opponent_name, doc: parseScoutingNotes(note.notes), plays };
}
