import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GameResultForm } from "@/components/game-result-form";

export default async function GameDetailPage({
  params,
}: {
  params: Promise<{ teamId: string; gameId: string }>;
}) {
  const { teamId, gameId } = await params;
  const supabase = await createClient();

  const [{ data: { user } }, { data: game }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .schema("hoops")
      .from("games")
      .select("id, opponent, is_tbd, game_date, game_time, location, tournament_note, team_score, opponent_score, notes")
      .eq("id", gameId)
      .eq("team_id", teamId)
      .maybeSingle(),
  ]);

  if (!user) redirect("/login");
  if (!game) notFound();

  const dateLabel = new Date(game.game_date + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-background/85 px-5 py-3 backdrop-blur">
        <div className="mx-auto w-full max-w-md">
          <Link
            href={`/teams/${teamId}/games`}
            className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim transition-colors hover:text-foreground"
          >
            ← Games
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-5 sm:py-8">
        <div className="mb-5">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent">
            {game.location === "home" ? "Home" : game.location === "away" ? "Away" : "Neutral"} ·{" "}
            {dateLabel}
            {game.game_time ? ` · ${game.game_time}` : ""}
          </p>
          <h1 className="font-display mt-1.5 text-3xl uppercase leading-none tracking-wide text-foreground">
            {game.is_tbd ? "TBA" : game.opponent}
          </h1>
          {game.tournament_note && (
            <p className="mt-1.5 text-xs text-foreground-dim">{game.tournament_note}</p>
          )}
        </div>

        <GameResultForm
          teamId={teamId}
          gameId={game.id}
          initialTeamScore={game.team_score}
          initialOpponentScore={game.opponent_score}
          initialNotes={game.notes}
        />
      </main>
    </div>
  );
}
