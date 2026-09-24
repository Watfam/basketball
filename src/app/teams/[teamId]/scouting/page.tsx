import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";

export default async function ScoutingNotesPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: team } = await supabase
    .schema("hoops")
    .from("teams")
    .select("id, name")
    .eq("id", teamId)
    .maybeSingle();

  if (!team) notFound();

  const { data: notes } = await supabase
    .schema("hoops")
    .from("scouting_notes")
    .select("id, opponent_name, notes, created_at")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-background/85 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between">
          <Link
            href={`/teams/${teamId}`}
            className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim transition-colors hover:text-foreground"
          >
            ← {team.name}
          </Link>
          <Link
            href={`/teams/${teamId}/scouting/new`}
            className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-accent transition-colors hover:text-accent-hover"
          >
            + New note
          </Link>
        </div>
      </header>

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
              <Link
                key={note.id}
                href={`/teams/${teamId}/scouting/${note.id}`}
                className="block rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-[var(--line-strong)]"
              >
                <p className="font-display text-xl uppercase leading-none tracking-tight text-foreground">
                  {note.opponent_name}
                </p>
                {preview && (
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-foreground-dim">
                    {preview}
                  </p>
                )}
              </Link>
            );
          })
        )}
      </main>
    </div>
  );
}
