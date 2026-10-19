import Link from "next/link";
import { StartSessionButton } from "@/components/start-session-button";
import type { BenchmarkLine } from "@/lib/basketball/benchmark-summary";

/** The three benchmark tests with each one's latest result, and the workout that runs them. Used on Today and on Train. */
export function BenchmarksCard({ playerId, lines, workoutId, intro = true }: { playerId: string; lines: BenchmarkLine[]; workoutId: string | null; intro?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      {intro && <p className="text-xs text-foreground-dim">Three shooting tests, run the same way each time, so you can see if you are really improving.</p>}
      <ul className={`${intro ? "mt-3 " : ""}divide-y divide-line`}>
        {lines.map((b) => (
          <li key={b.key}>
            <Link href={`/players/${playerId}/progress?view=benchmarks&benchmark=${b.key}&range=all`} className="flex min-h-12 items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-bold text-foreground">{b.title}</span>
                <span className="block text-xs text-foreground-dim">{b.detail}</span>
              </span>
              <span className="shrink-0 text-right text-xs text-foreground-dim">
                {b.latest ? (
                  <>
                    <b className="block font-display text-lg leading-none text-foreground">{b.latest.makes}/{b.latest.attempts}{b.latest.pct === null ? "" : ` · ${b.latest.pct}%`}</b>
                    <span>{b.runs} {b.runs === 1 ? "run" : "runs"} ›</span>
                  </>
                ) : (
                  <span className="font-bold uppercase tracking-wide">Not run yet ›</span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {workoutId && (
        <div className="mt-3 border-t border-line pt-3">
          <StartSessionButton playerId={playerId} workoutId={workoutId} fullWidth label="Start the Benchmark Check" />
        </div>
      )}
    </div>
  );
}
