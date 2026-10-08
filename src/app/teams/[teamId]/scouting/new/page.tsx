import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScoutingNoteForm } from "@/components/scouting-note-form";
import { PageHeader } from "@/components/ui/page-header";

export default async function NewScoutingNotePage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const supabase = await createClient();

  // Independent of each other — parallel instead of sequential.
  const [{ data: { user } }, { data: team }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.schema("hoops").from("teams").select("id").eq("id", teamId).maybeSingle(),
  ]);

  if (!user) redirect("/login");
  if (!team) notFound();

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader back={{ href: `/teams/${teamId}/scouting`, label: "Scouting" }} width="md" />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-5 sm:py-8">
        <ScoutingNoteForm teamId={teamId} />
      </main>
    </div>
  );
}
