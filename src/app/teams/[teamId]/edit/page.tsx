import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { TeamForm } from "@/components/team-form";
import { DeleteTeamButton } from "@/components/delete-team-button";

export default async function EditTeamPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const supabase = await createClient();

  // Independent of each other — parallel instead of sequential.
  const [{ data: { user } }, { data: team }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .schema("hoops")
      .from("teams")
      .select("id, owner_id, name, defensive_scheme, defensive_scheme_custom, offensive_scheme, offensive_scheme_custom, focus_areas")
      .eq("id", teamId)
      .maybeSingle(),
  ]);

  if (!user) redirect("/login");
  if (!team) notFound();
  // Only the owner edits or deletes the team.
  if (team.owner_id !== user.id) redirect(`/teams/${teamId}`);

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader back={{ href: `/teams/${teamId}`, label: team.name }} width="md" />

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-5 sm:py-8">
        <div className="mb-5">
          <h1 className="font-display text-3xl uppercase leading-none tracking-wide text-foreground">
            Edit Team
          </h1>
        </div>
        <TeamForm existing={team} />
        <DeleteTeamButton teamId={team.id} teamName={team.name} />
      </main>
    </div>
  );
}
