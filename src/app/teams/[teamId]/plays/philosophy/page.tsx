import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { PhilosophyEditor } from "@/components/plays/philosophy-editor";
import { TEAM_PHILOSOPHY } from "@/lib/plays/philosophy";
import { getTeamPhilosophy } from "@/lib/plays/philosophy-store";

export default async function TeamPhilosophyPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const supabase = await createClient();

  const [{ data: { user } }, { data: team }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.schema("hoops").from("teams").select("id, name, owner_id").eq("id", teamId).maybeSingle(),
  ]);

  if (!user) redirect("/login");
  if (!team) notFound();

  const hoops = supabase.schema("hoops");
  let canEdit = team.owner_id === user.id;
  if (!canEdit) {
    const { data: membership } = await hoops.from("team_members").select("role").eq("team_id", teamId).eq("user_id", user.id).maybeSingle();
    canEdit = membership?.role === "coach" || membership?.role === "assistant_coach";
  }

  const saved = await getTeamPhilosophy(hoops, teamId);

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader back={{ href: `/teams/${teamId}/plays`, label: team.name }}>
        <span className="text-xs font-extrabold uppercase tracking-wide text-foreground-dim">Philosophy</span>
      </PageHeader>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-5 sm:py-8">
        <PhilosophyEditor teamId={teamId} canEdit={canEdit} initialPillars={saved ?? TEAM_PHILOSOPHY} hasOverride={saved !== null} />
      </main>
    </div>
  );
}
