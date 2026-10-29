import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { PlaybookBrowser } from "@/components/plays/playbook-browser";
import { LIBRARY_PLAYS } from "@/lib/plays/library";
import { getPlayEditsForTeam } from "@/lib/plays/play-edits-store";
import { mergeLibraryWithEdits } from "@/lib/plays/merge-edits";

export default async function PlaybookPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const supabase = await createClient();

  const [{ data: { user } }, { data: team }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.schema("hoops").from("teams").select("id, name").eq("id", teamId).maybeSingle(),
  ]);

  if (!user) redirect("/login");
  if (!team) notFound();

  const edits = await getPlayEditsForTeam(supabase.schema("hoops"), teamId);
  const plays = mergeLibraryWithEdits(LIBRARY_PLAYS, edits);

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader back={{ href: `/teams/${teamId}`, label: team.name }}>
        <span className="text-xs font-extrabold uppercase tracking-wide text-foreground-dim">Playbook</span>
      </PageHeader>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-5 sm:py-8">
        <PlaybookBrowser teamId={teamId} plays={plays} />
      </main>
    </div>
  );
}
