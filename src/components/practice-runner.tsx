"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { haptic } from "@/lib/haptics";
import type { RunnableStep } from "@/lib/basketball/practice";

function formatClock(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * The on-court counterpart to the builder: full screen, one drill at a
 * time, big enough to read at a glance with a whistle in your other
 * hand. Same shape as the player-facing Session Player, pointed at a
 * coach running a team practice instead of a player running a workout —
 * Prev/Next rather than auto-advance, since only the coach knows when a
 * drill is actually done.
 */
export function PracticeRunner({
  teamId,
  planId,
  steps,
  totalMinutes,
}: {
  teamId: string;
  planId: string;
  steps: RunnableStep[];
  totalMinutes: number;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(
    steps[0]?.minutes ? steps[0].minutes * 60 : null
  );
  const [paused, setPaused] = useState(false);

  const step = steps[index];
  const next = steps[index + 1];

  // Resetting the clock when the coach moves to a new drill is "state
  // that depends on a changed value," not a sync with anything external —
  // React's own guidance is to adjust it during render, by comparing
  // against the last index seen, rather than in an effect.
  const [seenIndex, setSeenIndex] = useState(index);
  if (index !== seenIndex) {
    setSeenIndex(index);
    setSecondsLeft(step?.minutes ? step.minutes * 60 : null);
    setPaused(false);
  }

  useEffect(() => {
    if (paused || secondsLeft === null || secondsLeft <= 0) return;
    const id = setTimeout(() => {
      setSecondsLeft((s) => (s === null ? s : s - 1));
    }, 1000);
    return () => clearTimeout(id);
  }, [paused, secondsLeft]);

  useEffect(() => {
    if (secondsLeft === 10) haptic("tap");
    if (secondsLeft === 0) haptic("success");
  }, [secondsLeft]);

  function goTo(i: number) {
    haptic("tap");
    setIndex(Math.max(0, Math.min(steps.length - 1, i)));
  }

  function endPractice() {
    haptic("success");
    router.push(`/teams/${teamId}/practice/${planId}`);
  }

  const elapsedBeforeStep = steps
    .slice(0, index)
    .reduce((sum, s) => sum + (s.minutes || 0), 0);
  const elapsedInStep = step?.minutes ? step.minutes - (secondsLeft ?? 0) / 60 : 0;
  const elapsedMinutes = Math.round(elapsedBeforeStep + elapsedInStep);
  const progressPct = totalMinutes > 0 ? Math.min(100, (elapsedMinutes / totalMinutes) * 100) : 0;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background px-5 py-6 text-foreground">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={endPractice}
            className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim transition-colors hover:text-foreground"
          >
            ← End practice
          </button>
          <span className="text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute">
            {elapsedMinutes} / {totalMinutes} MIN
          </span>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-raised">
          <div
            className="h-full rounded-full bg-accent transition-[width]"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {step ? (
          <>
            {step.groupName && (
              <p className="mt-10 text-[11px] font-extrabold uppercase tracking-[0.14em] text-accent">
                {step.groupName}
              </p>
            )}
            <h1
              className={`font-display text-4xl uppercase leading-tight text-foreground ${
                step.groupName ? "mt-2" : "mt-10"
              }`}
            >
              {step.label}
            </h1>
            <p className="mt-2 text-xs font-bold uppercase tracking-wide text-foreground-mute">
              Drill {index + 1} of {steps.length}
              {next ? ` · Next: ${next.label}` : ""}
            </p>

            {secondsLeft !== null ? (
              <>
                <p className="font-display mt-10 text-center text-7xl tabular-nums text-foreground">
                  {formatClock(secondsLeft)}
                </p>
                <p className="mt-1 text-center text-[10px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">
                  time on this drill
                </p>
              </>
            ) : (
              <div className="mt-10 rounded-2xl border border-line bg-surface p-5 text-center text-sm text-foreground-dim">
                No time set for this drill — tap Next when you&rsquo;re ready to move on.
              </div>
            )}

            {step.notes && (
              <p className="mt-4 rounded-xl bg-raised p-3 text-xs leading-relaxed text-foreground-dim">
                {step.notes}
              </p>
            )}

            <div className="mt-auto flex gap-2.5 pt-8">
              <button
                type="button"
                onClick={() => goTo(index - 1)}
                disabled={index === 0}
                className="flex-1 rounded-xl bg-raised py-4 text-[11px] font-extrabold uppercase tracking-wide text-foreground-dim transition-opacity disabled:opacity-30"
              >
                Prev
              </button>
              {secondsLeft !== null && (
                <button
                  type="button"
                  onClick={() => {
                    haptic("tap");
                    setPaused((p) => !p);
                  }}
                  className="flex-[1.4] rounded-xl bg-accent py-4 text-[11px] font-extrabold uppercase tracking-wide text-white"
                >
                  {paused ? "Resume" : "Pause"}
                </button>
              )}
              <button
                type="button"
                onClick={() => goTo(index + 1)}
                disabled={index === steps.length - 1}
                className="flex-1 rounded-xl bg-raised py-4 text-[11px] font-extrabold uppercase tracking-wide text-foreground-dim transition-opacity disabled:opacity-30"
              >
                Next
              </button>
            </div>
          </>
        ) : (
          <div className="mt-16 flex flex-1 flex-col items-center justify-center text-center">
            <p className="font-display text-2xl uppercase text-foreground">Nothing to run</p>
            <p className="mt-2 max-w-xs text-sm text-foreground-dim">
              Add a drill to this plan before starting practice.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
