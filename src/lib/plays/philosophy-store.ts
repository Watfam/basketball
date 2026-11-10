/** The database work for a team's own edit of the printed Team Philosophy page, against any hoops-scoped client. */
import type { PhilosophyPillar } from "./philosophy";

export type HoopsDb = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export const NOT_READY =
  "Saving the team philosophy needs a database update (migration 0033) that has not been applied yet. Nothing was lost: your changes are still on this screen.";

export function friendly(message: string): string {
  return /row-level security|permission denied|relation .*team_philosophy.* does not exist/i.test(message) ? NOT_READY : message;
}

function clean(pillars: PhilosophyPillar[]): { ok: true; value: PhilosophyPillar[] } | { ok: false; error: string } {
  const value = pillars
    .map((p) => ({ title: p.title.trim(), points: p.points.map((pt) => pt.trim()).filter(Boolean) }))
    .filter((p) => p.title && p.points.length > 0);
  if (!value.length) return { ok: false, error: "Add at least one pillar with a title and a point." };
  return { ok: true, value };
}

/** The team's own saved philosophy, or null if it has never edited it (use the hardcoded defaults). */
export async function getTeamPhilosophy(hoops: HoopsDb, teamId: string): Promise<PhilosophyPillar[] | null> {
  const { data } = await hoops.from("team_philosophy").select("pillars").eq("team_id", teamId).maybeSingle();
  if (!data) return null;
  return (data.pillars ?? []) as PhilosophyPillar[];
}

export async function saveTeamPhilosophy(hoops: HoopsDb, teamId: string, pillars: PhilosophyPillar[]): Promise<{ error: string | null }> {
  if (!teamId) return { error: "Missing team." };
  const checked = clean(pillars);
  if (!checked.ok) return { error: checked.error };
  const { error } = await hoops.from("team_philosophy").upsert({ team_id: teamId, pillars: checked.value, updated_at: new Date().toISOString() }, { onConflict: "team_id" });
  if (error) return { error: friendly(error.message) };
  return { error: null };
}

/** Deletes the team's saved edit, reverting the page back to the hardcoded defaults. */
export async function resetTeamPhilosophy(hoops: HoopsDb, teamId: string): Promise<{ error: string | null }> {
  if (!teamId) return { error: "Missing team." };
  const { error } = await hoops.from("team_philosophy").delete().eq("team_id", teamId);
  if (error) return { error: friendly(error.message) };
  return { error: null };
}
