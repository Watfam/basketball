import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, HeaderLink } from "@/components/ui/page-header";
import { PlaybookBrowser } from "@/components/plays/playbook-browser";
import { LIBRARY_PLAYS } from "@/lib/plays/library";
import { getMasterOverridesAll, getPlayEditsForTeam } from "@/lib/plays/play-edits-store";
import { mergeLibraryWithEdits } from "@/lib/plays/merge-edits";

export default async function PlaybookPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const supabase = await createClient();

  const [{ data: { user } }, { data: team }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.schema("hoops").from("teams").select("id, name, owner_id").eq("id", teamId).maybeSingle(),
  ]);

  if (!user) redirect("/login");
  if (!team) notFound();

  const hoops = supabase.schema("hoops");
  let canExport = team.owner_id === user.id;
  if (!canExport) {
    const { data: membership } = await hoops.from("team_members").select("role").eq("team_id", teamId).eq("user_id", user.id).maybeSingle();
    canExport = membership?.role === "coach" || membership?.role === "assistant_coach";
  }

  const [masters, edits] = await Promise.all([getMasterOverridesAll(hoops), getPlayEditsForTeam(hoops, teamId)]);
  const plays = mergeLibraryWithEdits(LIBRARY_PLAYS, masters, edits);

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader back={{ href: `/teams/${teamId}`, label: team.name }}>
        <span className="text-xs font-extrabold uppercase tracking-wide text-foreground-dim">Playbook</span>
        {canExport && <HeaderLink href={`/teams/${teamId}/plays/playbook/export`}>Download</HeaderLink>}
      </PageHeader>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-5 sm:py-8">
        <Suspense fallback={null}>
          <PlaybookBrowser teamId={teamId} plays={plays} />
        </Suspense>
      </main>
    </div>
  );
}
