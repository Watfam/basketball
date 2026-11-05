/** The database work for a team's saved play order (hoops.team_play_order, migration 0032). */
import type { HoopsDb } from "./play-edits-store";

export const NOT_READY =
  "Saving play order needs a database update (migration 0032) that has not been applied yet. Nothing was lost: the new order is still on this screen.";

export function friendly(message: string): string {
  return /row-level security|permission denied|relation .*team_play_order.* does not exist/i.test(message) ? NOT_READY : message;
}

export async function getTeamPlayOrder(hoops: HoopsDb, teamId: string): Promise<string[]> {
  const { data } = await hoops.from("team_play_order").select("play_order").eq("team_id", teamId).maybeSingle();
  return (data?.play_order as string[] | undefined) ?? [];
}

export async function saveTeamPlayOrder(hoops: HoopsDb, teamId: string, order: string[]): Promise<{ error: string | null }> {
  const { error } = await hoops.from("team_play_order").upsert({ team_id: teamId, play_order: order, updated_at: new Date().toISOString() });
  return { error: error ? friendly(error.message) : null };
}
