import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ShootingHub } from "@/components/shooting-hub";
import { EmptyState } from "@/components/empty-state";
import { ShotSessionList } from "@/components/shot-session-list";
import { TrendChart } from "@/components/charts/trend-chart";
import { formatPercentage, percentage, seasonStart, totalSessions, type SessionRow as TotalsRow } from "@/lib/basketball/shooting";

type SessionRow = {
  id: string;
  label: string | null;
  started_at: string;
  makes: number;
  attempts: number;
};

const UNLABELED = "Unlabeled";

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default async function ShootingPage({
  params,
  searchParams,
}: {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<{ label?: string; deleted?: string }>;
}) {
  const { playerId } = await params;
  const { label: labelParam, deleted } = await searchParams;
  const supabase = await createClient();

  // Sessions deleted more than 10 days ago go for good. Done here rather
  // than on a schedule, at no cost; a failure only delays it to next time.
  void supabase.schema("hoops").rpc("purge_deleted_shot_sessions").then(() => {}, () => {});

  const season = seasonStart();
  const [{ data: { user } }, { data: player }, { data: sessionRows, error: sessionsError }, { data: seasonRows }] =
    await Promise.all([
      supabase.auth.getUser(),
      supabase.schema("hoops").from("players").select("id, display_name").eq("id", playerId).maybeSingle(),
      // Finished sessions only; an open one lives on the phone until it ends.
      // Totals come from the session row itself, never from summing shots:
      // the API caps a response at 1000 rows, which would silently
      // truncate a long history.
      supabase
        .schema("hoops")
        .from("shot_sessions")
        .select("id, label, started_at, makes, attempts")
        .eq("player_id", playerId)
        .not("ended_at", "is", null)
        .is("deleted_at", null)
        .order("started_at", { ascending: false })
        .limit(60),
      // The whole season, for its totals and each label's average. Session
      // rows carry their own totals, so this stays one small query.
      supabase
        .schema("hoops")
        .from("shot_sessions")
        .select("label, started_at, makes, attempts")
        .eq("player_id", playerId)
        .not("ended_at", "is", null)
        .is("deleted_at", null)
        .gte("started_at", season.toISOString())
        .limit(1000),
    ]);

  if (!user) redirect("/login");
  if (!player) notFound();

  const sessions = ((sessionRows ?? []) as SessionRow[]).filter((s) => s.attempts > 0);
  const seasonSessions = (seasonRows ?? []) as TotalsRow[];
  const seasonTotals = totalSessions(seasonSessions);
  const averages: Record<string, { pct: number; sessions: number }> = {};
  for (const label of new Set(seasonSessions.map((s) => s.label?.trim() || ""))) {
    const t = totalSessions(seasonSessions.filter((s) => (s.label?.trim() || "") === label));
    if (t.pct !== null) averages[label] = { pct: t.pct, sessions: t.sessions };
  }
  const labelOf = (s: SessionRow) => s.label?.trim() || UNLABELED;
  const labels = [...new Set(sessions.map(labelOf))];
  const selected = labelParam && labels.includes(labelParam) ? labelParam : labels[0];

  // Trend is per label: free throws and threes are different skills, and a
  // line that mixes them says nothing about either.
  const inLabel = sessions.filter((s) => labelOf(s) === selected).slice(0, 20).reverse();
  const values = inLabel.map((s) => percentage(s.makes, s.attempts) ?? 0);
  const first = values[0];
  const latest = values[values.length - 1];
  const change = values.length > 1 ? Math.round((latest - first) * 10) / 10 : null;
  const totalShots = inLabel.reduce((n, s) => n + s.attempts, 0);

  const history = (
    <div className="space-y-5">
      {sessionsError ? (
        <EmptyState
          eyebrow="Couldn't load history"
          title="Saved sessions aren't available yet"
          subtitle="You can still shoot and count. Sessions are kept on this phone until they can be saved."
        />
      ) : sessions.length === 0 ? (
        <>
          <EmptyState
            eyebrow="Nothing yet"
            title="No sessions saved"
            subtitle="Finish a session and it shows up here, with a line that tracks your progress."
          />
          {/* Only there to offer Undo after the last session was deleted. */}
          {deleted && <ShotSessionList playerId={playerId} justDeleted={deleted} sessions={[]} />}
        </>
      ) : (
        <>
          {seasonTotals.attempts > 0 && (
            <div className="rounded-2xl border border-line bg-surface p-4">
              <p className="text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute">
                This season · since {season.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </p>
              <div className="mt-1 flex items-end gap-3">
                <p className="font-display text-4xl leading-none text-foreground">{formatPercentage(seasonTotals.pct)}</p>
                <p className="pb-0.5 text-xs font-bold tabular-nums text-foreground-dim">
                  {seasonTotals.makes} of {seasonTotals.attempts} · {seasonTotals.sessions}{" "}
                  {seasonTotals.sessions === 1 ? "session" : "sessions"}
                </p>
              </div>
              {seasonTotals.best && (
                <p className="mt-1.5 text-[11px] font-bold uppercase tracking-wide text-foreground-mute">
                  Best session {seasonTotals.best.makes}/{seasonTotals.best.attempts} (
                  {formatPercentage(seasonTotals.best.pct)}) · {shortDate(seasonTotals.best.started_at)}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {labels.map((l) => (
              <Link
                key={l}
                href={`/players/${playerId}/shooting?label=${encodeURIComponent(l)}`}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                  l === selected
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-line bg-surface text-foreground-dim"
                }`}
              >
                {l}
              </Link>
            ))}
          </div>

          <div className="flex gap-3">
            <div className="flex-1 rounded-2xl border border-line bg-surface p-4">
              <p className="text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute">Latest</p>
              <p className="font-display mt-1 text-2xl text-foreground">{formatPercentage(latest ?? null)}</p>
            </div>
            <div className="flex-1 rounded-2xl border border-line bg-surface p-4">
              <p className="text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute">Since first</p>
              <p
                className={`font-display mt-1 text-2xl ${
                  change !== null && change > 0 ? "text-[var(--data-positive)]" : "text-foreground"
                }`}
              >
                {change === null ? "—" : change > 0 ? `+${change}` : change}
              </p>
            </div>
            <div className="flex-1 rounded-2xl border border-line bg-surface p-4">
              <p className="text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute">Shots</p>
              <p className="font-display mt-1 text-2xl text-foreground">{totalShots}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-surface p-5">
            <p className="mb-3 text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute">
              {selected} — {inLabel.length} {inLabel.length === 1 ? "session" : "sessions"}
            </p>
            {inLabel.length < 2 ? (
              <p className="text-sm text-foreground-dim">
                One more session and this becomes a line you can follow.
              </p>
            ) : (
              <TrendChart
                series={[{ label: selected ?? "", color: "var(--accent)", values }]}
                labels={inLabel.map((s) => shortDate(s.started_at))}
                max={100}
              />
            )}
          </div>

          <ShotSessionList
            playerId={playerId}
            justDeleted={deleted}
            sessions={sessions.slice(0, 15).map((s) => ({
              id: s.id,
              label: labelOf(s),
              date: shortDate(s.started_at),
              score: `${s.makes}/${s.attempts}`,
              pct: formatPercentage(percentage(s.makes, s.attempts)),
            }))}
          />
        </>
      )}
    </div>
  );

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
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-5 sm:py-8">
        <ShootingHub
          playerId={playerId}
          playerName={player.display_name}
          suggestedLabels={labels.filter((l) => l !== UNLABELED)}
          averages={averages}
        >
          {history}
        </ShootingHub>
      </main>
    </div>
  );
}
