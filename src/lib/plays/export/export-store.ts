/** The database work for a saved, shareable playbook export (hoops.playbook_exports, migration 0031). */
import type { HoopsDb } from "../play-edits-store";

export async function savePlaybookExport(hoops: HoopsDb, teamId: string, createdBy: string, html: string): Promise<{ id: string } | { error: string }> {
  const { data, error } = await hoops.from("playbook_exports").insert({ team_id: teamId, created_by: createdBy, html }).select("id").single();
  if (error) return { error: error.message };
  return { id: data.id as string };
}

export async function getPlaybookExport(hoops: HoopsDb, id: string): Promise<string | null> {
  const { data } = await hoops.from("playbook_exports").select("html").eq("id", id).maybeSingle();
  return (data?.html as string | undefined) ?? null;
}
