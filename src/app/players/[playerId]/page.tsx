import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { type Workout } from "@/components/workout-card";
import { FeaturedWorkout } from "@/components/featured-workout";
import { ProgramPanel } from "@/components/program-panel";
import { CombinePrompt } from "@/components/combine-prompt";
import { PlayerTabHeader } from "@/components/player-tab-header";
import { ResumeShotSet } from "@/components/resume-shot-set";
import { EmptyState } from "@/components/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HomeView } from "@/components/home/home-view";
import { computeProgramProgress, type ProgramDay, type ProgramProgress } from "@/lib/basketball/program";
import { rankWorkouts, explainMatch, lastCompletedLabel, type PlayerType } from "@/lib/basketball/workout-matching";
import { rankFilm } from "@/lib/basketball/film";
import { computeStreakWeeks, daysSinceAssessment, isAssessmentStale } from "@/lib/basketball/progress";
import { loadActivity } from "@/lib/basketball/activity-server";
import { thisWeek } from "@/lib/basketball/activity";
import { pickNextUp } from "@/lib/basketball/next-up";
import { playerLevel, WEAKNESS_THRESHOLD, type ComputedPlayerType } from "@/lib/basketball/assessment";
import { loadProgressRows } from "@/lib/basketball/progress-server";
import { linkedShotSessionIds } from "@/lib/basketball/drill-tracking";
import { nextAction, type LessonLite } from "@/lib/basketball/insights";
import { BENCHMARKS, BENCHMARK_WORKOUT_NAME } from "@/lib/basketball/benchmarks";
import { benchmarkLines } from "@/lib/basketball/benchmark-summary";
import { lessonsForDrill, type Lesson } from "@/lib/basketball/drill-film";
import { greeting, homeRange, improvementAnswer, lookBack, pickFocus, recentItems, shotTotals, shotWindowStart, standings, weeklyShots, type ShotSet } from "@/lib/basketball/home";
import { seasonStart } from "@/lib/basketball/shooting";

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
  searchParams: Promise<{ tab?: string; range?: string }>;
}) {
  const { playerId } = await params;
  const sp = await searchParams;
  // Old links to the Me tab inside this page.
  if (sp.tab === "profile") redirect(`/players/${playerId}/me`);
  const now = new Date();
  const range = homeRange(sp.range, now);

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
    { data: shotRows },
    activity,
    progress,
    { data: benchDrills },
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
    hoops.from("film_resources").select("id, title, kind, skill_tags, position_tags, sort_order, drill_id"),
    hoops.from("film_views").select("film_resource_id").eq("player_id", playerId),
    // Every finished, kept set since the season began (and at least eight weeks back): the three numbers, the weekly bars and the recent list.
    hoops
      .from("shot_sessions")
      .select("id, label, started_at, makes, attempts, source")
      .eq("player_id", playerId)
      .not("ended_at", "is", null)
      .is("deleted_at", null)
      .gt("attempts", 0)
      .gte("started_at", shotWindowStart(now).toISOString())
      .order("started_at", { ascending: false })
      .limit(1000),
    loadActivity(supabase, playerId),
    loadProgressRows(supabase, playerId),
    hoops.from("drills").select("id, name").in("name", BENCHMARKS.map((b) => b.drillName)),
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

  // --- The shooting numbers, the answer, the focus and the recent list ---------------------------------
  const sets: ShotSet[] = (shotRows ?? []) as unknown as ShotSet[];
  const totals = shotTotals(sets, range.from);
  const season = shotTotals(sets, seasonStart(now));
  const watched = new Set((filmViewRows ?? []).map((v) => v.film_resource_id));
  const nextFilm = rankFilm(playerType, (filmRows ?? []) as Parameters<typeof rankFilm>[1], watched, WEAKNESS_THRESHOLD)[0] ?? null;

  // The Film Room lesson for each benchmark drill: the lesson the Film Room itself links to that drill (nothing is made up).
  const lessonRows: Lesson[] = ((filmRows ?? []) as { id: string; title: string; skill_tags: string[] | null; sort_order: number | null; drill_id: string | null }[]).map((r) => ({ id: r.id, title: r.title, url: null, watch_for: null, skill_tags: r.skill_tags, drill_id: r.drill_id, sort_order: r.sort_order }));
  const lessons = new Map<string, LessonLite>();
  for (const d of (benchDrills ?? []) as { id: string; name: string }[]) {
    const found = lessonsForDrill(d, lessonRows);
    if (found) lessons.set(d.name, { title: found.primary.title, watched: watched.has(found.primary.id), url: null, href: `/players/${playerId}/film?lesson=${found.primary.id}` });
  }
  const lessonFor = (drillName: string) => lessons.get(drillName) ?? null;
  const benchmarkWorkout = (workouts ?? []).find((w) => w.name === BENCHMARK_WORKOUT_NAME) ?? null;
  const hasBenchmarkWorkout = Boolean(benchmarkWorkout);
  const stand = standings(progress.rows);
  const focus = pickFocus({
    list: stand,
    next: nextAction({ rows: progress.rows, now, benchmarkWorkoutHref: hasBenchmarkWorkout ? `/players/${playerId}/workouts` : null, lessonFor }),
    nextFilm: nextFilm ? { id: nextFilm.id, title: nextFilm.title } : null,
    playerId,
    lessonFor,
  });
  const recent = recentItems({
    playerId, now, fromHref: `/players/${playerId}?range=${range.key}`,
    workouts: activity.completedWorkouts.slice(0, 8),
    workoutNames: new Map((workouts ?? []).map((w) => [w.id as string, w.name as string])),
    sets,
    linkedSetIds: linkedShotSessionIds(progress.rows),
    tracked: progress.rows,
  });

  const weekSummary = thisWeek(activity.activities, now);
  const streakWeeks = computeStreakWeeks(activity.activities.map((a) => a.at), now);

  const hero = (
    <>
      <ResumeShotSet playerId={playerId} />
      <section aria-label="Next up" className="animate-rise space-y-2">
        {next.kind === "resume" && (
          <NextCard
            eyebrow="Pick up where you left off"
            title={next.name}
            body={unfinished[0]?.startedAt ? `Started ${shortDate(unfinished[0].startedAt)}. Your logged drills are saved.` : undefined}
            action={{ href: `/players/${playerId}/sessions/${next.sessionId}`, label: "Continue Training" }}
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
            body="Pick a spot, count your makes, and watch your numbers move."
            action={{ href: `/players/${playerId}/shooting`, label: "Start Shooting" }}
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
                <span className="min-w-0 truncate text-sm font-semibold text-foreground">Unfinished: {s.name}</span>
                <span className="shrink-0 text-[11px] font-extrabold uppercase tracking-wide text-accent-hover">Continue →</span>
              </Link>
            ))}
          </Card>
        )}
        {!featured && next.kind !== "program" && (workouts ?? []).length === 0 && (
          <EmptyState eyebrow="No workouts yet" title="Workouts aren't loaded" subtitle="The workouts aren't loaded yet. Ask your coach to set them up." />
        )}
      </section>
    </>
  );

  return (
    <div className="flex flex-1 flex-col">
      <PlayerTabHeader playerId={playerId} name={player.display_name} />
      <HomeView
        playerId={playerId}
        welcome={greeting({ name: player.display_name, now, week: weekSummary, streakWeeks, everActive: activity.activities.length > 0 || sets.length > 0 })}
        week={weekSummary}
        hero={hero}
        range={range}
        totals={totals}
        season={season}
        weeks={weeklyShots(sets, now)}
        lookBack={lookBack(sets, now)}
        answer={improvementAnswer(stand)}
        focus={focus}
        recent={recent}
        benchmarks={benchmarkLines(progress.rows)}
        benchmarkWorkoutId={benchmarkWorkout?.id ?? null}
      />
    </div>
  );
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
