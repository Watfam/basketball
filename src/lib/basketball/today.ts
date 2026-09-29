/**
 * What a coach needs the moment they open the app.
 *
 * Matt plans the night before and runs four days a week — practices
 * until games start, then a mix of both. So "today" is really today *and*
 * tomorrow: the night-before planning session is the busiest moment in
 * the week, and it needs tomorrow's item front and centre, not buried
 * behind a tab.
 *
 * Practices and games are deliberately merged into one timeline here.
 * They live in separate tables because they carry different data, but a
 * coach's day doesn't care which table a thing came from.
 */

export type TodayGame = {
  id: string;
  opponent: string;
  is_tbd: boolean;
  game_date: string;
  game_time: string | null;
  location: "home" | "away" | "neutral" | null;
  team_score: number | null;
  opponent_score: number | null;
  notes: string | null;
};

export type TodayPlan = {
  id: string;
  title: string;
  practice_date: string | null;
  drillCount: number;
  minutes: number;
};

export type WhenLabel = "today" | "tomorrow" | "upcoming";

export type TodayItem =
  | { kind: "game"; when: WhenLabel; date: string; game: TodayGame }
  | { kind: "practice"; when: WhenLabel; date: string; plan: TodayPlan };

/** Local-date ISO string — never UTC, or a 7pm game flips a day early. */
export function localIso(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return localIso(date);
}

function whenFor(dateIso: string, todayIso: string): WhenLabel {
  if (dateIso === todayIso) return "today";
  if (dateIso === addDaysIso(todayIso, 1)) return "tomorrow";
  return "upcoming";
}

/**
 * A game counts as needing follow-up once it's in the past and carries
 * neither a score nor notes — the thing Matt actually wants out of this
 * app is the note, so a game with notes but no score is done, not owed.
 */
export function gameNeedsResult(game: TodayGame, todayIso: string): boolean {
  if (game.game_date >= todayIso) return false;
  return game.team_score === null && game.opponent_score === null && !game.notes?.trim();
}

/**
 * Builds the coach's immediate horizon.
 *
 * `next` is the soonest thing from today forward, whichever type it is.
 * `then` is the one after it, so the night-before view shows both
 * "tomorrow" and what follows without opening anything.
 *
 * Plans with no date aren't scheduled — they're reusable templates, and
 * a template shouldn't masquerade as an appointment.
 */
export function buildCoachToday({
  games,
  plans,
  todayIso = localIso(),
}: {
  games: TodayGame[];
  plans: TodayPlan[];
  todayIso?: string;
}): {
  next: TodayItem | null;
  then: TodayItem | null;
  needsResult: TodayGame[];
} {
  const upcoming: TodayItem[] = [];

  games
    .filter((g) => g.game_date >= todayIso)
    .forEach((g) =>
      upcoming.push({ kind: "game", when: whenFor(g.game_date, todayIso), date: g.game_date, game: g })
    );

  plans
    .filter((p): p is TodayPlan & { practice_date: string } => Boolean(p.practice_date))
    .filter((p) => p.practice_date >= todayIso)
    .forEach((p) =>
      upcoming.push({
        kind: "practice",
        when: whenFor(p.practice_date, todayIso),
        date: p.practice_date,
        plan: p,
      })
    );

  // Same day: practice before game. A practice is something you run at a
  // set time; a game on the same date is the evening event.
  upcoming.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.kind === b.kind) return 0;
    return a.kind === "practice" ? -1 : 1;
  });

  const needsResult = games
    .filter((g) => gameNeedsResult(g, todayIso))
    .sort((a, b) => b.game_date.localeCompare(a.game_date));

  return { next: upcoming[0] ?? null, then: upcoming[1] ?? null, needsResult };
}
