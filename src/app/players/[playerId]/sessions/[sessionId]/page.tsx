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

  // Drills already logged in a previous visit — lets the player resume
  // where they left off instead of redoing everything or losing progress
  // if they closed the app mid-workout.
  const { data: existingLogs } = await supabase
    .schema("hoops")
    .from("session_logs")
    .select("drill_id")
    .eq("session_id", sessionId);

  return (
    // The session screen goes fully dark while the app shell stays light:
    // this is the "lights down, you're training" moment, and it should feel
    // like a different room than the rest of the app.
    <div className="theme-dark court-glow flex flex-1 flex-col justify-center bg-background px-4 py-10 text-foreground sm:py-16">
      <SessionPlayer
        playerId={playerId}
        sessionId={session.id}
        workoutName={workout.name}
        drills={drills}
        alreadyCompleted={session.status === "completed"}
        initialLoggedDrillIds={(existingLogs ?? []).map((log) => log.drill_id)}
      />
    </div>
  );
}
