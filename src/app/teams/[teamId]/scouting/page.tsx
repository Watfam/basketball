import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { PageHeader, HeaderLink } from "@/components/ui/page-header";
import { CardLink } from "@/components/ui/card";

export default async function ScoutingNotesPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const supabase = await createClient();

  // Independent of each other — parallel instead of sequential.
  const [{ data: { user } }, { data: team }, { data: notes }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.schema("hoops").from("teams").select("id, name").eq("id", teamId).maybeSingle(),
    supabase
      .schema("hoops")
      .from("scouting_notes")
      .select("id, opponent_name, notes, created_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false }),
  ]);

  if (!user) redirect("/login");
  if (!team) notFound();

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader back={{ href: "/coach", label: "Coach" }}>
        <HeaderLink href={`/teams/${teamId}/scouting/new`} tone="accent">
          + New note
        </HeaderLink>
      </PageHeader>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-3 px-4 py-5 sm:py-8">
        <h1 className="font-display text-3xl uppercase leading-none tracking-wide text-foreground">
          Scouting
        </h1>

        {(notes ?? []).length === 0 ? (
          <EmptyState
            eyebrow="Nothing yet"
            title="No scouting notes"
            subtitle="Write one before the first game against a team and it's there for the rematch."
          />
        ) : (
          (notes ?? []).map((note) => {
            const body = (note.notes ?? {}) as Record<string, string>;
            const preview = body.personnel || body.tendencies || body.game_plan || "";
            return (
              <CardLink key={note.id} href={`/teams/${teamId}/scouting/${note.id}`} className="p-4">
                <p className="font-display text-xl uppercase leading-none tracking-tight text-foreground">
                  {note.opponent_name}
                </p>
                {preview && (
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-foreground-dim">
                    {preview}
                  </p>
                )}
              </CardLink>
            );
          })
        )}
      </main>
    </div>
  );
}
