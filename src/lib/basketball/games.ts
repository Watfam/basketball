/**
 * A game is a schedule slot plus, once it's been played, a final score
 * and whatever the coach wants to remember about it — team totals only,
 * confirmed explicitly (per-player stats live in MaxPreps and the paper
 * scorebook, not here). is_tbd marks a slot the source schedule itself
 * doesn't have an opponent for yet (a tournament round before brackets
 * are set) — never a guessed name.
 */
export type Game = {
  id: string;
  opponent: string;
  is_tbd: boolean;
  game_date: string;
  game_time: string | null;
  location: "home" | "away" | "neutral" | null;
  tournament_note: string | null;
  team_score: number | null;
  opponent_score: number | null;
  notes: string | null;
};

/** "W 51-50" / "L 35-40" / "T 40-40" — null until both scores are in. */
export function gameResultLabel(game: Pick<Game, "team_score" | "opponent_score">): string | null {
  if (game.team_score == null || game.opponent_score == null) return null;
  const letter =
    game.team_score > game.opponent_score ? "W" : game.team_score < game.opponent_score ? "L" : "T";
  return `${letter} ${game.team_score}-${game.opponent_score}`;
}

/** Local-date comparison, not UTC — a game "today" shouldn't flip to past at 7pm UTC. */
export function isPastGame(gameDateIso: string, today: Date = new Date()): boolean {
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;
  return gameDateIso < todayIso;
}

export function sortGamesUpcomingFirst(games: Game[]): Game[] {
  return [...games].sort((a, b) => a.game_date.localeCompare(b.game_date));
}

export function sortGamesRecentFirst(games: Game[]): Game[] {
  return [...games].sort((a, b) => b.game_date.localeCompare(a.game_date));
}
