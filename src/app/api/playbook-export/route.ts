/**
 * A real, network-served download — the experimental alternative to the in-app "Open" flow's
 * blob: URL. A genuine HTTP response with Content-Disposition: attachment is the standard way
 * browsers decide something is a download (vs. the blob+<a download> trick, which goes through
 * Quick Look on iOS and previews blank since Quick Look disables JS for local file previews).
 * Whether a real server download fares any better inside an installed standalone PWA, where
 * Safari's own Share sheet isn't available at all, is the open question this route exists to test.
 */
import { NextRequest, NextResponse } from "next/server";
import { buildPlaybookExport } from "@/lib/plays/export/build-export";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get("teamId");
  const idsParam = searchParams.get("ids");
  if (!teamId || !idsParam) {
    return new NextResponse("Missing teamId or ids.", { status: 400 });
  }

  const playIds = idsParam.split(",").filter(Boolean);
  const result = await buildPlaybookExport(teamId, playIds);
  if ("error" in result) {
    return new NextResponse(result.error, { status: 400 });
  }

  const filename = `evangel-lightning-playbook-${new Date().toISOString().slice(0, 10)}.html`;
  return new NextResponse(result.html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
