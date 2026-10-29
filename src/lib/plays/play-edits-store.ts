/** The database work for a team's edits to a library play, against any hoops-scoped client. */
import type { Frame } from "./types";

export type HoopsDb = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export type PlayEditInput = {
  name: string;
  vs: string;
  about: string;
  keys: string[];
  frames: Frame[];
};

export type PlayEditRow = PlayEditInput & {
  libraryPlayId: string;
};

export const NOT_READY =
  "Saving play edits needs a database update (migration 0028) that has not been applied yet. Nothing was lost: your changes are still on this screen.";

export function friendly(message: string): string {
  return /row-level security|permission denied|relation .*play_edits.* does not exist/i.test(message) ? NOT_READY : message;
}

function clean(input: PlayEditInput): { ok: true; value: PlayEditInput } | { ok: false; error: string } {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give the play a name." };
  if (!input.frames.length) return { ok: false, error: "A play needs at least one frame." };
  return {
    ok: true,
    value: {
      name,
      vs: input.vs.trim(),
      about: input.about.trim(),
      keys: input.keys.map((k) => k.trim()).filter(Boolean),
      frames: input.frames,
    },
  };
}

/** The saved edit for one team's copy of one library play, or null if that team has never edited it. */
export async function getPlayEdit(hoops: HoopsDb, teamId: string, libraryPlayId: string): Promise<PlayEditRow | null> {
  const { data } = await hoops
    .from("play_edits")
    .select("name, vs, about, keys, frames")
    .eq("team_id", teamId)
    .eq("library_play_id", libraryPlayId)
    .maybeSingle();
  if (!data) return null;
  return { libraryPlayId, name: data.name, vs: data.vs, about: data.about, keys: (data.keys ?? []) as string[], frames: data.frames as Frame[] };
}

/** Every edit a team has saved, for merging onto the library list in one pass instead of one query per play. */
export async function getPlayEditsForTeam(hoops: HoopsDb, teamId: string): Promise<PlayEditRow[]> {
  const { data } = await hoops.from("play_edits").select("library_play_id, name, vs, about, keys, frames").eq("team_id", teamId);
  return ((data ?? []) as Array<{ library_play_id: string; name: string; vs: string; about: string; keys: unknown; frames: unknown }>).map((r) => ({
    libraryPlayId: r.library_play_id,
    name: r.name,
    vs: r.vs,
    about: r.about,
    keys: (r.keys ?? []) as string[],
    frames: r.frames as Frame[],
  }));
}

export async function savePlayEdit(
  hoops: HoopsDb,
  teamId: string,
  libraryPlayId: string,
  input: PlayEditInput
): Promise<{ error: string | null }> {
  if (!teamId || !libraryPlayId) return { error: "Missing play." };
  const checked = clean(input);
  if (!checked.ok) return { error: checked.error };
  const v = checked.value;
  const { error } = await hoops
    .from("play_edits")
    .upsert(
      { team_id: teamId, library_play_id: libraryPlayId, name: v.name, vs: v.vs, about: v.about, keys: v.keys, frames: v.frames },
      { onConflict: "team_id,library_play_id" }
    );
  if (error) return { error: friendly(error.message) };
  return { error: null };
}

/** Deletes a team's edit, reverting that play back to the stock library version. */
export async function resetPlayEdit(hoops: HoopsDb, teamId: string, libraryPlayId: string): Promise<{ error: string | null }> {
  if (!teamId || !libraryPlayId) return { error: "Missing play." };
  const { error } = await hoops.from("play_edits").delete().eq("team_id", teamId).eq("library_play_id", libraryPlayId);
  if (error) return { error: friendly(error.message) };
  return { error: null };
}
