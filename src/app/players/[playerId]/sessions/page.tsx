import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { SessionHistoryRow } from "@/components/session-history-row";

export default async function SessionHistoryPage({
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

  const { data: player } = await supabase
    .schema("hoops")
    .from("players")
    .select("id, display_name")
    .eq("id", playerId)
    .maybeSingle();

  if (!player) notFound();

  // Every session regardless of status — this is the "nothing is lost"
  // view. The hub only ever surfaces the single most recent in-progress
  // session as a "continue" banner; anything older than that (or already
  // completed) is only reachable from here.
  const { data: sessions } = await supabase
    .schema("hoops")
    .from("workout_sessions")
    .select("id, status, started_at, completed_at, workouts(name, workout_drills(drill_id))")
    .eq("player_id", playerId)
    .order("started_at", { ascending: false });

  const sessionIds = (sessions ?? []).map((s) => s.id);
  const { data: logs } = sessionIds.length
    ? await supabase.schema("hoops").from("session_logs").select("session_id").in("session_id", sessionIds)
    : { data: [] as { session_id: string }[] };

  const loggedCountBySession = new Map<string, number>();
  (logs ?? []).forEach((log) => {
    loggedCountBySession.set(log.session_id, (loggedCountBySession.get(log.session_id) ?? 0) + 1);
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
            {sessions?.length ?? 0} {sessions?.length === 1 ? "session" : "sessions"}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-5 sm:py-8">
        <div className="mb-4">
          <h1 className="font-display text-3xl uppercase leading-none tracking-wide text-foreground">
            History
          </h1>
          <p className="mt-1.5 text-xs text-foreground-dim">
            Every session, finished or not. Nothing is dropped.
          </p>
        </div>

        {!sessions || sessions.length === 0 ? (
          <EmptyState
            eyebrow="No sessions yet"
            title="Nothing logged yet"
            subtitle="Start a workout from the hub and it'll show up here — finished or not."
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            {sessions.map((session, i) => {
              const workout = session.workouts as unknown as
                | { name: string; workout_drills: unknown[] }
                | null;
              const date = session.completed_at ?? session.started_at;

              return (
                <SessionHistoryRow
                  key={session.id}
                  href={`/players/${playerId}/sessions/${session.id}`}
                  workoutName={workout?.name ?? "Workout"}
                  loggedCount={loggedCountBySession.get(session.id) ?? 0}
                  totalDrills={workout?.workout_drills.length ?? 0}
                  dateLabel={
                    date
                      ? new Date(date).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })
                      : ""
                  }
                  isInProgress={session.status === "in_progress"}
                  isFirst={i === 0}
                />
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
