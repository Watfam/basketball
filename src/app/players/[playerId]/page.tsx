import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlayerCard } from "@/components/player-card";
import { type Workout } from "@/components/workout-card";
import { WorkoutCarousel } from "@/components/workout-carousel";
import { EmptyState } from "@/components/empty-state";
import { rankWorkouts, type PlayerType } from "@/lib/basketball/workout-matching";
import { randomQuote } from "@/lib/basketball/quotes";
import { computeStreakWeeks } from "@/lib/basketball/progress";
import { suggestSkillLevel, type ComputedPlayerType, type SkillLevel } from "@/lib/basketball/assessment";
import { LevelPicker } from "@/components/level-picker";

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

  const suggestedLevel = suggestSkillLevel(
    playerType.ratings ?? { ball_handling: 0, shooting: 0, defense: 0, athleticism: 0 }
  );
  const currentLevel = playerType.preferred_level ?? suggestedLevel;

  const { data: workouts } = await supabase
    .schema("hoops")
    .from("workouts")
    .select(
      "id, name, description, focus_areas, estimated_minutes, player_type_tags, workout_drills(drill_id, sort_order, target_sets, target_reps, target_duration_seconds, drills(id, name, description, video_url, source_trainer, difficulty))"
    );

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
    .limit(5);

  // Every completed session, most recent first — drives both the progress
  // stats below (total volume + streak) and the ranking's "sink this down,
  // you just did it" signal, instead of two separate near-identical queries.
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

  const quote = randomQuote();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line px-6 py-4">
        <Link href="/" className="text-xs font-semibold uppercase tracking-wide text-foreground-dim hover:text-foreground">
          ← Back
        </Link>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-8 px-4 py-8 sm:py-12">
        {inProgressSession && (
          <Link
            href={`/players/${playerId}/sessions/${inProgressSession.id}`}
            className="flex items-center justify-between gap-3 rounded-2xl border border-accent bg-accent/10 px-5 py-4 transition-colors hover:bg-accent/20"
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">Continue where you left off</p>
              <p className="mt-1 truncate text-sm font-semibold text-foreground">
                {(inProgressSession.workouts as unknown as { name: string } | null)?.name ?? "Workout"}
              </p>
            </div>
            <span className="shrink-0 whitespace-nowrap text-xs font-bold uppercase tracking-wide text-accent">
              Resume →
            </span>
          </Link>
        )}

        <PlayerCard
          playerName={player.display_name}
          archetype={playerType.archetype}
          primaryPosition={playerType.primary_position ?? ""}
          styleTags={playerType.style_tags ?? []}
          ratings={playerType.ratings ?? { ball_handling: 0, shooting: 0, defense: 0, athleticism: 0 }}
        />

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Your Progress</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-line bg-surface px-4 py-4 text-center">
              <p className="text-3xl font-extrabold tabular-nums text-foreground">{totalCompleted}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-foreground-dim">
                {totalCompleted === 1 ? "Workout logged" : "Workouts logged"}
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-surface px-4 py-4 text-center">
              <p className="text-3xl font-extrabold tabular-nums text-foreground">{streakWeeks}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-foreground-dim">
                Week streak
              </p>
            </div>
          </div>
        </section>

        <blockquote className="rounded-2xl border border-line bg-surface px-5 py-4 text-center">
          <p className="text-sm italic text-foreground">&ldquo;{quote.text}&rdquo;</p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-accent">— {quote.author}</p>
        </blockquote>

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Your Level</h2>
          <div className="mt-3">
            <LevelPicker
              playerId={playerId}
              currentLevel={currentLevel}
              isSuggested={!playerType.preferred_level}
            />
          </div>
        </section>

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Up Next</h2>
          <p className="mt-1 text-xs text-foreground-dim">Swipe for more options.</p>
          <div className="mt-3">
            {ranked.length > 0 ? (
              <WorkoutCarousel workouts={ranked} playerId={playerId} />
            ) : (
              <EmptyState
                eyebrow="No workouts yet"
                title="No curated content yet"
                subtitle="The workout library hasn't been seeded for this project yet — see supabase/seed_content.sql."
              />
            )}
          </div>
        </section>

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Recent Sessions</h2>
          <div className="mt-3 space-y-2">
            {recentSessions && recentSessions.length > 0 ? (
              recentSessions.map((session) => {
                const workoutName = (session.workouts as unknown as { name: string } | null)?.name ?? "Workout";
                const completedDate = session.completed_at
                  ? new Date(session.completed_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                  : "";
                return (
                  <div
                    key={session.id}
                    className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3"
                  >
                    <p className="text-sm font-semibold text-foreground">{workoutName}</p>
                    <p className="text-xs text-foreground-dim">{completedDate}</p>
                  </div>
                );
              })
            ) : (
              <EmptyState
                eyebrow="No sessions yet"
                title="Nothing logged yet"
                subtitle="Complete a workout above and it'll show up here."
              />
            )}
          </div>
          <Link
            href={`/players/${playerId}/sessions`}
            className="mt-3 inline-block text-xs font-semibold text-accent hover:text-accent-hover"
          >
            See full history →
          </Link>
        </section>
      </main>
    </div>
  );
}
