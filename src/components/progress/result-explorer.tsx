"use client";

import Link from "next/link";
import { memo, useCallback, useMemo, useState } from "react";
import { weekLabel, type BenchmarkResult } from "@/lib/basketball/benchmark-analysis";
import { haptic } from "@/lib/haptics";

const W = 320, H = 190, PAD = { l: 34, r: 14, t: 14, b: 26 };
const pct = (n: number) => `${Math.round(n)}%`;
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const longDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });

/**
 * The results of ONE benchmark, same version and same conditions, as a chart you can touch. Every point carries its own plausible range (the bar),
 * the points that cannot be compared are hollow and are not joined to the line, and a tap opens that result: the numbers, how it was counted, and
 * the way to its workout and its shots. The same results are listed under the chart for anyone who would rather not tap a dot.
 */
/** More results than this are not all drawn at once on a phone: the newest are, with a way to show the rest. */
const SHOW_AT_MOST = 40;

export function ResultExplorer({ results: all, playerId, label, fromHref }: { results: BenchmarkResult[]; playerId: string; label: string; /** Where this screen is, so the shot page can bring the player back to the same place. */ fromHref?: string }) {
  const [showAll, setShowAll] = useState(false);
  const results = useMemo(() => (showAll || all.length <= SHOW_AT_MOST ? all : all.slice(-SHOW_AT_MOST)), [all, showAll]);
  const [sel, setSel] = useState(all.length - 1);
  const pos = useMemo(() => {
    const t = results.map((r) => new Date(r.at).getTime());
    const lo = Math.min(...t), hi = Math.max(...t);
    return results.map((_, i) => PAD.l + (hi === lo ? (W - PAD.l - PAD.r) / 2 : ((t[i] - lo) / (hi - lo)) * (W - PAD.l - PAD.r)));
  }, [results]);
  const y = (v: number) => PAD.t + (1 - v / 100) * (H - PAD.t - PAD.b);
  const line = results.map((r, i) => (r.comparable && r.pct !== null ? `${pos[i].toFixed(1)},${y(r.pct).toFixed(1)}` : null)).filter(Boolean).join(" ");
  const pick = useCallback((i: number) => { haptic("tap"); setSel(i); }, []);
  const r = results[Math.max(0, Math.min(sel, results.length - 1))];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-manipulation" role="group" aria-label={`${label}: ${results.length} results over time`}>
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(g)} y2={y(g)} stroke="var(--line)" strokeWidth={g === 0 ? 1.2 : 0.7} />
            <text x={PAD.l - 6} y={y(g) + 3} textAnchor="end" className="fill-foreground-mute text-[9px] font-bold">{g}%</text>
          </g>
        ))}
        {line.includes(" ") && <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />}
        {results.map((x, i) => x.pct !== null && <Point key={x.logId} x={x} cx={pos[i]} cy={y(x.pct)} yHi={y(x.ci.hi * 100)} yLo={y(x.ci.lo * 100)} selected={i === sel} index={i} onPick={pick} />)}
      </svg>
      {results.length < all.length && (
        <p className="mt-1 text-[11px] text-foreground-mute">Showing the newest {results.length} of {all.length}. <button type="button" onClick={() => { setShowAll(true); setSel(all.length - 1); }} className="min-h-11 font-extrabold text-accent underline underline-offset-2">Show all {all.length}</button> or narrow the dates above.</p>
      )}
      <p className="mt-1 text-[11px] text-foreground-mute">Each bar is the plausible range for that result. Filled dots are full benchmarks that can be compared; hollow dots are not.</p>

      <div className="mt-3 rounded-2xl border border-line bg-raised p-4" aria-live="polite">
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">{longDay(r.at)} · {weekLabel(r.week, r.planned)}</p>
        <p className="mt-1 font-display text-4xl leading-none text-foreground">
          {r.makes}<span className="text-foreground-mute"> of {r.attempts}</span>
          <span className="ml-2 text-xl text-accent">{r.pct === null ? "" : pct(r.pct)}</span>
        </p>
        <p className="mt-1 text-xs text-foreground-dim">Plausible range for this result: {pct(r.ci.lo * 100)} to {pct(r.ci.hi * 100)} (95%).</p>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          <li className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${r.comparable ? "bg-accent/10 text-accent" : "bg-[var(--line)] text-foreground-dim"}`}>{r.comparable ? "Full benchmark, comparable" : "Left out of comparisons"}</li>
          {r.flags.map((f) => <li key={f.text} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${f.excludes ? "border-foreground-mute text-foreground" : "border-line text-foreground-dim"}`}>{f.text}</li>)}
        </ul>
        <div className="mt-3 flex flex-wrap gap-x-5 text-[11px] font-extrabold uppercase tracking-[0.12em]">
          <Link href={`/players/${playerId}/sessions/${r.workoutSessionId}`} className="-my-2 inline-flex min-h-11 items-center py-2 text-accent">The workout ›</Link>
          <Link href={`/players/${playerId}/shooting/${r.shotSessionId}${fromHref ? `?from=${encodeURIComponent(fromHref)}` : ""}`} className="-my-2 inline-flex min-h-11 items-center py-2 text-accent">Every shot and replay ›</Link>
        </div>
      </div>

      <ol className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {results.map((x, i) => <Row key={x.logId} x={x} index={i} selected={i === sel} onPick={pick} />)}
      </ol>
    </div>
  );
}

const Point = memo(function Point({ x, cx, cy, yHi, yLo, selected, index, onPick }: { x: BenchmarkResult; cx: number; cy: number; yHi: number; yLo: number; selected: boolean; index: number; onPick: (i: number) => void }) {
  return (
    <g>
      <line x1={cx} x2={cx} y1={yHi} y2={yLo} stroke={x.comparable ? "var(--accent)" : "var(--foreground-mute)"} strokeWidth={selected ? 4 : 2.5} strokeLinecap="round" opacity={0.28} />
      <circle cx={cx} cy={cy} r={selected ? 7 : 5} fill={x.comparable ? "var(--accent)" : "var(--surface)"} stroke={x.comparable ? "var(--surface)" : "var(--foreground-mute)"} strokeWidth={2} />
      <circle cx={cx} cy={cy} r={22} fill="transparent" role="button" tabIndex={0} aria-pressed={selected}
        aria-label={`${weekLabel(x.week, x.planned)}, ${day(x.at)}: ${x.makes} of ${x.attempts}, ${pct(x.pct!)}${x.comparable ? "" : ", not a comparable result"}`}
        onClick={() => onPick(index)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(index); } }} className="cursor-pointer outline-none focus-visible:stroke-[var(--accent)]" strokeWidth={2} />
      <text x={cx} y={H - 8} textAnchor="middle" className="fill-foreground-mute text-[9px] font-bold">{x.week !== null ? `Wk ${x.week}` : day(x.at)}</text>
    </g>
  );
});

const Row = memo(function Row({ x, index, selected, onPick }: { x: BenchmarkResult; index: number; selected: boolean; onPick: (i: number) => void }) {
  return (
    <li>
      <button type="button" onClick={() => onPick(index)} aria-pressed={selected} className={`flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left ${selected ? "bg-accent/5" : ""}`}>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-foreground">{day(x.at)} · {x.week !== null ? `Week ${x.week}` : "Outside the program"}</span>
          <span className="block truncate text-[11px] font-bold uppercase tracking-wide text-foreground-mute">{x.makes} of {x.attempts}{x.comparable ? "" : " · not comparable"}{x.flags.length ? ` · ${x.flags.length} note${x.flags.length === 1 ? "" : "s"}` : ""}</span>
        </span>
        <span className="font-display text-xl leading-none text-accent">{x.pct === null ? "" : pct(x.pct)}</span>
      </button>
    </li>
  );
});
