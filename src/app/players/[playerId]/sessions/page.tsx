import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";

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
      <header className="border-b border-line px-6 py-4">
        <Link
          href={`/players/${playerId}`}
          className="text-xs font-semibold uppercase tracking-wide text-foreground-dim hover:text-foreground"
        >
          ← Back
        </Link>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.3em] text-accent">
          {player.display_name}&rsquo;s history
        </p>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-2 px-4 py-8 sm:py-12">
        {!sessions || sessions.length === 0 ? (
          <EmptyState
            eyebrow="No sessions yet"
            title="Nothing logged yet"
            subtitle="Start a workout from the hub and it'll show up here — finished or not."
          />
        ) : (
          sessions.map((session) => {
            const workout = session.workouts as unknown as { name: string; workout_drills: unknown[] } | null;
            const totalDrills = workout?.workout_drills.length ?? 0;
            const loggedCount = loggedCountBySession.get(session.id) ?? 0;
            const isInProgress = session.status === "in_progress";
            const date = session.completed_at ?? session.started_at;
            const dateLabel = date
              ? new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" })
              : "";

            return (
              <Link
                key={session.id}
                href={`/players/${playerId}/sessions/${session.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 transition-colors hover:border-accent/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{workout?.name ?? "Workout"}</p>
                  <p className="mt-0.5 text-xs text-foreground-dim">
                    {loggedCount} of {totalDrills} drills · {dateLabel}
                  </p>
                </div>
                <span
                  className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${
                    isInProgress ? "border-accent text-accent" : "border-line text-foreground-dim"
                  }`}
                >
                  {isInProgress ? "Resume" : "Done"}
                </span>
              </Link>
            );
          })
        )}
      </main>
    </div>
  );
}
