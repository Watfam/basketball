/**
 * A shareable playbook link — no login required. This is the whole point: a
 * player or parent with no app account at all can open this and watch the
 * plays develop, same as the coach does in-app. hoops.playbook_exports'
 * public SELECT policy (migration 0031) is what actually gates this; the
 * unguessable uuid in the URL is the access control.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlaybookExport } from "@/lib/plays/export/export-store";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const html = await getPlaybookExport(supabase.schema("hoops"), id);
  if (!html) {
    return new NextResponse("This playbook link doesn't exist, or has been removed.", { status: 404 });
  }
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
