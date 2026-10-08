import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { type Workout } from "@/components/workout-card";
import { FeaturedWorkout } from "@/components/featured-workout";
import { ProgramPanel } from "@/components/program-panel";
import { CombinePrompt } from "@/components/combine-prompt";
import { PlayerTabHeader } from "@/components/player-tab-header";
import { EmptyState } from "@/components/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardLink } from "@/components/ui/card";
import { formatPercentage, seasonStart, totalSessions } from "@/lib/basketball/shooting";
import { computeProgramProgress, type ProgramDay, type ProgramProgress } from "@/lib/basketball/program";
import { rankWorkouts, explainMatch, lastCompletedLabel, type PlayerType } from "@/lib/basketball/workout-matching";
import { rankFilm } from "@/lib/basketball/film";
import { computeStreakWeeks, daysSinceAssessment, isAssessmentStale } from "@/lib/basketball/progress";
import { loadActivity } from "@/lib/basketball/activity-server";
import { WEEKLY_DAYS_TARGET, thisWeek, type WeekSummary } from "@/lib/basketball/activity";
import { pickNextUp } from "@/lib/basketball/next-up";
import { playerLevel, WEAKNESS_THRESHOLD, type ComputedPlayerType } from "@/lib/basketball/assessment";

/**
 * Today: what to do now, and how the week is going. One card says what's
 * next (src/lib/basketball/next-up.ts); under it, one tap to shoot or to
 * the next film lesson. Everything else lives in Train and Me.
 */
export default async function TodayPage({
  params,
  searchParams,
}: {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { playerId } = await params;
  // Old links to the Me tab inside this page.
  if ((await searchParams).tab === "profile") redirect(`/players/${playerId}/me`);

  const supabase = await createClient();
  const hoops = supabase.schema("hoops");

  const [
    { data: { user } },
    { data: player },
    { data: workouts },
    { data: lastCombine },
    { data: inProgress },
    { data: enrollment },
    { data: filmRows },
    { data: filmViewRows },
    { data: seasonShotRows },
    activity,
  ] = await Promise.all([
    supabase.auth.getUser(),
    hoops.from("players").select("id, display_name, player_type").eq("id", playerId).maybeSingle(),
    hoops
      .from("workouts")
      .select(
        "id, name, description, focus_areas, estimated_minutes, player_type_tags, workout_drills(id, drill_id, sort_order, block, variant_label, levels, level_targets, target_sets, target_reps, target_duration_seconds, drills(id, name, description, video_url, source_trainer, difficulty))"
      ),
    hoops
      .from("assessments")
      .select("completed_at")
      .eq("player_id", playerId)
      .eq("kind", "combine")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Every unfinished workout, newest first: the newest is Next up, the
    // rest are listed under it so none is stranded.
    hoops
      .from("workout_sessions")
      .select("id, workout_id, started_at, workouts(name)")
      .eq("player_id", playerId)
      .eq("status", "in_progress")
      .order("started_at", { ascending: false }),
    hoops
      .from("player_programs")
      .select("id, program_id, programs(id, name, week_count, days_per_week)")
      .eq("player_id", playerId)
      .eq("status", "active")
      .maybeSingle(),
    hoops.from("film_resources").select("id, title, kind, skill_tags, position_tags, sort_order"),
    hoops.from("film_views").select("film_resource_id").eq("player_id", playerId),
    hoops
      .from("shot_sessions")
      .select("label, started_at, makes, attempts")
      .eq("player_id", playerId)
      .not("ended_at", "is", null)
      .is("deleted_at", null)
      .gte("started_at", seasonStart().toISOString())
      .limit(1000),
    loadActivity(supabase, playerId),
  ]);

  if (!user) redirect("/login");
  if (!player) notFound();

  const playerType = (player.player_type ?? {}) as ComputedPlayerType & PlayerType & { combine_snoozed_at?: string };
  if (!playerType.archetype) redirect(`/players/${playerId}/assessment`);
  const level = playerLevel(player.player_type);

  // --- The program, if on one ------------------------------------------
  const activeProgram = enrollment?.programs as unknown as
    | { id: string; name: string; week_count: number; days_per_week: number }
    | null
    | undefined;
  let programProgress: ProgramProgress | null = null;
  let programWorkoutName: string | null = null;
  if (activeProgram) {
    const completedIds = activity.completedWorkouts.map((w) => w.id);
    const [{ data: days }, { data: doneDays }] = await Promise.all([
      hoops
        .from("program_days")
        .select("id, week_number, day_number, workout_id, volume_step, is_deload, note")
        .eq("program_id", activeProgram.id)
        .order("week_number", { ascending: true })
        .order("day_number", { ascending: true }),
      completedIds.length
        ? hoops.from("workout_sessions").select("program_day_id").in("id", completedIds).not("program_day_id", "is", null)
        : Promise.resolve({ data: [] as { program_day_id: string }[] }),
    ]);
    programProgress = computeProgramProgress(
      (days ?? []) as ProgramDay[],
      (doneDays ?? []).map((d: { program_day_id: string }) => d.program_day_id)
    );
    programWorkoutName = (workouts ?? []).find((w) => w.id === programProgress?.nextDay?.workout_id)?.name ?? null;
  }

  // --- The workout picked for today ------------------------------------
  const lastDone: Record<string, string> = {};
  for (const w of activity.completedWorkouts) {
    if (w.workout_id && w.completed_at && !lastDone[w.workout_id]) lastDone[w.workout_id] = w.completed_at;
  }
  const unfinished = (inProgress ?? []).map((s) => ({
    id: s.id,
    workoutId: s.workout_id as string | null,
    name: (s.workouts as unknown as { name: string } | null)?.name ?? "Workout",
    startedAt: s.started_at as string | null,
  }));
  const unfinishedWorkoutIds = new Set(unfinished.map((s) => s.workoutId));
  const featured =
    rankWorkouts(playerType, (workouts ?? []) as unknown as Workout[], { playerLevel: level, lastCompletedByWorkoutId: lastDone }).find(
      (w) => !unfinishedWorkoutIds.has(w.id)
    ) ?? null;

  // --- The combine -------------------------------------------------------
  const snoozeDays = daysSinceAssessment(playerType.combine_snoozed_at ?? null);
  const combine = {
    due: !lastCombine || isAssessmentStale(lastCombine.completed_at as string | null),
    snoozed: snoozeDays !== null && snoozeDays < 7,
    everDone: Boolean(lastCombine),
  };

  const next = pickNextUp({
    unfinished,
    combine,
    // On a program, its card is Next up even when the block is finished:
    // that card is where the player closes it out and retests.
    programDayReady: Boolean(activeProgram && programProgress),
    hasWorkout: Boolean(featured),
  });

  // --- Quick starts ------------------------------------------------------
  const season = totalSessions(seasonShotRows ?? []);
  const watched = new Set((filmViewRows ?? []).map((v) => v.film_resource_id));
  const nextFilm = rankFilm(playerType, (filmRows ?? []) as Parameters<typeof rankFilm>[1], watched, WEAKNESS_THRESHOLD)[0] ?? null;

  const week = thisWeek(activity.activities);
  const streakWeeks = computeStreakWeeks(activity.activities.map((a) => a.at));

  return (
    <div className="flex flex-1 flex-col">
      <PlayerTabHeader playerId={playerId} name={player.display_name} />

      <main className="mx-auto w-full max-w-lg flex-1 space-y-4 px-4 py-5 sm:py-8">
        <WeekStrip week={week} streakWeeks={streakWeeks} />

        <section aria-label="Next up" className="animate-rise space-y-2">
          {next.kind === "resume" && (
            <NextCard
              eyebrow="Pick up where you left off"
              title={next.name}
              body={unfinished[0]?.startedAt ? `Started ${shortDate(unfinished[0].startedAt)}. Your logged drills are saved.` : undefined}
              action={{ href: `/players/${playerId}/sessions/${next.sessionId}`, label: "Resume" }}
            />
          )}
          {next.kind === "combine" && <CombinePrompt playerId={playerId} hasEverDone={next.everDone} />}
          {next.kind === "program" && activeProgram && programProgress && (
            <ProgramPanel
              playerId={playerId}
              programId={activeProgram.id}
              programName={activeProgram.name}
              weekCount={activeProgram.week_count}
              daysPerWeek={activeProgram.days_per_week}
              progress={programProgress}
              nextWorkoutName={programWorkoutName}
            />
          )}
          {next.kind === "workout" && featured && (
            <FeaturedWorkout
              workout={featured}
              playerId={playerId}
              reason={explainMatch(playerType, featured, { playerLevel: level, lastCompletedIso: lastDone[featured.id] })}
              lastCompleted={lastCompletedLabel(lastDone[featured.id])}
            />
          )}
          {next.kind === "shoot" && (
            <NextCard
              eyebrow="Next up"
              title="Get some shots up"
              body="Pick a spot, count your makes, and watch your season number move."
              action={{ href: `/players/${playerId}/shooting`, label: "Shoot" }}
            />
          )}

          {unfinished.length > (next.kind === "resume" ? 1 : 0) && (
            <Card className="divide-y divide-line overflow-hidden">
              {unfinished.slice(next.kind === "resume" ? 1 : 0).map((s) => (
                <Link
                  key={s.id}
                  href={`/players/${playerId}/sessions/${s.id}`}
                  className="flex min-h-12 items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-raised"
                >
                  <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                    Unfinished: {s.name}
                  </span>
                  <span className="shrink-0 text-[11px] font-extrabold uppercase tracking-wide text-accent">Resume →</span>
                </Link>
              ))}
            </Card>
          )}
        </section>

        <section aria-label="Quick start" className="grid grid-cols-2 gap-3">
          {next.kind === "shoot" ? (
            <QuickTile
              href={`/players/${playerId}/workouts`}
              eyebrow="Train"
              value="Workouts"
              sub={featured ? featured.name : "The library"}
            />
          ) : (
            <QuickTile
              href={`/players/${playerId}/shooting`}
              eyebrow="Shoot"
              value={season.attempts > 0 ? formatPercentage(season.pct) : "Shoot"}
              sub={season.attempts > 0 ? `Season · ${season.makes} of ${season.attempts}` : "Count makes and misses"}
            />
          )}
          <QuickTile
            href={nextFilm ? `/players/${playerId}/film?lesson=${nextFilm.id}` : `/players/${playerId}/film`}
            eyebrow="Film"
            value={nextFilm ? "Next lesson" : "Film room"}
            sub={nextFilm?.title ?? "Study the game"}
          />
        </section>

        {!featured && next.kind !== "program" && (workouts ?? []).length === 0 && (
          <EmptyState
            eyebrow="No workouts yet"
            title="Workouts aren't loaded"
            subtitle="The workouts aren't loaded yet. Ask your coach to set them up."
          />
        )}
      </main>
    </div>
  );
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

/** This week at a glance: which days had work, against a 3-day target. */
function WeekStrip({ week, streakWeeks }: { week: WeekSummary; streakWeeks: number }) {
  const hit = week.activeDays >= WEEKLY_DAYS_TARGET;
  return (
    <Card className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">This week</p>
        <p className="mt-1 font-display text-2xl leading-none text-foreground">
          {week.activeDays}
          <span className="text-foreground-mute">/{WEEKLY_DAYS_TARGET} days</span>
        </p>
        <p className={`mt-1 text-xs font-semibold ${hit ? "text-[var(--data-positive)]" : "text-foreground-dim"}`}>
          {hit ? "Target hit" : streakWeeks > 0 ? `${streakWeeks}-week streak` : "Start a streak"}
        </p>
      </div>
      <ol className="flex shrink-0 gap-1.5" aria-label={`${week.activeDays} active days this week`}>
        {week.days.map((active, i) => (
          <li key={i} className="flex flex-col items-center gap-1">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-extrabold ${
                active
                  ? "bg-accent text-on-accent"
                  : i === week.today
                    ? "border-2 border-accent text-accent"
                    : "bg-raised text-foreground-mute"
              }`}
              aria-label={`${DAY_LETTERS[i]}${active ? ", trained" : ""}${i === week.today ? ", today" : ""}`}
            >
              {DAY_LETTERS[i]}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** A dark next-up card for the cases without a component of their own. */
function NextCard({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  action: { href: string; label: string };
}) {
  return (
    <section className="theme-dark hero-sheen panel-lit relative overflow-hidden rounded-3xl border border-line shadow-[var(--shadow-panel)]">
      <div className="court-lines absolute inset-0 opacity-60" aria-hidden />
      <div className="relative p-5">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-accent">{eyebrow}</p>
        <h2 className="mt-1.5 font-display text-3xl uppercase leading-[0.95] tracking-tight text-foreground">{title}</h2>
        {body && <p className="mt-2 text-sm leading-relaxed text-foreground-dim">{body}</p>}
        <ButtonLink href={action.href} size="lg" block className="mt-4">
          {action.label}
        </ButtonLink>
      </div>
    </section>
  );
}

function QuickTile({ href, eyebrow, value, sub }: { href: string; eyebrow: string; value: string; sub: string }) {
  return (
    <CardLink href={href} className="flex min-h-28 flex-col justify-between p-4">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-accent">{eyebrow}</p>
      <div className="min-w-0">
        <p className="font-display text-3xl uppercase leading-none text-foreground">{value}</p>
        <p className="mt-1 line-clamp-2 text-xs font-semibold text-foreground-dim">{sub}</p>
      </div>
    </CardLink>
  );
}
