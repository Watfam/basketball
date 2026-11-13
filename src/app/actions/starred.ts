"use server";

/** A team's starred plays: star/unstar one, and a one-shot import of a phone's old localStorage list. */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { importStarred, setStarred } from "@/lib/plays/starred-store";

function refresh(teamId: string) {
  revalidatePath(`/teams/${teamId}/plays`, "page");
  revalidatePath(`/teams/${teamId}/plays/export`, "page");
}

export async function setStarredAction(teamId: string, libraryPlayId: string, starred: boolean): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const res = await setStarred(supabase.schema("hoops"), teamId, libraryPlayId, starred);
  if (!res.error) refresh(teamId);
  return res;
}

export async function importStarredAction(teamId: string, libraryPlayIds: string[]): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const res = await importStarred(supabase.schema("hoops"), teamId, libraryPlayIds);
  if (!res.error) refresh(teamId);
  return res;
}
