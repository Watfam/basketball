import Link from "next/link";
import type { BenchmarkReport } from "@/lib/basketball/benchmark-analysis";
import { Card } from "@/components/ui/card";

const VERDICT_WORDS = { clear_improvement: "Clearly higher", clear_decline: "Clearly lower", no_clear_change: "No clear change", too_few: "Too few shots" } as const;

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 64, h = 24, pts = values.map((v, i) => `${(i / (values.length - 1)) * (w - 4) + 2},${h - 3 - (v / 100) * (h - 6)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden className="shrink-0">
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The three benchmarks at a glance. Each card is a link into that benchmark's results; nothing here is shown without its sample size. */
export function BenchmarkCards({ reports, hrefFor }: { reports: BenchmarkReport[]; hrefFor: (key: string) => string }) {
  return (
    <ul className="space-y-2.5">
      {reports.map((r) => {
        const g = r.groups.find((x) => x.current && x.comparable.length > 0) ?? r.groups.find((x) => x.current) ?? r.groups[0];
        const latest = g?.results[g.results.length - 1];
        const cmp = g?.comparison;
        return (
          <li key={r.protocol.key}>
            <Link href={hrefFor(r.protocol.key)} className="block rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-accent">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground">{r.protocol.title}</p>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-foreground-mute">{r.protocol.attempts ? `${r.protocol.attempts} attempts` : `${r.protocol.clockSeconds} seconds`} · v{r.protocol.version} · {r.protocol.skill.split(":")[0]}</p>
                </div>
                <Spark values={(g?.comparable ?? []).map((x) => x.pct!).slice(-6)} />
              </div>
              {latest ? (
                <div className="mt-2 flex items-end justify-between gap-3">
                  <p className="font-display text-3xl leading-none text-foreground">{latest.makes}<span className="text-foreground-mute"> of {latest.attempts}</span> <span className="text-lg text-accent">{latest.pct === null ? "" : `${Math.round(latest.pct)}%`}</span></p>
                  <p className="text-right text-[11px] font-bold uppercase tracking-wide text-foreground-mute">{g!.results.length} run{g!.results.length === 1 ? "" : "s"}{g!.comparable.length !== g!.results.length ? ` · ${g!.comparable.length} comparable` : ""}</p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-foreground-dim">Not run yet in this range. It is run the same way every time, so each result can be compared with the last.</p>
              )}
              {cmp && <p className="mt-2 text-xs font-semibold text-foreground-dim">{VERDICT_WORDS[cmp.verdict]}: {cmp.diff >= 0 ? "+" : ""}{cmp.diff} points, first to latest ({cmp.baseline.attempts} and {cmp.latest.attempts} shots)</p>}
              {g && !cmp && latest && <p className="mt-2 text-xs text-foreground-mute">{g.comparable.length < 2 ? "Needs two full runs of the same kind to compare." : ""}</p>}
              {r.groups.length > 1 && <p className="mt-1 text-[11px] text-foreground-mute">{r.groups.length} kinds of result (other versions or conditions) are kept apart.</p>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function KpiTile({ label, value, sub, href, note }: { label: string; value: string; sub: string; href: string; note?: string }) {
  return (
    <Link href={href} className="flex min-h-28 flex-col justify-between rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-accent">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">{label}</p>
      <div>
        <p className="font-display text-3xl leading-none text-foreground">{value}</p>
        <p className="mt-1 text-[11px] font-bold leading-snug text-foreground-dim">{sub}</p>
        {note && <p className="mt-0.5 text-[11px] leading-snug text-foreground-mute">{note}</p>}
      </div>
    </Link>
  );
}

export { Card };
