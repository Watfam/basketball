/** Taking a drill name off the list: the player's saved sets with that name lose the name. No set and no shot is deleted. */
import type { HoopsDb } from "./custom-workouts-store.ts";

export async function clearLabel(hoops: HoopsDb, playerId: string, label: string): Promise<{ error: string | null; changed: number }> {
  const name = String(label ?? "").trim();
  if (!playerId || !name) return { error: "Missing player or name.", changed: 0 };
  const { data: rows, error } = await hoops.from("shot_sessions").select("id, label").eq("player_id", playerId).limit(5000);
  if (error) return { error: error.message, changed: 0 };
  const ids = (rows ?? []).filter((r: { label: string | null }) => (r.label ?? "").trim() === name).map((r: { id: string }) => r.id);
  for (let i = 0; i < ids.length; i += 200) {
    const { error: upError } = await hoops.from("shot_sessions").update({ label: null }).in("id", ids.slice(i, i + 200)).eq("player_id", playerId);
    if (upError) return { error: upError.message, changed: i };
  }
  return { error: null, changed: ids.length };
}
