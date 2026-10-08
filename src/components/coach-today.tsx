import Link from "next/link";
import { RunPracticeLink } from "@/components/run-practice-link";
import type { TodayItem, TodayGame } from "@/lib/basketball/today";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Card, CardLink, Eyebrow } from "@/components/ui/card";

function dayLabel(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function whenText(when: TodayItem["when"], date: string) {
  if (when === "today") return "Today";
  if (when === "tomorrow") return "Tomorrow";
  return dayLabel(date);
}

/** For the lookahead row, where the opponent isn't shown anywhere else. */
function gameLine(game: TodayGame) {
  const prefix = game.location === "home" ? "vs" : game.location === "away" ? "@" : "vs";
  const name = game.is_tbd ? "TBA" : game.opponent;
  return game.game_time && game.game_time !== "TBA"
    ? `${prefix} ${name} · ${game.game_time}`
    : `${prefix} ${name}`;
}

/** For the main card, which already has the opponent as its heading. */
function gameWhereWhen(game: TodayGame) {
  const where =
    game.location === "home" ? "Home" : game.location === "away" ? "Away" : "Neutral site";
  return game.game_time && game.game_time !== "TBA" ? `${where} · ${game.game_time}` : where;
}

/**
 * The first thing a coach sees. One card for the next thing on the
 * calendar, with its primary action already on it — Run for a practice,
 * Log result for a game — so the common case is one tap from opening the
 * app, not three.
 *
 * "Next" spans today and tomorrow on purpose: Matt plans the night
 * before, which makes tomorrow's item as urgent as today's.
 */
export function CoachToday({
  teamId,
  next,
  then,
  needsResult,
}: {
  teamId: string;
  next: TodayItem | null;
  then: TodayItem | null;
  needsResult: TodayGame[];
}) {
  return (
    <section className="space-y-2.5">
      {/* A game that came and went without a score or a note. Post-game
          notes are the whole reason games exist in this app, so an
          unlogged one is worth one quiet nudge. */}
      {needsResult.slice(0, 2).map((game) => (
        <Link
          key={game.id}
          href={`/teams/${teamId}/games/${game.id}`}
          className="flex items-center justify-between gap-3 rounded-2xl border border-accent bg-accent/10 px-4 py-3 transition-colors hover:bg-accent/20"
        >
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-accent">
              Result not logged
            </p>
            <p className="mt-0.5 truncate text-sm font-bold text-foreground">
              {game.is_tbd ? "TBA" : game.opponent} · {dayLabel(game.game_date)}
            </p>
          </div>
          <span className="shrink-0 text-xs font-extrabold uppercase tracking-wide text-accent">
            Log →
          </span>
        </Link>
      ))}

      {next === null ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface/60 px-5 py-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            Nothing scheduled
          </p>
          <h3 className="mt-2 text-base font-bold text-foreground">No practice or game coming up</h3>
          <p className="mt-1 text-sm text-foreground-dim">
            Build the next plan, or add a game to the schedule.
          </p>
          <div className="mt-4 flex justify-center gap-2.5">
            <ButtonLink href={`/teams/${teamId}/practice/new`}>New plan</ButtonLink>
            <ButtonLink href={`/teams/${teamId}/games`} variant="secondary">
              Schedule
            </ButtonLink>
          </div>
        </div>
      ) : (
        <Card className="panel-lit p-5">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent">
            {whenText(next.when, next.date)}
            {next.when !== "upcoming" ? ` · ${next.kind === "game" ? "Game" : "Practice"}` : ""}
          </p>

          {next.kind === "practice" ? (
            <>
              <h3 className="font-display mt-2 text-2xl uppercase leading-none tracking-tight text-foreground">
                {next.plan.title}
              </h3>
              <p className="mt-1.5 text-[11px] font-bold uppercase tracking-wide text-foreground-mute">
                {next.plan.drillCount} {next.plan.drillCount === 1 ? "drill" : "drills"}
                {next.plan.minutes > 0 ? ` · ${next.plan.minutes} min` : ""}
              </p>
              <div className="mt-4 flex gap-2.5">
                <RunPracticeLink
                  href={`/teams/${teamId}/practice/${next.plan.id}/run`}
                  className={buttonClass({ className: "flex-1" })}
                >
                  Run practice
                </RunPracticeLink>
                <ButtonLink href={`/teams/${teamId}/practice/${next.plan.id}`} variant="secondary">
                  Edit
                </ButtonLink>
              </div>
            </>
          ) : (
            <>
              <h3 className="font-display mt-2 text-2xl uppercase leading-none tracking-tight text-foreground">
                {next.game.is_tbd ? "TBA" : next.game.opponent}
              </h3>
              <p className="mt-1.5 text-[11px] font-bold uppercase tracking-wide text-foreground-mute">
                {gameWhereWhen(next.game)}
              </p>
              <div className="mt-4 flex gap-2.5">
                <ButtonLink href={`/teams/${teamId}/games/${next.game.id}`} className="flex-1">
                  Open game
                </ButtonLink>
                <ButtonLink href={`/teams/${teamId}/scouting`} variant="secondary">
                  Scout
                </ButtonLink>
              </div>
            </>
          )}
        </Card>
      )}

      {/* One line of lookahead, so the night-before view answers "and
          then what" without opening the schedule. */}
      {then && (
        <CardLink
          href={
            then.kind === "practice"
              ? `/teams/${teamId}/practice/${then.plan.id}`
              : `/teams/${teamId}/games/${then.game.id}`
          }
          className="px-4 py-3"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Eyebrow>Then · {whenText(then.when, then.date)}</Eyebrow>
              <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
                {then.kind === "practice" ? then.plan.title : gameLine(then.game)}
              </p>
            </div>
            <span className="shrink-0 text-xs font-extrabold text-foreground-mute">›</span>
          </div>
        </CardLink>
      )}
    </section>
  );
}
