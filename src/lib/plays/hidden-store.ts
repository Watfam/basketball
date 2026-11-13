/** The database work for the plays a team has hidden from its playbook, against any hoops-scoped client. */

export type HoopsDb = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export const NOT_READY =
  "Hiding plays needs a database update (migration 0035) that has not been applied yet. Nothing was changed.";

function friendly(message: string): string {
  return /row-level security|permission denied|relation .*team_hidden_plays.* does not exist/i.test(message) ? NOT_READY : message;
}

/** Every library play id this team has hidden. Empty (not an error) until migration 0035 is applied, so the playbook keeps working. */
export async function getTeamHidden(hoops: HoopsDb, teamId: string): Promise<string[]> {
  const { data } = await hoops.from("team_hidden_plays").select("library_play_id").eq("team_id", teamId);
  return ((data ?? []) as Array<{ library_play_id: string }>).map((r) => r.library_play_id);
}

export async function hidePlays(hoops: HoopsDb, teamId: string, libraryPlayIds: string[]): Promise<{ error: string | null }> {
  const ids = [...new Set(libraryPlayIds.filter(Boolean))];
  if (!teamId || !ids.length) return { error: "Pick at least one play." };
  const { error } = await hoops
    .from("team_hidden_plays")
    .upsert(ids.map((id) => ({ team_id: teamId, library_play_id: id })), { onConflict: "team_id,library_play_id" });
  return { error: error ? friendly(error.message) : null };
}

export async function restorePlays(hoops: HoopsDb, teamId: string, libraryPlayIds: string[]): Promise<{ error: string | null }> {
  const ids = [...new Set(libraryPlayIds.filter(Boolean))];
  if (!teamId || !ids.length) return { error: "Pick at least one play." };
  const { error } = await hoops.from("team_hidden_plays").delete().eq("team_id", teamId).in("library_play_id", ids);
  return { error: error ? friendly(error.message) : null };
}
