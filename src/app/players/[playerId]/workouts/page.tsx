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
      <header className="flex items-center justify-between border-b border-line px-6 py-4">
        <div>
          <Link href={`/players/${playerId}`} className="text-xs font-semibold uppercase tracking-wide text-foreground-dim hover:text-foreground">
            ← Back
          </Link>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.3em] text-accent">
            {player.display_name}&rsquo;s workouts
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-3 px-4 py-8 sm:py-12">
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
