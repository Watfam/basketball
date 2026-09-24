import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScoutingNoteForm } from "@/components/scouting-note-form";

export default async function EditScoutingNotePage({
  params,
}: {
  params: Promise<{ teamId: string; noteId: string }>;
}) {
  const { teamId, noteId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: note } = await supabase
    .schema("hoops")
    .from("scouting_notes")
    .select("id, opponent_name, notes")
    .eq("id", noteId)
    .eq("team_id", teamId)
    .maybeSingle();

  if (!note) notFound();

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-background/85 px-5 py-3 backdrop-blur">
        <div className="mx-auto w-full max-w-md">
          <Link
            href={`/teams/${teamId}/scouting`}
            className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim transition-colors hover:text-foreground"
          >
            ← Scouting
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-5 sm:py-8">
        <ScoutingNoteForm
          teamId={teamId}
          existing={{ ...note, notes: note.notes as Record<string, string> | null }}
        />
      </main>
    </div>
  );
}
