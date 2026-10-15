import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SessionPlayer, type SessionDrill } from "@/components/session-player";
import { entriesForLevel } from "@/lib/basketball/prescription";
import { playerLevel } from "@/lib/basketball/assessment";
import { isSkippedLog } from "@/lib/basketball/session-logs";
import { buildEntryExtras } from "@/lib/basketball/drill-session-view";
import { parseTracked, type TrackedMetrics } from "@/lib/basketball/drill-tracking";
import { loadLessonContext } from "@/lib/basketball/drill-film-server";

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ playerId: string; sessionId: string }>;
  /** tracked= is the workout drill the player has just come back from tracking with the camera. */
  searchParams: Promise<{ tracked?: string }>;
}) {
  const { playerId, sessionId } = await params;
  const { tracked } = await searchParams;
  const supabase = await createClient();

  // All four are independent of each other — each needs only playerId
  // and/or sessionId, both already known from params — parallel instead
  // of stacked one after another.
  const [
    { data: { user } },
    { data: session, error },
    { data: player },
    { data: existingLogs },
  ] = await Promise.all([
    supabase.auth.getUser(),
    // RLS (workout_sessions_household_all) scopes this to sessions for
    // players in the caller's own household.
    supabase
      .schema("hoops")
      .from("workout_sessions")
      .select(
        "id, status, program_days(volume_step, week_number, day_number, is_deload), workouts(id, name, workout_drills(id, drill_id, sort_order, block, variant_label, levels, level_targets, target_sets, target_reps, target_duration_seconds, drills(id, name, description, video_url, source_trainer, setup, cues, common_mistakes, equipment, film_resources(id, title, watch_for, url, notes))))"
      )
      .eq("id", sessionId)
      .eq("player_id", playerId)
      .maybeSingle(),
    // The player's training level decides both which variation of each slot
    // they get and how the sets/reps scale.
    supabase.schema("hoops").from("players").select("player_type, household_id").eq("id", playerId).maybeSingle(),
    // Entries already logged in a previous visit — lets the player resume
    // where they left off instead of redoing everything or losing progress
    // if they closed the app mid-workout.
    supabase.schema("hoops").from("session_logs").select("workout_drill_id, metrics").eq("session_id", sessionId),
  ]);

  if (!user) redirect("/login");

  const level = playerLevel(player?.player_type);

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

  // The Film Room's own lessons (read only), the video links this household attached (they win over the lesson's own address; the drill card used to
  // ignore them), and which lessons this player has watched.
  const householdId = (player as { household_id?: string | null } | null)?.household_id ?? null;
  const film = await loadLessonContext(supabase, playerId, householdId);
  const extras = buildEntryExtras({
    entries: drills as unknown as Parameters<typeof buildEntryExtras>[0]["entries"],
    level,
    volumeStep,
    ...film,
  });
  const trackedResults: Record<string, TrackedMetrics> = {};
  for (const log of existingLogs ?? []) {
    const t = parseTracked(log.metrics);
    if (t && log.workout_drill_id) trackedResults[log.workout_drill_id as string] = t;
  }

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
        entryExtras={extras}
        trackedResults={trackedResults}
        focusEntryId={tracked && drills.some((d) => d.id === tracked) ? tracked : null}
        initialLoggedEntryIds={(existingLogs ?? [])
          .map((log) => log.workout_drill_id)
          .filter((id): id is string => Boolean(id))}
        initialSkippedEntryIds={(existingLogs ?? [])
          .filter((log) => isSkippedLog(log.metrics))
          .map((log) => log.workout_drill_id)
          .filter((id): id is string => Boolean(id))}
      />
    </div>
  );
}
