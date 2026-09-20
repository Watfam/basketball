import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SessionPlayer, type SessionDrill } from "@/components/session-player";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ playerId: string; sessionId: string }>;
}) {
  const { playerId, sessionId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // RLS (workout_sessions_household_all) scopes this to sessions for
  // players in the caller's own household.
  const { data: session, error } = await supabase
    .schema("hoops")
    .from("workout_sessions")
    .select(
      "id, status, workouts(id, name, workout_drills(drill_id, sort_order, target_sets, target_reps, target_duration_seconds, drills(id, name, description, video_url, source_trainer)))"
    )
    .eq("id", sessionId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (error) {
    console.error("[session] fetch failed:", error);
  }

  const workout = session?.workouts as unknown as
    | {
        id: string;
        name: string;
        workout_drills: SessionDrill[];
      }
    | null
    | undefined;

  if (!session || !workout) notFound();

  const drills = [...workout.workout_drills].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="court-glow flex flex-1 flex-col justify-center px-4 py-10 sm:py-16">
      <SessionPlayer
        playerId={playerId}
        sessionId={session.id}
        workoutName={workout.name}
        drills={drills}
        alreadyCompleted={session.status === "completed"}
      />
    </div>
  );
}
