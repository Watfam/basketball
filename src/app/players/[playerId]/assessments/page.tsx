import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TrendChart, type TrendSeries } from "@/components/charts/trend-chart";
import { EmptyState } from "@/components/empty-state";
import { RATING_CATEGORIES, RATING_SCALE_MAX, type ComputedPlayerType } from "@/lib/basketball/assessment";
import { computeOverall, ovrTier, type Ratings } from "@/lib/basketball/rating";

const SERIES_COLORS = ["var(--accent)", "var(--data-cyan)", "var(--data-positive)", "var(--foreground-mute)"];

export default async function AssessmentHistoryPage({
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

  // Oldest first — a progression chart reads left to right.
  const { data: rows } = await supabase
    .schema("hoops")
    .from("assessments")
    .select("id, kind, computed_player_type, completed_at")
    .eq("player_id", playerId)
    .order("completed_at", { ascending: true });

  const assessments = (rows ?? []).map((r) => {
    const computed = r.computed_player_type as ComputedPlayerType | null;
    const ratings = (computed?.ratings ?? null) as Ratings | null;
    return {
      id: r.id,
      kind: r.kind as string,
      completedAt: r.completed_at as string,
      archetype: computed?.archetype ?? null,
      ratings,
      overall: ratings ? computeOverall(ratings) : null,
    };
  });

  const labels = assessments.map((a) =>
    new Date(a.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
  );

  const series: TrendSeries[] = RATING_CATEGORIES.map((cat, i) => ({
    label: cat.label,
    color: SERIES_COLORS[i % SERIES_COLORS.length],
    values: assessments.map((a) => a.ratings?.[cat.value] ?? null),
  }));

  const first = assessments[0];
  const latest = assessments[assessments.length - 1];
  const ovrDelta =
    first?.overall != null && latest?.overall != null && assessments.length > 1
      ? latest.overall - first.overall
      : null;

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
            {assessments.length} {assessments.length === 1 ? "check-in" : "check-ins"}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-5 px-4 py-5 sm:py-8">
        <div>
          <h1 className="font-display text-3xl uppercase leading-none tracking-wide text-foreground">
            Your Progress
          </h1>
          <p className="mt-1.5 text-xs text-foreground-dim">
            Every self-scout you have done, oldest first.
          </p>
        </div>

        {assessments.length === 0 ? (
          <EmptyState
            eyebrow="Nothing yet"
            title="No assessments recorded"
            subtitle="Rate yourself once and this becomes a record of how your game changes."
          />
        ) : (
          <>
            {assessments.length === 1 ? (
              <div className="rounded-2xl border border-dashed border-line px-5 py-5 text-center">
                <p className="text-sm leading-relaxed text-foreground-dim">
                  This is your baseline. Rate yourself again after a block of work and this turns
                  into a line you can actually follow.
                </p>
              </div>
            ) : (
              <section className="panel-lit rounded-3xl border border-line bg-surface p-5 shadow-[var(--shadow-panel)]">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent">
                    Ratings Over Time
                  </h2>
                  {ovrDelta !== null && (
                    <span
                      className={`text-[11px] font-extrabold uppercase tracking-wide ${
                        ovrDelta > 0
                          ? "text-[var(--data-positive)]"
                          : ovrDelta < 0
                            ? "text-foreground-mute"
                            : "text-foreground-dim"
                      }`}
                    >
                      {ovrDelta > 0 ? "+" : ""}
                      {ovrDelta} OVR
                    </span>
                  )}
                </div>
                <div className="mt-4">
                  <TrendChart series={series} labels={labels} max={RATING_SCALE_MAX} />
                </div>
              </section>
            )}

            <section>
              <h2 className="mb-2.5 font-display text-xl uppercase leading-none tracking-wide text-foreground">
                Every Check-In
              </h2>
              <div className="space-y-2.5">
                {[...assessments].reverse().map((a, i) => (
                  <div key={a.id} className="rounded-2xl border border-line bg-surface p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-accent">
                          {a.kind === "onboarding" ? "Baseline" : a.kind === "annual" ? "Annual" : "Check-in"}
                          {i === 0 && assessments.length > 1 ? " · Latest" : ""}
                        </p>
                        <p className="mt-1 text-sm font-bold text-foreground">
                          {new Date(a.completedAt).toLocaleDateString(undefined, {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                        {a.archetype && (
                          <p className="mt-0.5 text-xs text-foreground-dim">{a.archetype}</p>
                        )}
                      </div>
                      {a.overall !== null && (
                        <div className="shrink-0 text-right">
                          <p className="font-display text-2xl leading-none text-foreground">
                            {a.overall}
                          </p>
                          <p className="text-[8px] font-extrabold uppercase tracking-[0.16em] text-foreground-mute">
                            {ovrTier(a.overall).label}
                          </p>
                        </div>
                      )}
                    </div>

                    {a.ratings && (
                      <div className="mt-3 grid grid-cols-4 gap-2 border-t border-line pt-2.5">
                        {RATING_CATEGORIES.map((cat) => (
                          <div key={cat.value}>
                            <p className="font-display text-lg leading-none text-foreground">
                              {a.ratings?.[cat.value] ?? "—"}
                            </p>
                            <p className="mt-0.5 truncate text-[8px] font-extrabold uppercase tracking-wide text-foreground-mute">
                              {cat.label.split(" ")[0]}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        <Link
          href={`/players/${playerId}/assessment`}
          className="block w-full rounded-xl border border-accent py-3.5 text-center text-sm font-extrabold uppercase tracking-[0.12em] text-accent transition-colors hover:bg-accent/10"
        >
          Rate yourself again
        </Link>
      </main>
    </div>
  );
}
