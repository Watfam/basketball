import Link from "next/link";
import { PlayerTabHeader } from "@/components/player-tab-header";
import { VolumeChart } from "@/components/charts/volume-chart";
import { EmptyState } from "@/components/empty-state";
import { BenchmarkCards, KpiTile } from "@/components/progress/benchmark-cards";
import { ResultExplorer } from "@/components/progress/result-explorer";
import { InsightCard, LatestCard, NextCard } from "@/components/progress/insight-cards";
import { ShootingView } from "@/components/progress/shooting-view";
import { buildInsights, latestResult, nextAction, type InsightLink, type LessonLite } from "@/lib/basketball/insights";
import { Card } from "@/components/ui/card";
import { PROGRESS_ROW_LIMIT } from "@/lib/basketball/progress-limits";
import { RANGE_CHOICES, rangeParams, type ProgressRange } from "@/lib/basketball/progress-range";
import { analyzeBenchmarks, volumeSummary, whatThisShows, type BenchmarkReport } from "@/lib/basketball/benchmark-analysis";
import type { ProgressRow } from "@/lib/basketball/progress-rows";
import { BENCHMARKS, BENCHMARK_HONESTY, BENCHMARK_WEEKS } from "@/lib/basketball/benchmarks";
import { weeklyVolume } from "@/lib/basketball/progress";

const MS_WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * Progress: where a player looks at their own development. One screen, two levels. The overview says plainly what was worked on, how the benchmarks are
 * going and what to do next; every tile and card opens the detail behind it, down to the workout and the shots that produced the number. The older
 * screens (shooting history, workout history, the Film Room) are where those links lead; nothing is repeated here. It receives data and draws it;
 * the page does the reading.
 */
export function ProgressView({ playerId, playerName, range, view, selected, category, drill, rows, workoutAts, hasBenchmarkWorkout, truncated, now, lessonFor, basePath, keepQuery }: {
  playerId: string; playerName: string; range: ProgressRange; view: "overview" | "shooting" | "benchmarks"; selected?: string; category?: string; drill?: string; rows: ProgressRow[];
  workoutAts: Date[]; hasBenchmarkWorkout: boolean; truncated: boolean; now: Date; lessonFor: (drillName: string) => LessonLite | null;
  /** Only for test pages that show this view somewhere else; the real page leaves these out. */
  basePath?: string; keepQuery?: Record<string, string>;
}) {
  const inRange = { from: range.from, to: range.to };
  const reports = analyzeBenchmarks(rows, inRange);
  const everReports = analyzeBenchmarks(rows);
  const volume = volumeSummary(rows, inRange);
  const meaning = whatThisShows(reports, volume);
  const workoutDates = workoutAts.filter((d) => (!range.from || d >= range.from) && (!range.to || d <= range.to));

  const base = basePath ?? `/players/${playerId}/progress`;
  const keep = keepQuery ?? {};
  const q = (extra: Record<string, string>) => `${base}?${new URLSearchParams({ ...keep, ...rangeParams(range), ...extra }).toString()}`;
  const withComparison = reports.flatMap((r) => r.groups.filter((g) => g.current && g.comparison));
  const clear = withComparison.filter((g) => g.comparison!.verdict === "clear_improvement").length;
  const ranCount = reports.filter((r) => r.groups.some((g) => g.current && g.comparable.length > 0)).length;
  const nextWeek = nextPlannedWeek(everReports);
  const insights = buildInsights(rows, inRange);
  const latest = latestResult(rows, now, inRange);
  const next = nextAction({ rows, now, benchmarkWorkoutHref: hasBenchmarkWorkout ? `/players/${playerId}/workouts` : null, lessonFor });
  const linkHref = (l: InsightLink) => (l === null ? null : l.view === "benchmarks" ? q({ view: "benchmarks", benchmark: l.benchmark }) : q({ view: "shooting", ...(l.category ? { category: l.category } : {}), ...(l.drill ? { drill: l.drill } : {}) }));

  return (
    <div className="flex flex-1 flex-col">
      <PlayerTabHeader playerId={playerId} name={playerName} />
      <main className="mx-auto w-full max-w-lg flex-1 space-y-5 px-4 py-5 sm:py-8">
        <div>
          <Link href={`/players/${playerId}/me`} className="-my-2 inline-flex min-h-11 items-center py-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim">‹ Me</Link>
          <h1 className="font-display text-3xl uppercase leading-none tracking-wide text-foreground">Progress</h1>
        </div>

        <RangeBar range={range} view={view} benchmark={selected} category={category} drill={drill} base={base} keep={keep} />
        <nav aria-label="Progress sections" className="grid grid-cols-3 gap-1 rounded-xl bg-raised p-1">
          {([["overview", "Overview"], ["shooting", "Shooting"], ["benchmarks", "Benchmarks"]] as const).map(([k, label]) => (
            <Link key={k} href={q({ view: k })} aria-current={view === k ? "page" : undefined} scroll={false}
              className={`flex min-h-11 items-center justify-center rounded-lg px-2 text-xs font-extrabold uppercase tracking-wide ${view === k ? "bg-surface text-accent shadow-sm" : "text-foreground-dim"}`}>{label}</Link>
          ))}
        </nav>

        {view === "overview" ? (
          <>
            {latest && <LatestCard latest={latest} drillHref={q({ view: "shooting", ...(latest.row.metrics.category ? { category: latest.row.metrics.category } : {}), drill: encodeURIComponent(`${latest.row.drillName}|${latest.row.metrics.variant ?? ""}`) })} shotsHref={`/players/${playerId}/shooting/${latest.row.metrics.tracking.shot_session_id}?from=${encodeURIComponent(q({}))}`} />}
            <section aria-label="What your results say">
              <SectionHeading title="What your results say" caption={range.label} />
              {insights.length === 0 ? (
                <EmptyState eyebrow="Nothing to say yet" title="Run a benchmark or track a drill" subtitle="Your results are compared with your own earlier ones, run the same way, so the first one is the starting point." />
              ) : (
                <>
                  <ul className="space-y-2.5">{insights.slice(0, 3).map((i) => <InsightCard key={i.id} insight={i} href={linkHref(i.link)} />)}</ul>
                  {insights.length > 3 && (
                    <details className="mt-2"><summary className="flex min-h-11 cursor-pointer items-center text-[11px] font-extrabold uppercase tracking-[0.12em] text-accent">{insights.length - 3} more</summary>
                      <ul className="mt-1 space-y-2.5">{insights.slice(3).map((i) => <InsightCard key={i.id} insight={i} href={linkHref(i.link)} />)}</ul>
                    </details>
                  )}
                </>
              )}
            </section>
            {next && <NextCard next={next} />}

            <section aria-label="At a glance" className="grid grid-cols-2 gap-3">
              <KpiTile label="Workouts" value={String(workoutDates.length)} sub={`finished · ${range.label.toLowerCase()}`} note="Effort, not skill" href={`/players/${playerId}/sessions`} />
              <KpiTile label="Drill shots" value={String(volume.attempts)} sub={`in ${volume.trackedDrills} tracked drill${volume.trackedDrills === 1 ? "" : "s"}`} note="Effort, not skill. Only tracked drills: Today and Shoot count every shot" href={q({ view: "shooting" })} />
              <KpiTile label="Benchmarks" value={`${ranCount} of ${BENCHMARKS.length}`} sub={ranCount === 0 ? "none run in this range" : clear > 0 ? `${clear} clearly higher` : "no clear change yet"} note="Same test, same way" href={q({ view: "benchmarks" })} />
              <KpiTile label="Next up" value={!hasBenchmarkWorkout ? "Train" : nextWeek === "done" ? "Done" : `Week ${nextWeek}`} sub={!hasBenchmarkWorkout ? "pick today's workout" : nextWeek === "done" ? "all planned benchmarks run" : "suggested benchmark week"} href={hasBenchmarkWorkout ? `/players/${playerId}/workouts` : `/players/${playerId}`} />
            </section>

            <section>
              <SectionHeading title="Benchmarks" caption={range.label} />
              <BenchmarkCards reports={reports} hrefFor={(key) => q({ view: "benchmarks", benchmark: key })} />
            </section>

            <section>
              <SectionHeading title="Workouts per week" caption="Effort" />
              <Card className="p-4">
                {workoutDates.length === 0 ? <p className="text-sm text-foreground-dim">No finished workouts in this range.</p> : <VolumeChart weeks={weeklyVolume(workoutDates, weeksIn(range, workoutDates), range.to ?? new Date())} />}
                <p className="mt-2 text-[11px] text-foreground-mute">Doing more workouts is the work. It is not, by itself, better shooting.</p>
              </Card>
            </section>

            <WhatThisShows items={meaning} />
            <DataQuality volume={volume} truncated={truncated} />
            <LinkRows playerId={playerId} />
          </>
        ) : view === "shooting" ? (
          <ShootingView rows={rows.filter((x) => (!range.from || new Date(x.at) >= range.from) && (!range.to || new Date(x.at) <= range.to))} playerId={playerId} q={q} category={category} drill={drill} lessonFor={lessonFor} hereHref={q({ view: "shooting", ...(category ? { category } : {}), ...(drill ? { drill } : {}) })} />
        ) : (
          <BenchmarkDetail lessonFor={lessonFor} reports={reports} selected={selected} playerId={playerId} q={q} hasWorkout={hasBenchmarkWorkout} meaning={meaning} volume={volume} truncated={truncated} />
        )}
      </main>
    </div>
  );
}

function nextPlannedWeek(reports: BenchmarkReport[]): number | "done" {
  const done = reports.flatMap((r) => r.groups.filter((g) => g.current).flatMap((g) => g.comparable.filter((x) => x.planned).map((x) => x.week!)));
  const latest = done.length ? Math.max(...done) : 0;
  return (BENCHMARK_WEEKS as readonly number[]).find((w) => w > latest) ?? "done";
}

function weeksIn(range: ProgressRange, dates: Date[]): number {
  const end = range.to ?? new Date();
  const start = range.from ?? (dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : end);
  return Math.min(26, Math.max(4, Math.ceil((end.getTime() - start.getTime()) / MS_WEEK) + 1));
}

function SectionHeading({ title, caption }: { title: string; caption?: string }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-3">
      <h2 className="font-display text-xl uppercase leading-none tracking-wide text-foreground">{title}</h2>
      {caption && <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-foreground-mute">{caption}</span>}
    </div>
  );
}

function RangeBar({ range, view, benchmark, category, drill, base, keep }: { range: ProgressRange; view: string; benchmark?: string; category?: string; drill?: string; base: string; keep: Record<string, string> }) {
  const href = (p: Record<string, string>) => `${base}?${new URLSearchParams({ ...keep, ...p, view, ...(benchmark ? { benchmark } : {}), ...(category ? { category } : {}), ...(drill ? { drill } : {}) }).toString()}`;
  const iso = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "");
  return (
    <div>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Date range">
        {RANGE_CHOICES.map((c) => (
          <Link key={c.key} href={href({ range: c.key })} scroll={false} aria-current={range.key === c.key ? "true" : undefined}
            className={`flex min-h-11 shrink-0 items-center rounded-full border px-4 text-xs font-bold ${range.key === c.key ? "border-accent bg-accent/10 text-accent-hover" : "border-line bg-surface text-foreground-dim"}`}>{c.label}</Link>
        ))}
      </div>
      <details className="mt-1.5" open={range.key === "custom"}>
        <summary className="flex min-h-11 cursor-pointer items-center text-[11px] font-extrabold uppercase tracking-[0.12em] text-foreground-dim">{range.key === "custom" ? range.label : "Pick dates"}</summary>
        <form action={base} method="get" className="flex flex-wrap items-end gap-2 pb-2">
          {Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <input type="hidden" name="view" value={view} />
          {benchmark && <input type="hidden" name="benchmark" value={benchmark} />}
          {category && <input type="hidden" name="category" value={category} />}
          {drill && <input type="hidden" name="drill" value={drill} />}
          <label className="text-[11px] font-bold text-foreground-mute">From<input type="date" name="from" defaultValue={iso(range.key === "custom" ? range.from : null)} className="mt-1 block min-h-11 rounded-lg border border-line bg-surface px-3 text-sm text-foreground" /></label>
          <label className="text-[11px] font-bold text-foreground-mute">To<input type="date" name="to" defaultValue={iso(range.key === "custom" && range.to ? new Date(range.to.getTime() - 86399000) : null)} className="mt-1 block min-h-11 rounded-lg border border-line bg-surface px-3 text-sm text-foreground" /></label>
          <button type="submit" className="min-h-11 rounded-lg bg-accent px-4 text-xs font-extrabold uppercase tracking-wide text-on-accent">Show</button>
        </form>
      </details>
    </div>
  );
}

function WhatThisShows({ items }: { items: ReturnType<typeof whatThisShows> }) {
  return (
    <section>
      <SectionHeading title="What this shows" caption="Four different things" />
      <Card className="divide-y divide-line">
        {items.map((it) => (
          <div key={it.key} className="px-4 py-3">
            <p className="text-sm font-bold text-foreground">{it.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-foreground-dim">{it.text}</p>
          </div>
        ))}
      </Card>
    </section>
  );
}

function DataQuality({ volume, truncated }: { volume: ReturnType<typeof volumeSummary>; truncated: boolean }) {
  if (volume.trackedDrills === 0) return null;
  return (
    <section aria-label="How the numbers were counted">
      <SectionHeading title="How these were counted" />
      <Card className="p-4 text-xs leading-relaxed text-foreground-dim">
        <p>{volume.cameraCounted} of {volume.trackedDrills} tracked drills were counted by the camera; {volume.corrected} had calls or totals you corrected. {BENCHMARK_HONESTY.counted}</p>
        <p className="mt-1.5">{BENCHMARK_HONESTY.prescribed} {BENCHMARK_HONESTY.notMeasured}</p>
        {truncated && <p className="mt-1.5">Only the {PROGRESS_ROW_LIMIT} most recent tracked drills were read.</p>}
      </Card>
    </section>
  );
}

function LinkRows({ playerId }: { playerId: string }) {
  const rows = [
    { href: `/players/${playerId}/shooting`, label: "Shooting history", sub: "Every set, by drill, with the shots" },
    { href: `/players/${playerId}/sessions`, label: "Workout history", sub: "Every workout, finished or not" },
    { href: `/players/${playerId}/film`, label: "Film Room", sub: "The lessons behind the drills" },
  ];
  return (
    <Card className="overflow-hidden">
      {rows.map((r, i) => (
        <Link key={r.href} href={r.href} className={`flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-raised ${i ? "border-t border-line" : ""}`}>
          <div className="min-w-0"><p className="text-sm font-semibold text-foreground">{r.label}</p><p className="truncate text-xs text-foreground-mute">{r.sub}</p></div>
          <span className="text-foreground-mute" aria-hidden>›</span>
        </Link>
      ))}
    </Card>
  );
}

function BenchmarkDetail({ reports, selected, playerId, q, hasWorkout, meaning, volume, truncated, lessonFor }: { lessonFor: (drillName: string) => LessonLite | null; reports: BenchmarkReport[]; selected?: string; playerId: string; q: (e: Record<string, string>) => string; hasWorkout: boolean; meaning: ReturnType<typeof whatThisShows>; volume: ReturnType<typeof volumeSummary>; truncated: boolean }) {
  const pick = reports.find((r) => r.protocol.key === selected) ?? reports.find((r) => r.resultCount > 0) ?? reports[0];
  const p = pick.protocol;
  return (
    <>
      <nav aria-label="Benchmarks" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {reports.map((r) => (
          <Link key={r.protocol.key} href={q({ view: "benchmarks", benchmark: r.protocol.key })} scroll={false} aria-current={r.protocol.key === p.key ? "true" : undefined}
            className={`flex min-h-11 shrink-0 items-center rounded-full border px-4 text-xs font-bold ${r.protocol.key === p.key ? "border-accent bg-accent/10 text-accent-hover" : "border-line bg-surface text-foreground-dim"}`}>{r.protocol.title.replace(" Benchmark", "")}</Link>
        ))}
      </nav>

      <Card className="p-4">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-accent">Benchmark v{p.version} · the same test every time</p>
        <h2 className="mt-1 font-display text-2xl uppercase leading-none tracking-wide text-foreground">{p.title}</h2>
        <p className="mt-1.5 text-xs text-foreground-dim">{p.skill}</p>
        <p className="mt-1.5 text-xs font-semibold text-foreground">{p.attempts ? `${p.attempts} attempts` : `${p.clockSeconds} seconds`} · {p.spot}</p>
        <details className="mt-1">
          <summary className="flex min-h-11 cursor-pointer items-center text-[11px] font-extrabold uppercase tracking-[0.12em] text-accent">How it is run</summary>
          <ol className="list-decimal space-y-1 pb-1 pl-4 text-xs leading-relaxed text-foreground-dim">{p.instructions.map((t) => <li key={t}>{t}</li>)}</ol>
          <p className="pb-2 text-[11px] leading-relaxed text-foreground-mute">{p.reads}</p>
        </details>
      </Card>

      {(() => {
        const l = lessonFor(p.drillName);
        return l ? (
          <Card className="p-4" aria-label="Lesson for this test">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">Lesson for this test</p>
            <p className="mt-1 text-sm text-foreground-dim"><b className="text-foreground">{l.title}</b>{l.watched ? " (watched)" : ""}. <Link href={l.href} className="inline-flex min-h-11 items-center font-extrabold text-accent-hover">Open it in the Film Room ›</Link></p>
          </Card>
        ) : null;
      })()}

      {pick.groups.length === 0 ? (
        <EmptyState eyebrow="No results in this range" title={`${p.title} not run yet`} subtitle="Run it the same way each time and the results line up here, with how much they can be trusted."
          action={hasWorkout ? <Link href={`/players/${playerId}/workouts`} className="inline-flex min-h-11 items-center text-xs font-extrabold uppercase tracking-[0.12em] text-accent">Find the Benchmark Check workout ›</Link> : undefined} />
      ) : (
        pick.groups.map((g) => (
          <section key={`${g.protocolId}|${g.conditionsLabel}`} className="space-y-3" aria-label={`${p.title} results`}>
            <SectionHeading title={g.current ? "Results" : `Results · ${g.protocolId}`} caption={g.conditionsLabel ?? undefined} />
            {!g.current && <p className="rounded-xl border border-line bg-raised px-3 py-2 text-xs text-foreground-dim">These were taken under a different version of this benchmark. They are shown for the record and never compared with the current one.</p>}
            <Card className="p-4"><ResultExplorer results={g.results} playerId={playerId} label={`${p.title}${g.conditionsLabel ? `, ${g.conditionsLabel}` : ""}`} fromHref={q({ view: "benchmarks", benchmark: p.key })} /></Card>
            {g.comparison && (
              <Card className="p-4" aria-label="First against latest">
                <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">First against latest · same version{g.conditionsLabel ? `, ${g.conditionsLabel}` : ""}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground">{g.comparison.text}</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-foreground-mute">{g.comparison.caveats.map((c) => <li key={c}>{c}</li>)}</ul>
              </Card>
            )}
            {g.current && !g.comparison && g.results.length > 0 && <p className="text-xs text-foreground-mute">{g.comparable.length < 2 ? "A comparison needs two full runs of this benchmark, run the same way." : ""}</p>}
            {g.current && <p className="text-[11px] leading-relaxed text-foreground-mute">{g.consistency.text}</p>}
          </section>
        ))
      )}
      <WhatThisShows items={meaning} />
      <DataQuality volume={volume} truncated={truncated} />
    </>
  );
}
