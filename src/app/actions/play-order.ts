"use server";

/** Saving a team's custom play order (hoops.team_play_order, migration 0032) — same coach/owner check as every other play-editing action. */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { saveTeamPlayOrder } from "@/lib/plays/play-order-store";

export async function saveTeamPlayOrderAction(teamId: string, order: string[]): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const hoops = supabase.schema("hoops");
  const { data: team } = await hoops.from("teams").select("owner_id").eq("id", teamId).maybeSingle();
  if (!team) return { error: "Team not found." };

  let canEdit = team.owner_id === user.id;
  if (!canEdit) {
    const { data: membership } = await hoops.from("team_members").select("role").eq("team_id", teamId).eq("user_id", user.id).maybeSingle();
    canEdit = membership?.role === "coach" || membership?.role === "assistant_coach";
  }
  if (!canEdit) return { error: "Only a coach on this team can reorder the playbook." };

  const res = await saveTeamPlayOrder(hoops, teamId, order);
  if (!res.error) {
    revalidatePath(`/teams/${teamId}/plays/playbook`, "page");
    revalidatePath(`/teams/${teamId}/plays/playbook/export`, "page");
  }
  return res;
}
