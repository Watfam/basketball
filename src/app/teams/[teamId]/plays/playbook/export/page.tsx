import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { PlaybookExportPicker } from "@/components/plays/playbook-export-picker";
import { LIBRARY_PLAYS } from "@/lib/plays/library";
import { getMasterOverridesAll, getPlayEditsForTeam } from "@/lib/plays/play-edits-store";
import { mergeLibraryWithEdits } from "@/lib/plays/merge-edits";
import { getTeamPlayOrder } from "@/lib/plays/play-order-store";
import { applyPlayOrder } from "@/lib/plays/play-order";

export default async function PlaybookExportPage({ params }: { params: Promise<{ teamId: string }> }) {
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
  if (!canExport) redirect(`/teams/${teamId}/plays/playbook`);

  const [masters, edits, playOrder] = await Promise.all([getMasterOverridesAll(hoops), getPlayEditsForTeam(hoops, teamId), getTeamPlayOrder(hoops, teamId)]);
  const plays = applyPlayOrder(mergeLibraryWithEdits(LIBRARY_PLAYS, masters, edits), playOrder);

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader back={{ href: `/teams/${teamId}/plays/playbook`, label: "Playbook" }}>
        <span className="text-xs font-extrabold uppercase tracking-wide text-foreground-dim">Share playbook</span>
      </PageHeader>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-5 sm:py-8">
        <PlaybookExportPicker teamId={teamId} plays={plays} />
      </main>
    </div>
  );
}
