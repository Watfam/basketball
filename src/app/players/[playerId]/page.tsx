import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { type Workout } from "@/components/workout-card";
import { PlayerHero } from "@/components/player-hero";
import { AttributePanel } from "@/components/attribute-panel";
import { TrainingLoadPanel } from "@/components/training-load-panel";
import { FeaturedWorkout } from "@/components/featured-workout";
import { WorkoutRail } from "@/components/workout-rail";
import { MilestoneRail, buildMilestones } from "@/components/milestone-rail";
import { LevelPicker } from "@/components/level-picker";
import { EmptyState } from "@/components/empty-state";
import { ProgramPanel } from "@/components/program-panel";
import { CombinePrompt } from "@/components/combine-prompt";
import { ProgramOffer, type OfferedProgram } from "@/components/program-offer";
import {
  computeProgramProgress,
  rankPrograms,
  explainProgram,
  type ProgramDay,
  type ProgramProgress,
} from "@/lib/basketball/program";
import {
  rankWorkouts,
  explainMatch,
  lastCompletedLabel,
  type PlayerType,
} from "@/lib/basketball/workout-matching";
import { randomQuote } from "@/lib/basketball/quotes";
import { rankFilm } from "@/lib/basketball/film";
import {
  computeStreakWeeks,
  weeklyVolume,
  dailyActivity,
  lastAssessedLabel,
  isAssessmentStale,
  daysSinceAssessment,
} from "@/lib/basketball/progress";
import { computeOverall, type Ratings } from "@/lib/basketball/rating";
import {
  suggestSkillLevel,
  WEAKNESS_THRESHOLD,
  type ComputedPlayerType,
  type SkillLevel,
} from "@/lib/basketball/assessment";

const EMPTY_RATINGS: Ratings = { ball_handling: 0, shooting: 0, defense: 0, athleticism: 0 };

// A realistic cadence for a school-age player training around practices and
// games — not a daily-grind target that a normal week can't hit.
const WEEKLY_TARGET = 3;

export default async function PlayerHubPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // RLS scopes this to players in the current user's household — see
  // players_household_owner_all in supabase/schema.sql.
  const { data: player } = await supabase
    .schema("hoops")
    .from("players")
    .select("id, display_name, player_type")
    .eq("id", playerId)
    .maybeSingle();

  if (!player) notFound();

  const playerType = (player.player_type ?? {}) as ComputedPlayerType &
    PlayerType & { preferred_level?: SkillLevel };
  if (!playerType.archetype) redirect(`/players/${playerId}/assessment`);

  const ratings = (playerType.ratings ?? EMPTY_RATINGS) as Ratings;
  const suggestedLevel = suggestSkillLevel(ratings);
  const currentLevel = playerType.preferred_level ?? suggestedLevel;
  const overall = computeOverall(ratings);

  const { data: workouts } = await supabase
    .schema("hoops")
    .from("workouts")
    .select(
      "id, name, description, focus_areas, estimated_minutes, player_type_tags, workout_drills(id, drill_id, sort_order, block, variant_label, levels, level_targets, target_sets, target_reps, target_duration_seconds, drills(id, name, description, video_url, source_trainer, difficulty))"
    );

  // The two most recent assessments: the previous one turns the attribute
  // radar into a before/after instead of a static snapshot. Most players
  // will only ever have one, which the panel handles as "Baseline."
  const { data: assessments } = await supabase
    .schema("hoops")
    .from("assessments")
    .select("kind, computed_player_type, completed_at")
    .eq("player_id", playerId)
    .order("completed_at", { ascending: false })
    .limit(2);

  // The combine is the measured assessment, and it is the one that makes
  // every rating in the app mean something. It stays outstanding until it
  // has actually been done — snoozing pushes it out, it never dismisses.
  const { data: lastCombine } = await supabase
    .schema("hoops")
    .from("assessments")
    .select("completed_at")
    .eq("player_id", playerId)
    .eq("kind", "combine")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const snoozedAt = (playerType as { combine_snoozed_at?: string }).combine_snoozed_at ?? null;
  const snoozeDays = daysSinceAssessment(snoozedAt);
  const combineDue =
    !lastCombine || isAssessmentStale(lastCombine.completed_at as string | null);
  const showCombinePrompt = combineDue && (snoozeDays === null || snoozeDays >= 7);

  const previousRatings =
    (assessments?.[1]?.computed_player_type as ComputedPlayerType | undefined)?.ratings ?? null;

  const assessedLabel = lastAssessedLabel(assessments?.[0]?.completed_at);
  const assessmentStale = isAssessmentStale(assessments?.[0]?.completed_at);

  // Every unfinished session, not just the newest. Showing only the most
  // recent one silently stranded older ones: a player who starts A, drifts
  // off, then starts B had no way back to A except the history page.
  const { data: inProgressSessions } = await supabase
    .schema("hoops")
    .from("workout_sessions")
    .select("id, workout_id, started_at, workouts(name)")
    .eq("player_id", playerId)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false });

  const unfinished = inProgressSessions ?? [];
  const unfinishedWorkoutIds = new Set(
    unfinished.map((s) => s.workout_id).filter((id): id is string => Boolean(id))
  );

  const { data: recentSessions } = await supabase
    .schema("hoops")
    .from("workout_sessions")
    .select("id, completed_at, workouts(name)")
    .eq("player_id", playerId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(4);

  // Every completed session, most recent first — drives the progress stats,
  // both charts, and the ranking's "sink this down, you just did it" signal,
  // instead of several near-identical queries.
  const { data: completedRows } = await supabase
    .schema("hoops")
    .from("workout_sessions")
    .select("id, workout_id, completed_at")
    .eq("player_id", playerId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false });

  // A session only counts once actual work was logged against it. Without
  // this a session finished with nothing done would feed the streak, the
  // totals, the milestones and both charts — the app no longer creates
  // those, but this keeps the numbers honest for any that already exist.
  const completedIds = (completedRows ?? []).map((s) => s.id);
  const { data: logRows } = completedIds.length
    ? await supabase
        .schema("hoops")
        .from("session_logs")
        .select("session_id")
        .in("session_id", completedIds)
    : { data: [] as { session_id: string }[] };

  const sessionsWithWork = new Set((logRows ?? []).map((l) => l.session_id));
  const allCompletedSessions = (completedRows ?? []).filter((s) => sessionsWithWork.has(s.id));

  const completedDates = (allCompletedSessions ?? [])
    .map((s) => (s.completed_at ? new Date(s.completed_at) : null))
    .filter((d): d is Date => d !== null);
  const totalCompleted = completedDates.length;
  const streakWeeks = computeStreakWeeks(completedDates);
  const volumeWeeks = weeklyVolume(completedDates, 8);
  const activityDays = dailyActivity(completedDates, 14);
  const thisWeekCount = volumeWeeks[volumeWeeks.length - 1]?.count ?? 0;

  const lastCompletedByWorkoutId: Record<string, string> = {};
  (allCompletedSessions ?? []).forEach((s) => {
    if (s.workout_id && s.completed_at && !lastCompletedByWorkoutId[s.workout_id]) {
      lastCompletedByWorkoutId[s.workout_id] = s.completed_at;
    }
  });

  // A workout you've already started doesn't belong in "Up Next" — it's
  // not a suggestion any more, and offering "Start session" for something
  // already underway would create a second session or silently resume.
  // It isn't hidden: it's promoted to the Continue banner above.
  const ranked = rankWorkouts(playerType, (workouts ?? []) as unknown as Workout[], {
    playerLevel: currentLevel,
    lastCompletedByWorkoutId,
  }).filter((w) => !unfinishedWorkoutIds.has(w.id));

  const [featured, ...alternates] = ranked;
  const reasons: Record<string, string> = {};
  ranked.forEach((w) => {
    reasons[w.id] = explainMatch(playerType, w, {
      playerLevel: currentLevel,
      lastCompletedIso: lastCompletedByWorkoutId[w.id],
    });
  });

  // --- Program ---------------------------------------------------------
  // A player on a program has their next session decided by the schedule
  // rather than by ranking, so the program panel takes over the primary
  // action and "Up Next" drops to a secondary "extra work" rail.
  const { data: enrollment } = await supabase
    .schema("hoops")
    .from("player_programs")
    .select("id, program_id, programs(id, name, description, week_count, days_per_week)")
    .eq("player_id", playerId)
    .eq("status", "active")
    .maybeSingle();

  const activeProgram = enrollment?.programs as unknown as
    | { id: string; name: string; week_count: number; days_per_week: number }
    | null
    | undefined;

  let programProgress: ProgramProgress | null = null;
  let nextWorkoutName: string | null = null;

  if (activeProgram) {
    const { data: days } = await supabase
      .schema("hoops")
      .from("program_days")
      .select("id, week_number, day_number, workout_id, volume_step, is_deload, note")
      .eq("program_id", activeProgram.id)
      .order("week_number", { ascending: true })
      .order("day_number", { ascending: true });

    // Only days whose session actually recorded work count as done, for
    // the same reason the stats above filter on logged work.
    const { data: programSessions } = await supabase
      .schema("hoops")
      .from("workout_sessions")
      .select("program_day_id")
      .eq("player_id", playerId)
      .eq("status", "completed")
      .not("program_day_id", "is", null)
      .in("id", completedIds.length ? completedIds : ["00000000-0000-0000-0000-000000000000"]);

    const completedDayIds = (programSessions ?? [])
      .map((s) => s.program_day_id)
      .filter((id): id is string => Boolean(id));

    programProgress = computeProgramProgress((days ?? []) as ProgramDay[], completedDayIds);

    if (programProgress.nextDay) {
      nextWorkoutName =
        (workouts ?? []).find((w) => w.id === programProgress?.nextDay?.workout_id)?.name ?? null;
    }
  }

  // Only offered when the player isn't already on one — committing to a
  // block is a real decision, not something to nag about mid-program.
  const { data: offeredPrograms } = activeProgram
    ? { data: null }
    : await supabase
        .schema("hoops")
        .from("programs")
        .select(
          "id, name, description, focus_areas, player_type_tags, level, week_count, days_per_week"
        );

  // Ordered toward the player's genuine weak spots, same principle as the
  // workout feed — nothing is hidden, it's just not arbitrary.
  const rankedPrograms = offeredPrograms
    ? rankPrograms(playerType, currentLevel, offeredPrograms, WEAKNESS_THRESHOLD)
    : [];
  const programReasons: Record<string, string> = {};
  rankedPrograms.forEach((p) => {
    programReasons[p.id] = explainProgram(playerType, p, WEAKNESS_THRESHOLD);
  });

  // --- Film ------------------------------------------------------------
  // Just enough to show what's next on the hub; the Film Room itself does
  // the full ranking.
  const { data: filmRows } = await supabase
    .schema("hoops")
    .from("film_resources")
    .select("id, title, kind, skill_tags, position_tags, sort_order");

  const { data: filmViewRows } = await supabase
    .schema("hoops")
    .from("film_views")
    .select("film_resource_id")
    .eq("player_id", playerId);

  const filmWatchedIds = new Set((filmViewRows ?? []).map((v) => v.film_resource_id));
  const filmStudiedCount = filmWatchedIds.size;
  // Both the title and the id: naming a lesson on the card and then
  // dropping the player into the whole library to go find it is exactly
  // the bait-and-switch this card was guilty of.
  const filmUpNext =
    rankFilm(
      playerType,
      (filmRows ?? []) as Parameters<typeof rankFilm>[1],
      filmWatchedIds,
      WEAKNESS_THRESHOLD
    )[0] ?? null;
  const filmUpNextTitle = filmUpNext?.title ?? null;
  const filmUpNextId = filmUpNext?.id ?? null;

  const milestones = buildMilestones(totalCompleted, streakWeeks);
  const quote = randomQuote();

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-background/85 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between">
          <Link
            href="/"
            className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim transition-colors hover:text-foreground"
          >
            ← Players
          </Link>
          <Link
            href={`/players/${playerId}/sessions`}
            className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim transition-colors hover:text-foreground"
          >
            History
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-4 px-4 py-5 sm:py-8">
        {unfinished.length > 0 && (
          <section>
            <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-accent">
              {unfinished.length === 1
                ? "Unfinished session"
                : `${unfinished.length} unfinished sessions`}
            </p>
            <div className="space-y-2">
              {unfinished.map((session) => {
                const startedLabel = session.started_at
                  ? new Date(session.started_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })
                  : "";
                return (
                  <Link
                    key={session.id}
                    href={`/players/${playerId}/sessions/${session.id}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-accent bg-accent/10 px-5 py-3.5 transition-colors hover:bg-accent/20"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-foreground">
                        {(session.workouts as unknown as { name: string } | null)?.name ?? "Workout"}
                      </p>
                      {startedLabel && (
                        <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wider text-foreground-mute">
                          Started {startedLabel}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 whitespace-nowrap text-xs font-extrabold uppercase tracking-wide text-accent">
                      Resume →
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <div className="animate-rise">
          <PlayerHero
            playerName={player.display_name}
            archetype={playerType.archetype}
            primaryPosition={playerType.primary_position ?? ""}
            level={currentLevel}
            overall={overall}
            streakWeeks={streakWeeks}
            totalSessions={totalCompleted}
          />
        </div>

        {showCombinePrompt && (
          <CombinePrompt
            playerId={playerId}
            hasEverDone={Boolean(lastCombine)}
          />
        )}

        {/* Directly under the hero rather than buried at the bottom of the
            page. A quote nobody scrolls to isn't doing anything. */}
        <blockquote className="animate-rise relative overflow-hidden rounded-2xl border-l-[3px] border-accent bg-[var(--raised)] py-4 pl-5 pr-5">
          <span
            className="font-display pointer-events-none absolute -right-2 -top-6 select-none text-[7rem] leading-none text-accent opacity-[0.07]"
            aria-hidden
          >
            &ldquo;
          </span>
          <p className="relative text-[0.95rem] font-semibold leading-snug text-foreground">
            {quote.text}
          </p>
          <p className="relative mt-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-accent">
            {quote.author}
          </p>
        </blockquote>

        {activeProgram && programProgress && (
          <section className="animate-rise" style={{ animationDelay: "40ms" }}>
            <ProgramPanel
              playerId={playerId}
              programId={activeProgram.id}
              programName={activeProgram.name}
              weekCount={activeProgram.week_count}
              daysPerWeek={activeProgram.days_per_week}
              progress={programProgress}
              nextWorkoutName={nextWorkoutName}
            />
          </section>
        )}

        {!activeProgram && rankedPrograms.length > 0 && (
          <section className="animate-rise" style={{ animationDelay: "40ms" }}>
            <SectionHeading title="Programs" caption="Commit to a block" />
            <ProgramOffer
              playerId={playerId}
              programs={rankedPrograms as OfferedProgram[]}
              reasons={programReasons}
            />
          </section>
        )}

        <section className="animate-rise" style={{ animationDelay: "60ms" }}>
          <SectionHeading
            title={activeProgram ? "Extra Work" : "Up Next"}
            caption={activeProgram ? "On top of the program" : "Picked for you today"}
          />
          {featured ? (
            <div className="space-y-3">
              <FeaturedWorkout
                workout={featured}
                playerId={playerId}
                reason={reasons[featured.id]}
                lastCompleted={lastCompletedLabel(lastCompletedByWorkoutId[featured.id])}
              />
              {alternates.length > 0 && (
                <WorkoutRail
                  workouts={alternates.slice(0, 6)}
                  playerId={playerId}
                  reasons={reasons}
                />
              )}
            </div>
          ) : (
            <EmptyState
              eyebrow="No workouts yet"
              title="No curated content yet"
              subtitle="The workout library hasn't been seeded for this project yet — see supabase/seed_content.sql."
            />
          )}
        </section>

        <section className="animate-rise" style={{ animationDelay: "120ms" }}>
          <SectionHeading title="Your Game" caption={assessedLabel} />
          <AttributePanel ratings={ratings} previousRatings={previousRatings as Ratings | null} />
          {/* Escalates past four weeks instead of staying a passive label.
              Every recommendation in the app keys off these ratings, so
              letting them quietly go stale costs the player accuracy
              everywhere without ever telling them. */}
          {assessmentStale ? (
            <Link
              href={`/players/${playerId}/assessment`}
              className="mt-2.5 flex items-center justify-between gap-3 rounded-xl border border-accent bg-accent/10 px-4 py-3 transition-colors hover:bg-accent/20"
            >
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-accent">
                  Time to re-rate
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-foreground-dim">
                  {assessedLabel}. Your card drives every workout and film pick — move it and
                  everything else follows.
                </p>
              </div>
              <span className="shrink-0 text-xs font-extrabold uppercase tracking-wide text-accent">
                Go →
              </span>
            </Link>
          ) : (
            <div className="mt-2.5 flex items-center gap-4">
              <Link
                href={`/players/${playerId}/assessment`}
                className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-accent transition-colors hover:text-accent-hover"
              >
                Rate yourself again →
              </Link>
              <Link
                href={`/players/${playerId}/assessments`}
                className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-foreground-dim transition-colors hover:text-foreground"
              >
                History
              </Link>
            </div>
          )}
        </section>

        <section className="animate-rise" style={{ animationDelay: "160ms" }}>
          <SectionHeading title="The Work" caption="Last 8 weeks" />
          <TrainingLoadPanel
            weeks={volumeWeeks}
            days={activityDays}
            thisWeekCount={thisWeekCount}
            weeklyTarget={WEEKLY_TARGET}
          />
        </section>

        <section className="animate-rise" style={{ animationDelay: "180ms" }}>
          <SectionHeading title="Film Room" caption={`${filmStudiedCount} studied`} />
          <Link
            href={
              filmUpNextId
                ? `/players/${playerId}/film?lesson=${filmUpNextId}`
                : `/players/${playerId}/film`
            }
            className="panel-lit block overflow-hidden rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-[var(--line-strong)]"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-xl uppercase leading-none tracking-tight text-foreground">
                  {filmUpNextTitle ?? "Study the game"}
                </p>
                <p className="mt-1.5 text-xs text-foreground-dim">
                  {filmUpNextTitle
                    ? "Next lesson, picked for your weak spots"
                    : "Lessons that tell you what to look for"}
                </p>
              </div>
              <span className="shrink-0 text-xs font-extrabold uppercase tracking-wide text-accent">
                Open →
              </span>
            </div>
          </Link>
        </section>

        <section className="animate-rise" style={{ animationDelay: "200ms" }}>
          <SectionHeading title="Milestones" caption={`${milestones.filter((m) => m.current >= m.target).length} of ${milestones.length} unlocked`} />
          <MilestoneRail milestones={milestones} />
        </section>

        <section className="animate-rise" style={{ animationDelay: "240ms" }}>
          <SectionHeading title="Training Level" caption="Sets how hard your sessions run" />
          <div className="rounded-2xl border border-line bg-surface p-4">
            <LevelPicker
              playerId={playerId}
              currentLevel={currentLevel}
              isSuggested={!playerType.preferred_level}
            />
          </div>
        </section>

        {recentSessions && recentSessions.length > 0 && (
          <section className="animate-rise" style={{ animationDelay: "280ms" }}>
            <SectionHeading title="Recent Sessions" />
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              {recentSessions.map((session, i) => {
                const workoutName =
                  (session.workouts as unknown as { name: string } | null)?.name ?? "Workout";
                const completedDate = session.completed_at
                  ? new Date(session.completed_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })
                  : "";
                return (
                  <div
                    key={session.id}
                    className={`flex items-center justify-between px-4 py-3 ${
                      i > 0 ? "border-t border-line" : ""
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                      <p className="truncate text-sm font-semibold text-foreground">{workoutName}</p>
                    </div>
                    <p className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-foreground-mute">
                      {completedDate}
                    </p>
                  </div>
                );
              })}
            </div>
            <Link
              href={`/players/${playerId}/sessions`}
              className="mt-2.5 inline-block text-[11px] font-extrabold uppercase tracking-[0.12em] text-accent transition-colors hover:text-accent-hover"
            >
              Full history →
            </Link>
          </section>
        )}

      </main>
    </div>
  );
}

function SectionHeading({ title, caption }: { title: string; caption?: string }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-3">
      <h2 className="font-display text-xl uppercase leading-none tracking-wide text-foreground">
        {title}
      </h2>
      {caption && (
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-foreground-mute">
          {caption}
        </span>
      )}
    </div>
  );
}
