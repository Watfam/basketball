"use server";

/** Builds a downloadable, self-contained HTML playbook export from a coach's selected plays — used for the in-app "Open" flow, which shows the result in a tab the coach already opened. See build-export.ts for the actual logic (shared with the real-URL download route). */

import { buildPlaybookExport } from "@/lib/plays/export/build-export";

export async function buildPlaybookExportHtml(teamId: string, playIds: string[]): Promise<{ html: string } | { error: string }> {
  return buildPlaybookExport(teamId, playIds);
}
