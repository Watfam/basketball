"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adjustDrillResult } from "@/app/actions";
import { describeHow, type TrackedMetrics } from "@/lib/basketball/drill-tracking";
import { trackingPath } from "@/lib/basketball/drill-context";
import type { TrackingInfo } from "@/lib/basketball/drill-session-view";
import { haptic } from "@/lib/haptics";
import { Button } from "@/components/ui/button";

/**
 * The optional "Track with Camera" step on a shooting drill's card, and the result that comes back to it. The drill can still be done without it:
 * nothing here replaces the sets, the timer, or Skip. The result is stated as what it is: counted by the camera or by taps, and the kind of
 * shot comes from the drill, not from the picture.
 */
export function DrillTrackingPanel({
  playerId, sessionId, entryId, tracking, result, onResult, onNext, nextLabel,
}: {
  playerId: string;
  sessionId: string;
  entryId: string;
  tracking: TrackingInfo;
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
        <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-foreground-mute">{tracking.categoryLabel} · optional</p>
        <Button variant="secondary" size="md" block onClick={go} className="mt-2">Track with Camera</Button>
        <p className="mt-2 text-[11px] leading-relaxed text-foreground-mute">
          The camera counts your makes and attempts{tracking.goal ? ` (${tracking.goal.kind === "time" ? `${tracking.goal.target} seconds` : `${tracking.goal.target} shots`})` : ""} and you can fix any it gets wrong. You can do this drill without it.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-xl border border-accent/40 bg-accent/5 px-3.5 py-3" aria-label="Tracked result">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-accent">Tracked · {tracking.categoryLabel}</p>
      <p className="mt-1 font-display text-3xl leading-none text-foreground">
        {result.makes}<span className="text-foreground-mute"> of {result.attempts}</span>
        <span className="ml-2 text-base text-foreground-dim">{result.attempts > 0 ? `${Math.round((100 * result.makes) / result.attempts)}%` : ""}</span>
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-foreground-dim">{describeHow(result.tracking)}</p>
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
          <Button variant="ghost" size="sm" onClick={go}>Track again</Button>
        </div>
      )}
      {onNext && !editing && <Button size="md" block onClick={onNext} className="mt-3">{nextLabel ?? "Next drill"}</Button>}
    </div>
  );
}
