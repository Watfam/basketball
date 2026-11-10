"use server";

/** A team's own edit of the printed Team Philosophy page: save (new or updated) and reset back to the hardcoded defaults. */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTeamPhilosophy, resetTeamPhilosophy, saveTeamPhilosophy } from "@/lib/plays/philosophy-store";
import type { PhilosophyPillar } from "@/lib/plays/philosophy";

function refresh(teamId: string) {
  revalidatePath(`/teams/${teamId}/plays/philosophy`, "page");
}

export async function saveTeamPhilosophyAction(teamId: string, pillars: PhilosophyPillar[]): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const res = await saveTeamPhilosophy(supabase.schema("hoops"), teamId, pillars);
  if (!res.error) refresh(teamId);
  return res;
}

export async function resetTeamPhilosophyAction(teamId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const res = await resetTeamPhilosophy(supabase.schema("hoops"), teamId);
  if (!res.error) refresh(teamId);
  return res;
}

export async function getTeamPhilosophyAction(teamId: string) {
  const supabase = await createClient();
  return getTeamPhilosophy(supabase.schema("hoops"), teamId);
}
