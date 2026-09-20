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
import {
  rankWorkouts,
  explainMatch,
  lastCompletedLabel,
  type PlayerType,
} from "@/lib/basketball/workout-matching";
import { randomQuote } from "@/lib/basketball/quotes";
import { computeStreakWeeks, weeklyVolume, dailyActivity } from "@/lib/basketball/progress";
import { computeOverall, type Ratings } from "@/lib/basketball/rating";
import {
  suggestSkillLevel,
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
      "id, name, description, focus_areas, estimated_minutes, player_type_tags, workout_drills(drill_id, sort_order, target_sets, target_reps, target_duration_seconds, drills(id, name, description, video_url, source_trainer, difficulty))"
    );

  // The two most recent assessments: the previous one turns the attribute
  // radar into a before/after instead of a static snapshot. Most players
  // will only ever have one, which the panel handles as "Baseline."
  const { data: assessments } = await supabase
    .schema("hoops")
    .from("assessments")
    .select("computed_player_type, completed_at")
    .eq("player_id", playerId)
    .order("completed_at", { ascending: false })
    .limit(2);

  const previousRatings =
    (assessments?.[1]?.computed_player_type as ComputedPlayerType | undefined)?.ratings ?? null;

  // An abandoned in-progress session — left mid-workout, whether by
  // closing the app or tapping "Finish workout now" isn't how it ends up
  // in_progress (that marks it completed). Surfaced so it's not just lost.
  const { data: inProgressSession } = await supabase
    .schema("hoops")
    .from("workout_sessions")
    .select("id, workouts(name)")
    .eq("player_id", playerId)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

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
  const { data: allCompletedSessions } = await supabase
    .schema("hoops")
    .from("workout_sessions")
    .select("workout_id, completed_at")
    .eq("player_id", playerId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false });

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

  const ranked = rankWorkouts(playerType, (workouts ?? []) as unknown as Workout[], {
    playerLevel: currentLevel,
    lastCompletedByWorkoutId,
  });

  const [featured, ...alternates] = ranked;
  const reasons: Record<string, string> = {};
  ranked.forEach((w) => {
    reasons[w.id] = explainMatch(playerType, w, {
      playerLevel: currentLevel,
      lastCompletedIso: lastCompletedByWorkoutId[w.id],
    });
  });

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
        {inProgressSession && (
          <Link
            href={`/players/${playerId}/sessions/${inProgressSession.id}`}
            className="flex items-center justify-between gap-3 rounded-2xl border border-accent bg-accent/10 px-5 py-3.5 transition-colors hover:bg-accent/20"
          >
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-accent">
                Unfinished session
              </p>
              <p className="mt-0.5 truncate text-sm font-bold text-foreground">
                {(inProgressSession.workouts as unknown as { name: string } | null)?.name ?? "Workout"}
              </p>
            </div>
            <span className="shrink-0 whitespace-nowrap text-xs font-extrabold uppercase tracking-wide text-accent">
              Resume →
            </span>
          </Link>
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

        <section className="animate-rise" style={{ animationDelay: "60ms" }}>
          <SectionHeading title="Up Next" caption="Picked for you today" />
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
          <SectionHeading title="Your Game" caption="From your assessment" />
          <AttributePanel ratings={ratings} previousRatings={previousRatings as Ratings | null} />
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

        <blockquote className="animate-rise rounded-2xl border border-line bg-[var(--raised)] px-5 py-5 text-center">
          <p className="text-sm font-semibold italic leading-relaxed text-foreground">
            &ldquo;{quote.text}&rdquo;
          </p>
          <p className="mt-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-accent">
            {quote.author}
          </p>
        </blockquote>
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
