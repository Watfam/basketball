"use client";

import type { BenchmarkProtocol } from "@/lib/basketball/benchmarks";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adjustDrillResult } from "@/app/actions";
import { describeHow, type TrackedMetrics } from "@/lib/basketball/drill-tracking";
import { trackingPath } from "@/lib/basketball/drill-context";
import type { TrackingInfo } from "@/lib/basketball/drill-session-view";
import { describeDrillGoal } from "@/lib/basketball/drill-context";
import { haptic } from "@/lib/haptics";
import { Button } from "@/components/ui/button";

/**
 * The optional "Track with Camera" step on a shooting drill's card, and the result that comes back to it. The drill can still be done without it:
 * nothing here replaces the sets, the timer, or Skip. The result is stated as what it is: counted by the camera or by taps, and the kind of
 * shot comes from the drill, not from the picture.
 */
export function DrillTrackingPanel({
  playerId, sessionId, entryId, tracking, benchmark = null, result, onResult, onNext, nextLabel,
}: {
  playerId: string;
  sessionId: string;
  entryId: string;
  tracking: TrackingInfo;
  benchmark?: BenchmarkProtocol | null;
  result: TrackedMetrics | null;
  onResult: (m: TrackedMetrics) => void;
  onNext?: () => void;
  nextLabel?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [makes, setMakes] = useState(result?.makes ?? 0);
  const [attempts, setAttempts] = useState(result?.attempts ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!tracking.trackable) return null;

  const go = () => { haptic("tap"); router.push(trackingPath(playerId, sessionId, entryId)); };
  const save = () => {
    setError(null);
    start(async () => {
      const r = await adjustDrillResult({ playerId, workoutSessionId: sessionId, workoutDrillId: entryId, makes, attempts });
      if (r.error || !r.metrics) { setError(r.error ?? "Couldn't change the result."); return; }
      onResult(r.metrics as unknown as TrackedMetrics);
      setEditing(false);
      haptic("success");
    });
  };

  if (!result) {
    return (
      <div className="mt-5 rounded-xl border border-line bg-raised px-3.5 py-3">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-foreground-mute">
          {benchmark ? `Benchmark v${benchmark.version} · same test every time` : `${tracking.categoryLabel} · optional`}
        </p>
        {benchmark && (
          <p className="mt-1.5 text-xs font-semibold text-foreground">
            {benchmark.attempts ? `${benchmark.attempts} attempts` : `${benchmark.clockSeconds} seconds`} · {benchmark.spot}
          </p>
        )}
        <Button variant="secondary" size="md" block onClick={go} className="mt-2">{benchmark ? "Track benchmark with Camera" : "Track with Camera"}</Button>
        <p className="mt-2 text-[11px] leading-relaxed text-foreground-mute">
          The camera counts your makes and attempts{tracking.goal ? ` (${describeDrillGoal(tracking.goal)})` : ""} and you can fix any it gets wrong. You can do this drill without it.
          {benchmark ? " A benchmark is only comparable with your other benchmarks when it is run the same way, so the steps are shown before you start." : ""}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-xl border border-accent/40 bg-accent/5 px-3.5 py-3" aria-label="Tracked result">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-accent">{benchmark ? `Benchmark v${benchmark.version} · result` : `Tracked · ${tracking.categoryLabel}`}</p>
      <p className="mt-1 font-display text-3xl leading-none text-foreground">
        {result.makes}<span className="text-foreground-mute"> of {result.attempts}</span>
        <span className="ml-2 text-base text-foreground-dim">{result.attempts > 0 ? `${Math.round((100 * result.makes) / result.attempts)}%` : ""}</span>
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-foreground-dim">{describeHow(result.tracking)}</p>
      {benchmark && result.benchmark && <BenchmarkQuality bm={benchmark} r={result} playerId={playerId} />}
      <p className="mt-1 text-[11px] leading-relaxed text-foreground-mute">
        The kind of shot comes from the drill. The camera counts shots and calls make or miss; it does not see footwork, speed or defenders.
      </p>
      {editing ? (
        <div className="mt-3 rounded-lg border border-line bg-surface px-3 py-3">
          <div className="grid grid-cols-2 gap-3 text-center">
            {([["Makes", makes, setMakes], ["Attempts", attempts, setAttempts]] as const).map(([label, value, set]) => (
              <div key={label}>
                <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">{label}</p>
                <div className="mt-1 flex items-center justify-center gap-2">
                  <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} onClick={() => set(Math.max(0, value - 1))} className="h-9 w-9 rounded-full border border-line text-lg font-extrabold text-foreground-dim">−</button>
                  <span className="w-10 text-2xl font-extrabold text-foreground">{value}</span>
                  <button type="button" aria-label={`More ${label.toLowerCase()}`} onClick={() => set(Math.min(1000, value + 1))} className="h-9 w-9 rounded-full border border-line text-lg font-extrabold text-foreground-dim">+</button>
                </div>
              </div>
            ))}
          </div>
          {makes > attempts && <p className="mt-2 text-xs text-foreground">Makes can&rsquo;t be more than attempts.</p>}
          {error && <p role="alert" className="mt-2 text-xs text-foreground">{error}</p>}
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={save} disabled={pending || makes > attempts}>{pending ? "Saving…" : "Save these numbers"}</Button>
            <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setMakes(result.makes); setAttempts(result.attempts); setError(null); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => { setMakes(result.makes); setAttempts(result.attempts); setEditing(true); }}>Fix the numbers</Button>
          <Button variant="ghost" size="sm" onClick={() => { if (!benchmark || window.confirm("This replaces your benchmark result for this workout. Use it only if the first run was interrupted. The earlier run stays in your shooting history.")) go(); }}>{benchmark ? "Redo benchmark" : "Track again"}</Button>
        </div>
      )}
      {onNext && !editing && <Button size="md" block onClick={onNext} className="mt-3">{nextLabel ?? "Next drill"}</Button>}
    </div>
  );
}

/** Whether this result is a complete, comparable benchmark, in plain words. */
function BenchmarkQuality({ bm, r, playerId }: { bm: BenchmarkProtocol; r: TrackedMetrics; playerId: string }) {
  const b = r.benchmark!;
  const notes: string[] = [];
  if (bm.attempts && r.attempts !== bm.attempts) notes.push(`Not a full benchmark: ${r.attempts} of ${bm.attempts} attempts, so it is left out of comparisons.`);
  if (bm.clockSeconds && b.clock_complete !== true) notes.push("The clock did not run its full length, so it is left out of comparisons.");
  if (bm.conditions.length && !b.conditions_complete) notes.push("The test conditions were not recorded, so it is only compared with other results like it.");
  if (b.redo > 0) notes.push(`Run again ${b.redo} time${b.redo === 1 ? "" : "s"} in this workout; the latest run is the result.`);
  if (r.tracking.adjusted) notes.push("You changed the totals after saving.");
  return (
    <div className="mt-2">
      {notes.length === 0 ? <p className="text-[11px] font-bold text-foreground-dim">Complete benchmark: comparable with your others.</p> : notes.map((n) => <p key={n} className="text-[11px] leading-relaxed text-foreground-dim">{n}</p>)}
      <a href={`/players/${playerId}/progress?view=benchmarks`} className="-mb-3 mt-1 inline-flex min-h-11 items-center text-[11px] font-extrabold uppercase tracking-[0.12em] text-accent">See your benchmark progress ›</a>
    </div>
  );
}
