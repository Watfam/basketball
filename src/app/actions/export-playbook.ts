"use server";

/** Builds a playbook export and saves it as a shareable link a coach can send to anyone — see build-export.ts for the actual logic. */

import { createPlaybookExportLink } from "@/lib/plays/export/build-export";

export async function createPlaybookExportLinkAction(teamId: string, playIds: string[]): Promise<{ url: string } | { error: string }> {
  return createPlaybookExportLink(teamId, playIds);
}
