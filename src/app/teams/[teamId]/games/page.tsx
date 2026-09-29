import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { AddGameForm } from "@/components/add-game-form";
import { gameResultLabel, isPastGame, sortGamesUpcomingFirst, sortGamesRecentFirst, type Game } from "@/lib/basketball/games";

function dateLabel(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default async function GamesPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const supabase = await createClient();

  const [{ data: { user } }, { data: team }, { data: games }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.schema("hoops").from("teams").select("id, name").eq("id", teamId).maybeSingle(),
    supabase
      .schema("hoops")
      .from("games")
      .select("id, opponent, is_tbd, game_date, game_time, location, tournament_note, team_score, opponent_score, notes")
      .eq("team_id", teamId),
  ]);

  if (!user) redirect("/login");
  if (!team) notFound();

  const all = (games ?? []) as Game[];
  const upcoming = sortGamesUpcomingFirst(all.filter((g) => !isPastGame(g.game_date)));
  const past = sortGamesRecentFirst(all.filter((g) => isPastGame(g.game_date)));

  const row = (g: Game) => {
    const result = gameResultLabel(g);
    return (
      <Link
        key={g.id}
        href={`/teams/${teamId}/games/${g.id}`}
        className="block rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-[var(--line-strong)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-xl uppercase leading-none tracking-tight text-foreground">
              {g.is_tbd ? "TBA" : g.opponent}
            </p>
            <p className="mt-1.5 text-[11px] font-bold uppercase tracking-wide text-foreground-mute">
              {g.location === "home" ? "vs" : g.location === "away" ? "@" : ""} {dateLabel(g.game_date)}
              {g.game_time ? ` · ${g.game_time}` : ""}
            </p>
            {g.tournament_note && (
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-foreground-mute">
                {g.tournament_note}
              </p>
            )}
          </div>
          {result && (
            <span
              className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-extrabold uppercase tracking-wide ${
                result.startsWith("W")
                  ? "bg-[var(--data-positive)]/15 text-[var(--data-positive)]"
                  : result.startsWith("L")
                    ? "bg-red-500/10 text-red-400"
                    : "bg-[var(--raised)] text-foreground-mute"
              }`}
            >
              {result}
            </span>
          )}
        </div>
        {g.notes && (
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-foreground-dim">{g.notes}</p>
        )}
      </Link>
    );
  };

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
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-5 px-4 py-5 sm:py-8">
        <h1 className="font-display text-3xl uppercase leading-none tracking-wide text-foreground">
          Games
        </h1>

        {all.length === 0 ? (
          <EmptyState
            eyebrow="Nothing scheduled"
            title="No games yet"
            subtitle="Add one below, or pull your schedule in from MaxPreps."
          />
        ) : (
          <>
            {upcoming.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-accent">
                  Upcoming
                </h2>
                {upcoming.map(row)}
              </div>
            )}
            {past.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">
                  Past
                </h2>
                {past.map(row)}
              </div>
            )}
          </>
        )}

        <AddGameForm teamId={teamId} />
      </main>
    </div>
  );
}
