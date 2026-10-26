import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, Eyebrow } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { PlayThumbnail } from "@/components/plays/play-thumbnail";
import { LIBRARY_PLAYS, PLAY_CATEGORY_LABEL, type LibraryTeam } from "@/lib/plays/library";

const TEAMS: LibraryTeam[] = ["UConn", "Auburn", "Louisville", "Generic"];
const TEAM_LABEL: Record<LibraryTeam, string> = {
  UConn: "UConn",
  Auburn: "Auburn",
  Louisville: "Louisville",
  Generic: "Generic (not team-specific)",
};

export default async function PlaybookPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const supabase = await createClient();

  const [{ data: { user } }, { data: team }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.schema("hoops").from("teams").select("id, name").eq("id", teamId).maybeSingle(),
  ]);

  if (!user) redirect("/login");
  if (!team) notFound();

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader back={{ href: `/teams/${teamId}`, label: team.name }}>
        <span className="text-xs font-extrabold uppercase tracking-wide text-foreground-dim">Playbook</span>
      </PageHeader>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-6 px-4 py-5 sm:py-8">
        <p className="text-sm text-foreground-dim">
          Illustrated sets pulled from publicly documented college film breakdowns. Each card says exactly
          where it came from — a named, move-by-move source is marked as such; where that level of detail
          was not publicly available for a program, the entry says so plainly rather than guessing.
        </p>

        {TEAMS.map((teamName) => {
          const plays = LIBRARY_PLAYS.filter((p) => p.team === teamName);
          if (plays.length === 0) return null;
          return (
            <section key={teamName}>
              <Eyebrow>{TEAM_LABEL[teamName]}</Eyebrow>
              <div className="mt-2 space-y-3">
                {plays.map((p) => (
                  <Card key={p.id} className="overflow-hidden p-0">
                    <div className="relative h-28 w-full">
                      <PlayThumbnail frames={p.frames} />
                      {p.videoUrl && (
                        <a
                          href={p.videoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white backdrop-blur hover:bg-black/70"
                        >
                          <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="currentColor" aria-hidden><path d="M6 4 20 12 6 20Z" /></svg>
                          Film
                        </a>
                      )}
                    </div>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-[15px] font-bold text-foreground">{p.name}</h3>
                        <span className="shrink-0 rounded-full border border-line-strong px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute">
                          {PLAY_CATEGORY_LABEL[p.category]}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-foreground-mute">{p.source}</p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <ButtonLink href={`/teams/${teamId}/plays?lib=${p.id}`} size="sm" variant="secondary">
                          Open in designer
                        </ButtonLink>
                        <span className="shrink-0 text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">
                          {p.frames.length} beats
                        </span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
