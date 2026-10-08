import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { playerLevel } from "@/lib/basketball/assessment";
import { SessionHistoryRow } from "@/components/session-history-row";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export default async function SessionHistoryPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  const supabase = await createClient();

  // Independent of each other — parallel instead of sequential.
  const [{ data: { user } }, { data: player }, { data: sessions }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.schema("hoops").from("players").select("id, display_name, player_type").eq("id", playerId).maybeSingle(),
    // Every session regardless of status — this is the "nothing is lost"
    // view. The hub only ever surfaces the single most recent in-progress
    // session as a "continue" banner; anything older than that (or already
    // completed) is only reachable from here.
    supabase
      .schema("hoops")
      .from("workout_sessions")
      .select("id, status, started_at, completed_at, workouts(name, workout_drills(drill_id, levels))")
      .eq("player_id", playerId)
      .order("started_at", { ascending: false }),
  ]);

  if (!user) redirect("/login");
  if (!player) notFound();
  const level = playerLevel(player.player_type);

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
      <PageHeader back={{ href: `/players/${playerId}/workouts`, label: "Train" }}>
        <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">
          {sessions?.length ?? 0} {sessions?.length === 1 ? "session" : "sessions"}
        </span>
      </PageHeader>

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
          <Card className="overflow-hidden">
            {sessions.map((session, i) => {
              const workout = session.workouts as unknown as
                | { name: string; workout_drills: { levels: string[] | null }[] }
                | null;
              // Only the drills at the player's level: a workout holds every
              // level's version of a slot, and counting them all made a
              // finished session read "5/7".
              const drillsAtLevel = (workout?.workout_drills ?? []).filter(
                (d) => !d.levels || d.levels.length === 0 || d.levels.includes(level)
              ).length;
              const date = session.completed_at ?? session.started_at;

              return (
                <SessionHistoryRow
                  key={session.id}
                  href={`/players/${playerId}/sessions/${session.id}`}
                  workoutName={workout?.name ?? "Workout"}
                  loggedCount={loggedCountBySession.get(session.id) ?? 0}
                  totalDrills={Math.max(drillsAtLevel, loggedCountBySession.get(session.id) ?? 0)}
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
          </Card>
        )}
      </main>
    </div>
  );
}
