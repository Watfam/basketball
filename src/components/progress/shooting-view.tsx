import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { ResultExplorer } from "@/components/progress/result-explorer";
import { Card } from "@/components/ui/card";
import { compareList, drillResults } from "@/lib/basketball/benchmark-analysis";
import { categoryStats, CATEGORY_COMPARISON_NOTE, MIN_SHOTS, NOT_A_GAME_CLAIM, VOLUME_CAVEAT, type TrackedRow } from "@/lib/basketball/drill-analytics";
import { CATEGORY_LABELS, CATEGORY_MEANING, type ShootingCategory } from "@/lib/basketball/drill-shooting";
import type { LessonLite } from "@/lib/basketball/insights";
import type { ProgressRow } from "@/lib/basketball/progress-rows";

type Q = (extra: Record<string, string>) => string;
const pct = (n: number | null) => (n === null ? "·" : `${Math.round(n)}%`);

/**
 * Shooting performance, one question at a time: how am I doing by kind of shot, then by drill, then drill by drill over time, then each result's
 * workout and shots. Each step is a link, the way back is the step above (it keeps the dates), and every result ends at its shots and replay.
 * Kinds of shot are shown side by side with their sample sizes and never ranked; "kind of shot" is what the drill asks for, not something the camera saw.
 */
export function ShootingView({ rows, playerId, q, category, drill, lessonFor, hereHref }: { rows: ProgressRow[]; playerId: string; q: Q; category?: string; drill?: string; lessonFor: (drillName: string) => LessonLite | null; hereHref: string }) {
  const tracked: TrackedRow[] = rows.map((x) => ({ logId: x.logId, workoutSessionId: x.workoutSessionId, at: x.at, drillName: x.drillName, metrics: x.metrics }));
  if (rows.length === 0) {
    return <EmptyState eyebrow="Nothing tracked in this range" title="No tracked drills yet" subtitle="When you track a shooting drill with the camera or by tapping, it shows up here by kind of shot, then by drill." />;
  }

  // level 3: one drill (and variant), over time
  if (drill) {
    const [name, variant] = decodeURIComponent(drill).split("|");
    const mine = rows.filter((x) => x.drillName === name && (x.metrics.variant ?? "") === (variant ?? ""));
    const cat = (mine[0]?.metrics.category ?? undefined) as string | undefined;
    const results = drillResults(mine);
    const cmp = compareList(results.filter((r) => r.comparable));
    const lesson = lessonFor(name);
    return (
      <div className="space-y-3">
        <Back href={q({ view: "shooting", ...(cat ? { category: cat } : {}) })} label={cat ? CATEGORY_LABELS[cat as ShootingCategory] ?? "Shooting" : "Shooting"} />
        <h2 className="font-display text-2xl uppercase leading-none tracking-wide text-foreground">{name}{variant ? <span className="block text-base normal-case tracking-normal text-foreground-dim">{variant}</span> : null}</h2>
        {results.length === 0 ? <EmptyState eyebrow="No results" title="Nothing tracked for this drill in this range" subtitle="Widen the dates above." /> : (
          <>
            <Card className="p-4"><ResultExplorer results={results} playerId={playerId} label={`${name}${variant ? `, ${variant}` : ""}`} fromHref={hereHref} /></Card>
            {cmp ? (
              <Card className="p-4" aria-label="First against latest">
                <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">First against latest · same drill and variant</p>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground">{cmp.text}</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-foreground-mute"><li>Different runs of a drill can be different amounts of work. {VOLUME_CAVEAT}</li><li>{NOT_A_GAME_CLAIM}</li></ul>
              </Card>
            ) : <p className="text-xs text-foreground-mute">A comparison needs two results of at least 5 attempts each.</p>}
          </>
        )}
        <DrillNext name={name} lesson={lesson} playerId={playerId} />
      </div>
    );
  }

  // level 2: the drills of one kind of shot
  if (category && category in CATEGORY_LABELS) {
    const cat = category as ShootingCategory;
    const inCat = rows.filter((x) => x.metrics.category === cat);
    const series = new Map<string, ProgressRow[]>();
    for (const r of inCat) { const k = `${r.drillName}|${r.metrics.variant ?? ""}`; (series.get(k) ?? series.set(k, []).get(k)!).push(r); }
    return (
      <div className="space-y-3">
        <Back href={q({ view: "shooting" })} label="Shooting" />
        <h2 className="font-display text-2xl uppercase leading-none tracking-wide text-foreground">{CATEGORY_LABELS[cat]}</h2>
        <p className="text-xs leading-relaxed text-foreground-dim">{CATEGORY_MEANING[cat]} This comes from what the drill asks for. The camera counts the shots; it did not see how they were taken.</p>
        {series.size === 0 ? <EmptyState eyebrow="Nothing here yet" title="No tracked drills of this kind in this range" subtitle="Widen the dates above." /> : (
          <Card className="overflow-hidden">
            {[...series.entries()].map(([k, list], i) => {
              const res = drillResults(list), last = res[res.length - 1];
              const cmp = compareList(res.filter((r) => r.comparable));
              const [name, variant] = k.split("|");
              return (
                <Link key={k} href={q({ view: "shooting", category: cat, drill: encodeURIComponent(k) })} className={`flex min-h-16 items-center justify-between gap-3 px-4 py-3 hover:bg-raised ${i ? "border-t border-line" : ""}`}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{name}{variant ? ` · ${variant}` : ""}</p>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-foreground-mute">{res.length} result{res.length === 1 ? "" : "s"} · latest {last.makes} of {last.attempts}{cmp ? ` · ${cmp.verdict === "clear_improvement" ? "clearly higher" : cmp.verdict === "clear_decline" ? "clearly lower" : "no clear change"}` : ""}</p>
                  </div>
                  <p className="font-display text-xl leading-none text-accent">{pct(last.pct)}</p>
                </Link>
              );
            })}
          </Card>
        )}
      </div>
    );
  }

  // level 1: kinds of shot, side by side
  const stats = categoryStats(tracked);
  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-foreground-dim">{CATEGORY_COMPARISON_NOTE}</p>
      <Card className="overflow-hidden">
        {stats.map((s, i) => (
          <Link key={s.category} href={q({ view: "shooting", category: s.category })} className={`block px-4 py-3 hover:bg-raised ${i ? "border-t border-line" : ""}`}>
            <div className="flex items-baseline justify-between gap-3"><p className="text-sm font-semibold text-foreground">{s.label}</p><p className="font-display text-xl leading-none text-accent">{s.enough ? `${s.pct}%` : "·"}</p></div>
            <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-foreground-mute">{s.makes} of {s.attempts} shots · {s.drills} tracked drill{s.drills === 1 ? "" : "s"}{s.enough ? ` · likely range ${Math.round(s.ci.lo * 100)}% to ${Math.round(s.ci.hi * 100)}%` : ` · under ${MIN_SHOTS} shots, too few to read`}</p>
          </Link>
        ))}
      </Card>
      <p className="text-[11px] leading-relaxed text-foreground-mute">Counted by the camera, or by taps, and corrected by you. {VOLUME_CAVEAT} {NOT_A_GAME_CLAIM}</p>
    </div>
  );
}

function Back({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="-my-2 inline-flex min-h-11 items-center py-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim">‹ {label}</Link>;
}

function DrillNext({ name, lesson, playerId }: { name: string; lesson: LessonLite | null; playerId: string }) {
  return (
    <Card className="p-4" aria-label="Lesson and practice for this drill">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">Practice this</p>
      {lesson ? (
        <p className="mt-1 text-sm text-foreground-dim">The Film Room lesson for {name}: <b className="text-foreground">{lesson.title}</b>{lesson.watched ? " (watched)" : ""}.{" "}
          <Link href={lesson.href} className="inline-flex min-h-11 items-center font-extrabold text-accent">Open it ›</Link>{lesson.url && <a href={lesson.url} target="_blank" rel="noopener noreferrer" className="ml-3 inline-flex min-h-11 items-center font-extrabold text-accent">Watch ↗</a>}</p>
      ) : <p className="mt-1 text-sm text-foreground-dim">No Film Room lesson is linked to {name} yet.</p>}
      <Link href={`/players/${playerId}/workouts`} className="inline-flex min-h-11 items-center text-xs font-extrabold uppercase tracking-[0.12em] text-accent">Find a workout with it, then track it with the camera ›</Link>
    </Card>
  );
}
