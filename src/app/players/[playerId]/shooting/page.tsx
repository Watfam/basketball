import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ShootingHub } from "@/components/shooting-hub";
import { EmptyState } from "@/components/empty-state";
import { ShotSessionList } from "@/components/shot-session-list";
import { TrendChart } from "@/components/charts/trend-chart";
import { formatPercentage, percentage, seasonStart, totalSessions } from "@/lib/basketball/shooting";
import { describeSavedGoal } from "@/lib/basketball/goals";
import { Card } from "@/components/ui/card";
import { Options, PickLink, SheetPicker } from "@/components/ui/sheet";
import { PlayerTabHeader } from "@/components/player-tab-header";
import { isId } from "@/lib/basketball/drill-context";
import { loadDrillStart } from "@/lib/basketball/drill-start-server";
import { loadKindsOfShot } from "@/lib/basketball/drill-kinds-server";
import { KindsOfShot } from "@/components/kinds-of-shot";
import { RANGE_CHOICES } from "@/lib/basketball/progress-range";
import { resolveShootRange, shootHref } from "@/lib/basketball/shoot-range";

type SessionRow = {
  id: string;
  label: string | null;
  started_at: string;
  makes: number;
  attempts: number;
  goal_kind?: string | null;
  goal_target?: number | null;
  goal_reached?: boolean | null;
};

const UNLABELED = "Unlabeled";
/** The filter value for every drill at once. */
const ALL = "All";

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default async function ShootingPage({
  params,
  searchParams,
}: {
  params: Promise<{ playerId: string }>;
  /** label= is the old name for drill=, kept so saved links still work. */
  searchParams: Promise<{ drill?: string; label?: string; deleted?: string; workout?: string; entry?: string; range?: string; from?: string; to?: string }>;
}) {
  const { playerId } = await params;
  const sp = await searchParams;
  const { drill: drillParam, label: labelParam, deleted, workout, entry } = sp;
  const season = seasonStart();
  // The date range comes from Today and Progress (range= or from=&to=); with none given this page shows the season, as it always has.
  const rng = resolveShootRange(sp, season);
  const rangeSel = rng.sel;
  const supabase = await createClient();

  // Sessions deleted more than 10 days ago go for good. Done here rather
  // than on a schedule, at no cost; a failure only delays it to next time.
  void supabase.schema("hoops").rpc("purge_deleted_shot_sessions").then(() => {}, () => {});

  // The season's sessions carry everything this page shows. Session rows
  // hold their own totals, so even a busy season is one small query (the
  // API caps a response at 1000 rows, far above any real season). The goal
  // columns arrive with migration 0021; until it has run, ask without them.
  // Read back as far as the season, or as far as the chosen range reaches if that is earlier (or all of it).
  const readFrom = rng.readFrom;
  const loadSeason = (withGoal: boolean) => {
    let q = supabase
      .schema("hoops")
      .from("shot_sessions")
      .select(`id, label, started_at, makes, attempts${withGoal ? ", goal_kind, goal_target, goal_reached" : ""}`)
      .eq("player_id", playerId)
      .not("ended_at", "is", null)
      .is("deleted_at", null)
      .gt("attempts", 0);
    if (readFrom) q = q.gte("started_at", readFrom.toISOString());
    return q.order("started_at", { ascending: false }).limit(1000);
  };

  const [{ data: { user } }, { data: player }, firstTry] = await Promise.all([
    supabase.auth.getUser(),
    supabase.schema("hoops").from("players").select("id, display_name").eq("id", playerId).maybeSingle(),
    loadSeason(true),
  ]);
  const { data: sessionRows, error: sessionsError } =
    firstTry.error && /goal_/.test(firstTry.error.message) ? await loadSeason(false) : firstTry;

  if (!user) redirect("/login");
  if (!player) notFound();

  // Opened from a workout drill ("Track with Camera"): which drill, and whether the camera can be offered for it. Absent for ordinary shooting.
  const drillStart = isId(workout) && isId(entry) ? await loadDrillStart(supabase, { playerId, workoutSessionId: workout, workoutDrillId: entry }) : null;
  const kinds = await loadKindsOfShot(supabase, playerId);

  const allRows = (sessionRows ?? []) as unknown as SessionRow[];
  const sessions = allRows.filter((s) => rng.inRange(s.started_at));
  const seasonRows = allRows.filter((s) => new Date(s.started_at) >= season);
  const labelOf = (s: { label: string | null }) => s.label?.trim() || UNLABELED;

  // Each player's own set names are the drills, most used first.
  const counts = new Map<string, number>();
  for (const s of sessions) counts.set(labelOf(s), (counts.get(labelOf(s)) ?? 0) + 1);
  const drills = [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  const wanted = drillParam ?? labelParam;
  const selected = wanted && drills.includes(wanted) ? wanted : ALL;
  const shown = selected === ALL ? sessions : sessions.filter((s) => labelOf(s) === selected);

  const totals = totalSessions(shown);
  const averages: Record<string, { pct: number; sessions: number }> = {};
  for (const d of new Set(seasonRows.map(labelOf))) {
    const t = totalSessions(seasonRows.filter((s) => labelOf(s) === d));
    if (t.pct !== null) averages[d === UNLABELED ? "" : d] = { pct: t.pct, sessions: t.sessions };
  }

  // "Last six" for the setup card: the newest six sets of each drill, and of everything.
  const lastSix: Record<string, { pct: number; sessions: number }> = {};
  for (const d of [ALL, ...new Set(seasonRows.map(labelOf))]) {
    const six = (d === ALL ? seasonRows : seasonRows.filter((s) => labelOf(s) === d)).slice(0, 6);
    const t = totalSessions(six);
    if (t.pct !== null) lastSix[d === ALL ? "*" : d === UNLABELED ? "" : d] = { pct: t.pct, sessions: t.sessions };
  }

  // A line only for one drill: free throws and threes are different
  // skills, and a line that mixes them says nothing about either.
  const line = selected === ALL ? [] : shown.slice(0, 20).reverse();
  const values = line.map((s) => percentage(s.makes, s.attempts) ?? 0);
  const change = values.length > 1 ? Math.round((values[values.length - 1] - values[0]) * 10) / 10 : null;
  // Links keep the date range, so moving between drills never forgets what was being looked at.
  const hrefWith = (extra: Record<string, string>, base: Record<string, string> = rng.keep) => shootHref(playerId, extra, base);
  const drillHref = (d: string) => (d === ALL ? hrefWith({}) : hrefWith({ drill: d }));
  const rangeLabel = rng.label;

  const rangeChips = (
    <SheetPicker label="How far back" value={rangeSel ? rangeSel.label : "Season"} title="How far back">
      <Options label="Date range">
        <PickLink href={hrefWith(selected !== ALL ? { drill: selected } : {}, {})} selected={!rangeSel} title="Season" />
        {RANGE_CHOICES.filter((c) => c.key !== "season").map((c) => (
          <PickLink key={c.key} href={hrefWith({ range: c.key, ...(selected !== ALL ? { drill: selected } : {}) }, {})} selected={rangeSel?.key === c.key} title={c.label} />
        ))}
        {rangeSel?.key === "custom" && <PickLink href={hrefWith(selected !== ALL ? { drill: selected } : {})} selected title={rangeSel.label} />}
      </Options>
    </SheetPicker>
  );

  const history = (
    <div className="space-y-5">
      {sessionsError ? (
        <EmptyState
          eyebrow="Couldn't load history"
          title="Saved sessions aren't available yet"
          subtitle="You can still shoot and count. Sessions are kept on this phone until they can be saved."
        />
      ) : sessions.length === 0 && rangeSel ? (
        <>
          {rangeChips}
          <EmptyState eyebrow="Nothing in this range" title="No sets in these dates" subtitle="Try a longer range above. Your other sets are still saved." />
        </>
      ) : sessions.length === 0 ? (
        <>
          <EmptyState
            eyebrow="Nothing yet this season"
            title="No sessions saved"
            subtitle="Finish a session and it shows up here, with a line that tracks your progress."
          />
          {/* Only there to offer Undo after the last session was deleted. */}
          {deleted && <ShotSessionList playerId={playerId} justDeleted={deleted} sessions={[]} />}
        </>
      ) : (
        <>
          {rangeChips}
          <SheetPicker label="Drill" value={selected === ALL ? "All shooting" : selected} title="Drill">
            <Options label="Drill">
              {[ALL, ...drills].map((d) => <PickLink key={d} href={drillHref(d)} selected={d === selected} title={d === ALL ? "All shooting" : d} />)}
            </Options>
          </SheetPicker>

          <Card className="p-4">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">
              {selected === ALL ? "All shooting" : selected} · {rangeLabel}
            </p>
            <div className="mt-1 flex items-end gap-3">
              <p className="font-display text-4xl leading-none text-foreground">{formatPercentage(totals.pct)}</p>
              <p className="pb-0.5 text-xs font-bold tabular-nums text-foreground-dim">
                {totals.makes} of {totals.attempts} · {totals.sessions} {totals.sessions === 1 ? "session" : "sessions"}
              </p>
            </div>
            <p className="mt-2 text-sm text-foreground-dim">
              You made {totals.makes} out of {totals.attempts} {totals.attempts === 1 ? "shot" : "shots"}. More shots is more work, not better shooting.
            </p>
            {totals.best && (
              <p className="mt-1.5 text-[11px] font-bold uppercase tracking-wide text-foreground-mute">
                Best session {totals.best.makes}/{totals.best.attempts} ({formatPercentage(totals.best.pct)}) ·{" "}
                {shortDate(totals.best.started_at)}
                {selected === ALL && totals.best.label ? ` · ${totals.best.label}` : ""}
              </p>
            )}
          </Card>

          {selected === ALL && kinds && <KindsOfShot data={kinds} />}

          {selected === ALL ? (
            <div>
              <h2 className="mb-2.5 font-display text-xl uppercase leading-none tracking-wide text-foreground">By drill</h2>
              <Card className="overflow-hidden">
                {drills.map((d, i) => {
                  const t = totalSessions(sessions.filter((s) => labelOf(s) === d));
                  return (
                    <Link
                      key={d}
                      href={drillHref(d)}
                      scroll={false}
                      className={`flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-raised ${
                        i ? "border-t border-line" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{d}</p>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-foreground-mute">
                          {t.sessions} {t.sessions === 1 ? "session" : "sessions"} · {t.makes} of {t.attempts}
                        </p>
                      </div>
                      <p className="font-display text-xl leading-none text-accent">{formatPercentage(t.pct)}</p>
                    </Link>
                  );
                })}
              </Card>
            </div>
          ) : (
            <Card className="p-5">
              <div className="mb-3 flex items-baseline justify-between">
                <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">
                  {selected} · last {line.length} {line.length === 1 ? "session" : "sessions"}
                </p>
                {change !== null && (
                  <p
                    className={`text-xs font-extrabold tabular-nums ${
                      change > 0 ? "text-[var(--data-positive)]" : "text-foreground-dim"
                    }`}
                  >
                    {change > 0 ? `+${change}` : change} since the first
                  </p>
                )}
              </div>
              {line.length < 2 ? (
                <p className="text-sm text-foreground-dim">One more session and this becomes a line you can follow.</p>
              ) : (
                <TrendChart
                  series={[{ label: selected, color: "var(--accent)", values }]}
                  labels={line.map((s) => shortDate(s.started_at))}
                  max={100}
                />
              )}
            </Card>
          )}

          <ShotSessionList
            playerId={playerId}
            justDeleted={deleted}
            fromHref={hrefWith(selected !== ALL ? { drill: selected } : {})}
            sessions={shown.slice(0, 15).map((s) => ({
              id: s.id,
              label: labelOf(s),
              date: shortDate(s.started_at),
              detail: describeSavedGoal(s.goal_kind ?? null, s.goal_target ?? null, s.goal_reached ?? null),
              startedAt: s.started_at,
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
      <PlayerTabHeader playerId={playerId} name={player.display_name} />

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-5 sm:py-8">
        <ShootingHub
          playerId={playerId}
          playerName={player.display_name}
          suggestedLabels={drills.filter((l) => l !== UNLABELED)}
          averages={averages}
          lastSix={lastSix}
          drill={drillStart}
        >
          {history}
        </ShootingHub>
      </main>
    </div>
  );
}
