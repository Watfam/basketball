"use server";

/** A team's edits to a library play: save (new or updated) and reset back to the stock version. */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPlayEdit, resetPlayEdit, savePlayEdit, type PlayEditInput } from "@/lib/plays/play-edits-store";

function refresh(teamId: string) {
  revalidatePath(`/teams/${teamId}/plays/playbook`, "page");
  revalidatePath(`/teams/${teamId}/plays/playbook/[playId]`, "page");
  revalidatePath(`/teams/${teamId}/plays`, "page");
}

export async function savePlayEditAction(
  teamId: string,
  libraryPlayId: string,
  input: PlayEditInput
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const res = await savePlayEdit(supabase.schema("hoops"), teamId, libraryPlayId, input);
  if (!res.error) refresh(teamId);
  return res;
}

export async function resetPlayEditAction(teamId: string, libraryPlayId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const res = await resetPlayEdit(supabase.schema("hoops"), teamId, libraryPlayId);
  if (!res.error) refresh(teamId);
  return res;
}

export async function getPlayEditAction(teamId: string, libraryPlayId: string) {
  const supabase = await createClient();
  return getPlayEdit(supabase.schema("hoops"), teamId, libraryPlayId);
}
