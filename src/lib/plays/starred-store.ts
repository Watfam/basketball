/** The database work for a team's starred plays, against any hoops-scoped client. */

export type HoopsDb = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export const NOT_READY =
  "Starring a play needs a database update (migration 0034) that has not been applied yet. Nothing was lost: the star is still on this screen.";

export function friendly(message: string): string {
  return /row-level security|permission denied|relation .*team_starred_plays.* does not exist/i.test(message) ? NOT_READY : message;
}

/** Every play this team has starred — ids only, order not meaningful (the playbook's own order decides display). */
export async function getTeamStarred(hoops: HoopsDb, teamId: string): Promise<string[]> {
  const { data } = await hoops.from("team_starred_plays").select("library_play_id").eq("team_id", teamId);
  return ((data ?? []) as Array<{ library_play_id: string }>).map((r) => r.library_play_id);
}

export async function setStarred(hoops: HoopsDb, teamId: string, libraryPlayId: string, starred: boolean): Promise<{ error: string | null }> {
  if (!teamId || !libraryPlayId) return { error: "Missing play." };
  const { error } = starred
    ? await hoops.from("team_starred_plays").upsert({ team_id: teamId, library_play_id: libraryPlayId }, { onConflict: "team_id,library_play_id" })
    : await hoops.from("team_starred_plays").delete().eq("team_id", teamId).eq("library_play_id", libraryPlayId);
  if (error) return { error: friendly(error.message) };
  return { error: null };
}

/** One-shot import of a phone's old localStorage stars into the team's list — additive, never removes anything already starred. */
export async function importStarred(hoops: HoopsDb, teamId: string, libraryPlayIds: string[]): Promise<{ error: string | null }> {
  const ids = [...new Set(libraryPlayIds.filter(Boolean))];
  if (!teamId || !ids.length) return { error: null };
  const { error } = await hoops
    .from("team_starred_plays")
    .upsert(ids.map((id) => ({ team_id: teamId, library_play_id: id })), { onConflict: "team_id,library_play_id" });
  if (error) return { error: friendly(error.message) };
  return { error: null };
}
