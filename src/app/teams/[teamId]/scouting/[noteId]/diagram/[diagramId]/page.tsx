import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlayDesigner } from "@/components/plays/play-designer";
import { parseScoutingNotes, SCOUT_SECTION_BY_KEY, type ScoutSectionKey } from "@/lib/scouting/report";
import { defaultScoutFrames } from "@/lib/scouting/frames";

export default async function ScoutDiagramPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string; noteId: string; diagramId: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const { teamId, noteId, diagramId } = await params;
  const { section } = await searchParams;
  const supabase = await createClient();

  const [{ data: { user } }, { data: note }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.schema("hoops").from("scouting_notes").select("id, opponent_name, notes").eq("id", noteId).eq("team_id", teamId).maybeSingle(),
  ]);
  if (!user) redirect("/login");
  if (!note) notFound();

  const doc = parseScoutingNotes(note.notes);
  const existing = doc.diagrams.find((d) => d.id === diagramId);
  const sectionKey = (existing?.section ?? section) as ScoutSectionKey | undefined;
  const def = sectionKey ? SCOUT_SECTION_BY_KEY[sectionKey] : undefined;
  if (!sectionKey || !def?.diagram) notFound();

  return (
    <PlayDesigner
      key={diagramId}
      teamId={teamId}
      initialFrames={existing?.frames ?? defaultScoutFrames(sectionKey)}
      initialPlayName={existing?.title ?? def.diagram.hint}
      initialAbout={existing?.caption ?? ""}
      scouting={{
        noteId,
        diagramId,
        section: sectionKey,
        backHref: `/teams/${teamId}/scouting/${noteId}`,
        backLabel: note.opponent_name,
      }}
    />
  );
}
