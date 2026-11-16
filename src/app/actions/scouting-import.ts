"use server";

import { createClient } from "@/lib/supabase/server";
import { fetchMaxPrepsTeam, type MaxPrepsTeam } from "@/lib/scouting/maxpreps";

/** Reads an opponent's public MaxPreps pages for the scouting note. Coaches only, so the server isn't an open proxy. */
export async function pullMaxPrepsAction(teamId: string, url: string, playerNumbers: string[]): Promise<{ team: MaxPrepsTeam } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const hoops = supabase.schema("hoops");
  const { data: team } = await hoops.from("teams").select("owner_id").eq("id", teamId).maybeSingle();
  if (!team) return { error: "Team not found." };
  let allowed = team.owner_id === user.id;
  if (!allowed) {
    const { data: m } = await hoops.from("team_members").select("role").eq("team_id", teamId).eq("user_id", user.id).maybeSingle();
    allowed = m?.role === "coach" || m?.role === "assistant_coach";
  }
  if (!allowed) return { error: "Only a coach on this team can do that." };
  try {
    return { team: await fetchMaxPrepsTeam(url, playerNumbers.slice(0, 15)) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "MaxPreps didn't answer — try again in a minute." };
  }
}
