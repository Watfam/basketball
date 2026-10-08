import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScoutingNoteForm } from "@/components/scouting-note-form";
import { PageHeader } from "@/components/ui/page-header";

export default async function EditScoutingNotePage({
  params,
}: {
  params: Promise<{ teamId: string; noteId: string }>;
}) {
  const { teamId, noteId } = await params;
  const supabase = await createClient();

  // Independent of each other — parallel instead of sequential.
  const [{ data: { user } }, { data: note }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .schema("hoops")
      .from("scouting_notes")
      .select("id, opponent_name, notes")
      .eq("id", noteId)
      .eq("team_id", teamId)
      .maybeSingle(),
  ]);

  if (!user) redirect("/login");
  if (!note) notFound();

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader back={{ href: `/teams/${teamId}/scouting`, label: "Scouting" }} width="md" />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-5 sm:py-8">
        <ScoutingNoteForm
          teamId={teamId}
          existing={{ ...note, notes: note.notes as Record<string, string> | null }}
        />
      </main>
    </div>
  );
}
