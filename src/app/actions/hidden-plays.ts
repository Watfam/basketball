"use server";

/** Hiding plays from a team's playbook, and bringing them back. RLS (migration 0035) limits writes to the team's coaches. */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hidePlays, restorePlays } from "@/lib/plays/hidden-store";

function refresh(teamId: string) {
  revalidatePath(`/teams/${teamId}/plays`, "page");
  revalidatePath(`/teams/${teamId}/plays/export`, "page");
}

export async function hidePlaysAction(teamId: string, libraryPlayIds: string[]): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const res = await hidePlays(supabase.schema("hoops"), teamId, libraryPlayIds);
  if (!res.error) refresh(teamId);
  return res;
}

export async function restorePlaysAction(teamId: string, libraryPlayIds: string[]): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const res = await restorePlays(supabase.schema("hoops"), teamId, libraryPlayIds);
  if (!res.error) refresh(teamId);
  return res;
}
