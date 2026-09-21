import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SessionPlayer, type SessionDrill } from "@/components/session-player";
import { entriesForLevel } from "@/lib/basketball/prescription";
import { suggestSkillLevel, type SkillLevel } from "@/lib/basketball/assessment";

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
      "id, status, program_days(volume_step, week_number, day_number, is_deload), workouts(id, name, workout_drills(id, drill_id, sort_order, block, variant_label, levels, level_targets, target_sets, target_reps, target_duration_seconds, drills(id, name, description, video_url, source_trainer, setup, cues, common_mistakes, equipment)))"
    )
    .eq("id", sessionId)
    .eq("player_id", playerId)
    .maybeSingle();

  // The player's training level decides both which variation of each slot
  // they get and how the sets/reps scale.
  const { data: player } = await supabase
    .schema("hoops")
    .from("players")
    .select("player_type")
    .eq("id", playerId)
    .maybeSingle();

  const playerType = (player?.player_type ?? {}) as {
    ratings?: Record<string, number>;
    preferred_level?: SkillLevel;
  };
  const level: SkillLevel =
    playerType.preferred_level ??
    suggestSkillLevel(
      (playerType.ratings ?? {
        ball_handling: 0,
        shooting: 0,
        defense: 0,
        athleticism: 0,
      }) as Parameters<typeof suggestSkillLevel>[0]
    );

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

  // Entries restricted to other levels are dropped here, so the player
  // only ever sees their own version of each slot.
  const drills = entriesForLevel(workout.workout_drills, level);

  const programDay = session.program_days as unknown as {
    volume_step: number;
    week_number: number;
    day_number: number;
    is_deload: boolean;
  } | null;
  const volumeStep = programDay?.volume_step ?? 0;

  // Entries already logged in a previous visit — lets the player resume
  // where they left off instead of redoing everything or losing progress
  // if they closed the app mid-workout.
  const { data: existingLogs } = await supabase
    .schema("hoops")
    .from("session_logs")
    .select("workout_drill_id")
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
        level={level}
        volumeStep={volumeStep}
        programLabel={
          programDay ? `Week ${programDay.week_number} · Day ${programDay.day_number}` : null
        }
        isDeload={programDay?.is_deload ?? false}
        alreadyCompleted={session.status === "completed"}
        initialLoggedEntryIds={(existingLogs ?? [])
          .map((log) => log.workout_drill_id)
          .filter((id): id is string => Boolean(id))}
      />
    </div>
  );
}
