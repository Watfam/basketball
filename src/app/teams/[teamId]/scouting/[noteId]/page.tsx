import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SCOUTING_SECTIONS, ScoutingNoteForm } from "@/components/scouting-note-form";
import { Card } from "@/components/ui/card";
import { canCoachTeam } from "@/lib/basketball/team-access";
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
  const canEdit = await canCoachTeam(supabase, teamId, user.id);
  const sections = (note.notes ?? {}) as Record<string, string>;

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader back={{ href: `/teams/${teamId}/scouting`, label: "Scouting" }} width="md" />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-5 sm:py-8">
        {canEdit ? (
          <ScoutingNoteForm
            teamId={teamId}
            existing={{ ...note, notes: note.notes as Record<string, string> | null }}
          />
        ) : (
          <div className="space-y-3">
            <h1 className="font-display text-3xl uppercase leading-none tracking-wide text-foreground">{note.opponent_name}</h1>
            {SCOUTING_SECTIONS.filter((s) => sections[s.key]?.trim()).map((s) => (
              <Card key={s.key} className="p-4">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-accent">{s.label}</p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground">{sections[s.key]}</p>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
