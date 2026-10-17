import Link from "next/link";
import type { Evidence, Insight, NextAction } from "@/lib/basketball/insights";
import { Card } from "@/components/ui/card";

const BADGE: Record<Evidence, { text: string; cls: string }> = {
  clear: { text: "Clear", cls: "bg-accent/15 text-accent" },
  not_yet: { text: "Not clear yet", cls: "bg-[var(--line)] text-foreground-dim" },
  fact: { text: "Just a fact", cls: "border border-line text-foreground-mute" },
};

/**
 * One thing the results say: a headline, the numbers behind it, how sure we are, and where to tap to see the sessions. The detail (the exact range,
 * the cautions) is one tap away under "How sure is this?" so the first read is short.
 */
export function InsightCard({ insight, href }: { insight: Insight; href: string | null }) {
  const b = BADGE[insight.evidence];
  return (
    <li className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-[15px] font-bold leading-snug text-foreground">{insight.headline}</p>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${b.cls}`}>{b.text}</span>
      </div>
      <p className="mt-1 text-xs font-semibold text-foreground-dim">{insight.metric}</p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-foreground-mute">{insight.evidenceNote}</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4">
        {href ? <Link href={href} className="-mb-2 inline-flex min-h-11 items-center text-[11px] font-extrabold uppercase tracking-[0.12em] text-accent">See the sessions ›</Link> : <span />}
        {insight.advanced.length > 0 && (
          <details className="text-[12px] text-foreground-mute"><summary className="flex min-h-11 cursor-pointer items-center font-bold">How sure is this?</summary>
            <ul className="mb-2 list-disc space-y-1 pl-4 leading-relaxed">{insight.advanced.map((t) => <li key={t}>{t}</li>)}</ul>
          </details>
        )}
      </div>
    </li>
  );
}

/** What to do next: the benchmark, and the Film Room lesson for its drill (nothing prescribed beyond that). */
export function NextCard({ next }: { next: NextAction }) {
  return (
    <Card className="border-accent/40 bg-accent/5 p-4" aria-label="What to do next">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-accent">Next</p>
      <p className="mt-1 text-[15px] font-bold text-foreground">{next.label}</p>
      <p className="mt-1 text-xs leading-relaxed text-foreground-dim">{next.why}</p>
      {next.lesson && (
        <p className="mt-2 text-xs text-foreground-dim">
          Lesson for it: <b className="text-foreground">{next.lesson.title}</b>{next.lesson.watched ? " (watched)" : ""}.{" "}
          <Link href={next.lesson.href} className="inline-flex min-h-11 items-center font-extrabold text-accent">Open in the Film Room ›</Link>
          {next.lesson.url && <> <a href={next.lesson.url} target="_blank" rel="noopener noreferrer" className="ml-3 inline-flex min-h-11 items-center font-extrabold text-accent">Watch ↗</a></>}
        </p>
      )}
      <Link href={next.href} className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-accent px-4 text-sm font-extrabold text-on-accent">Find it in Train</Link>
    </Card>
  );
}
