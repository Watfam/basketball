/** The database work for a saved, shareable playbook export (hoops.playbook_exports, migration 0031). */
import type { HoopsDb } from "../play-edits-store";

const NOT_READY =
  "Sharing a playbook link needs a database update (migration 0031) that has not been applied yet. Nothing was lost: your selection is still on this screen.";

function friendly(message: string): string {
  return /row-level security|permission denied|relation .*playbook_exports.* does not exist/i.test(message) ? NOT_READY : message;
}

export async function savePlaybookExport(hoops: HoopsDb, teamId: string, createdBy: string, html: string): Promise<{ id: string } | { error: string }> {
  const { data, error } = await hoops.from("playbook_exports").insert({ team_id: teamId, created_by: createdBy, html }).select("id").single();
  if (error) return { error: friendly(error.message) };
  return { id: data.id as string };
}

export async function getPlaybookExport(hoops: HoopsDb, id: string): Promise<string | null> {
  const { data } = await hoops.from("playbook_exports").select("html").eq("id", id).maybeSingle();
  return (data?.html as string | undefined) ?? null;
}
