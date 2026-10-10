import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { TrendChart } from "@/components/charts/trend-chart";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";

type ResultRow = {
  actual: number | null;
  goal_target: number | null;
  goal_unit: string | null;
  practice_sessions: { run_date: string } | null;
};

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default async function PracticeHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ drill?: string }>;
}) {
  const { teamId } = await params;
  const { drill } = await searchParams;
  const supabase = await createClient();

  // Independent of each other — parallel instead of sequential.
  const [{ data: { user } }, { data: team }, { data: labelRows }, { data: logged }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.schema("hoops").from("teams").select("id, name").eq("id", teamId).maybeSingle(),
    supabase
      .schema("hoops")
      .from("practice_drill_results")
      .select("label, created_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false }),
    // Every logged practice, newest first: each opens to view or fix its scores.
    supabase
      .schema("hoops")
      .from("practice_sessions")
      .select("id, plan_title, run_date, notes")
      .eq("team_id", teamId)
      .order("run_date", { ascending: false })
      .limit(30),
  ]);

  if (!user) redirect("/login");
  if (!team) notFound();

  const labels = [...new Set((labelRows ?? []).map((r) => r.label))];
  const selectedLabel = drill && labels.includes(drill) ? drill : labels[0];

  let sorted: ResultRow[] = [];
  if (selectedLabel) {
    const { data: rows } = await supabase
      .schema("hoops")
      .from("practice_drill_results")
      .select("actual, goal_target, goal_unit, practice_sessions(run_date)")
      .eq("team_id", teamId)
      .eq("label", selectedLabel);

    sorted = ((rows ?? []) as unknown as ResultRow[])
      .filter((r) => r.actual !== null && r.practice_sessions?.run_date)
      .sort((a, b) =>
        (a.practice_sessions?.run_date ?? "").localeCompare(b.practice_sessions?.run_date ?? "")
      );
  }

  const values = sorted.map((r) => r.actual as number);
  const dates = sorted.map((r) => formatDate(r.practice_sessions!.run_date));
  const latestGoal = sorted.length > 0 ? sorted[sorted.length - 1].goal_target : null;
  const goalUnit = sorted.length > 0 ? sorted[sorted.length - 1].goal_unit : null;
  const latest = values[values.length - 1];
  const first = values[0];
  const delta = latest !== undefined && first !== undefined ? Math.round((latest - first) * 10) / 10 : null;
  const max = Math.max(latestGoal ?? 0, ...values, 10) * 1.15;

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader back={{ href: "/coach", label: "Coach" }} />

      <main className="mx-auto w-full max-w-lg flex-1 space-y-5 px-4 py-5 sm:py-8">
        <h1 className="font-display text-3xl uppercase leading-none tracking-wide text-foreground">
          Drill History
        </h1>

        {labels.length === 0 ? (
          <EmptyState
            eyebrow="Nothing logged yet"
            title="No drill scores yet"
            subtitle="Set a goal on a drill in the builder, then log a score for it from Run Practice or a plan's Log Results link."
          />
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {labels.map((l) => (
                <Link
                  key={l}
                  href={`/teams/${teamId}/practice/history?drill=${encodeURIComponent(l)}`}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                    l === selectedLabel
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-line bg-surface text-foreground-dim"
                  }`}
                >
                  {l}
                </Link>
              ))}
            </div>

            <div className="flex gap-3">
              <Card className="flex-1 p-4">
                <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">
                  Latest
                </p>
                <p className="font-display mt-1 text-2xl text-foreground">
                  {latest ?? "—"}
                  {goalUnit ? <span className="text-sm"> {goalUnit}</span> : null}
                </p>
              </Card>
              <Card className="flex-1 p-4">
                <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">
                  Since first logged
                </p>
                <p
                  className={`font-display mt-1 text-2xl ${
                    delta !== null && delta > 0
                      ? "text-[var(--data-positive)]"
                      : "text-foreground"
                  }`}
                >
                  {delta === null ? "—" : delta > 0 ? `+${delta}` : delta}
                </p>
              </Card>
              {latestGoal !== null && (
                <Card className="flex-1 p-4">
                  <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">
                    Goal
                  </p>
                  <p className="font-display mt-1 text-2xl text-foreground">
                    {latestGoal}
                    {goalUnit ? <span className="text-sm"> {goalUnit}</span> : null}
                  </p>
                </Card>
              )}
            </div>

            <Card className="p-5">
              <p className="mb-3 text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">
                {selectedLabel} — {values.length} {values.length === 1 ? "practice" : "practices"} logged
              </p>
              {values.length === 0 ? (
                <p className="text-sm text-foreground-dim">No scores logged yet for this drill.</p>
              ) : (
                <TrendChart
                  series={[{ label: selectedLabel ?? "", color: "var(--accent)", values }]}
                  labels={dates}
                  max={max}
                  goalLine={latestGoal ?? undefined}
                />
              )}
            </Card>
          </>
        )}

        {(logged ?? []).length > 0 && (
          <section className="space-y-2.5">
            <h2 className="font-display text-xl uppercase leading-none tracking-wide text-foreground">Logged practices</h2>
            <Card className="divide-y divide-line overflow-hidden">
              {(logged ?? []).map((s) => (
                <Link
                  key={s.id}
                  href={`/teams/${teamId}/practice/sessions/${s.id}`}
                  className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-raised"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{s.plan_title ?? "Practice"}</p>
                    {s.notes && <p className="truncate text-xs text-foreground-mute">{s.notes}</p>}
                  </div>
                  <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-foreground-mute">
                    {s.run_date ? formatDate(s.run_date) : ""} ›
                  </span>
                </Link>
              ))}
            </Card>
          </section>
        )}
      </main>
    </div>
  );
}
