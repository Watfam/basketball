import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rankWorkouts, type PlayerType } from "@/lib/basketball/workout-matching";
import { WorkoutCard, type Workout } from "@/components/workout-card";
import { EmptyState } from "@/components/empty-state";
import { suggestSkillLevel, type ComputedPlayerType, type SkillLevel } from "@/lib/basketball/assessment";

export default async function PlayerWorkoutsPage({
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

  // Content library is readable by any signed-in user (see the
  // "Content libraries" RLS policies) — it's seeded via supabase/seed_content.sql,
  // not written through the app.
  const { data: workouts, error: workoutsError } = await supabase
    .schema("hoops")
    .from("workouts")
    .select(
      "id, name, description, focus_areas, estimated_minutes, player_type_tags, workout_drills(drill_id, sort_order, target_sets, target_reps, target_duration_seconds, drills(id, name, description, video_url, source_trainer, difficulty))"
    );

  if (workoutsError) {
    // Surfaced instead of silently falling back to an empty feed — a
    // stale PostgREST schema cache (common right after running raw SQL
    // in the Supabase SQL Editor instead of through migrations) or a
    // missing grant shows up here as a real Postgres error, not "0 rows."
    console.error("[workouts] fetch failed:", workoutsError);
  }

  const { data: allCompletedSessions } = await supabase
    .schema("hoops")
    .from("workout_sessions")
    .select("workout_id, completed_at")
    .eq("player_id", playerId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false });

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

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-background/85 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between">
          <Link
            href={`/players/${playerId}`}
            className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim transition-colors hover:text-foreground"
          >
            ← {player.display_name}
          </Link>
          <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">
            {ranked.length} {ranked.length === 1 ? "workout" : "workouts"}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-3 px-4 py-5 sm:py-8">
        <div className="mb-1">
          <h1 className="font-display text-3xl uppercase leading-none tracking-wide text-foreground">
            Workout Library
          </h1>
          <p className="mt-1.5 text-xs text-foreground-dim">
            Ordered for you — nothing is hidden.
          </p>
        </div>

        {workoutsError ? (
          <EmptyState
            eyebrow="Couldn't load workouts"
            title="Something went wrong fetching the workout library"
            subtitle={workoutsError.message}
          />
        ) : ranked.length === 0 ? (
          <EmptyState
            eyebrow="No workouts yet"
            title="No curated content yet"
            subtitle="The workout library hasn't been seeded for this project yet — see supabase/seed_content.sql."
          />
        ) : (
          ranked.map((workout) => (
            <WorkoutCard key={workout.id} workout={workout} playerId={playerId} />
          ))
        )}
      </main>
    </div>
  );
}
