"use client";

import { useEffect, useState } from "react";
import { haptic } from "@/lib/haptics";
import type { RunnableStep } from "@/lib/basketball/practice";
import { SessionWrapup, type WrapupRow } from "@/components/session-wrapup";

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
 *
 * Finishing (or ending early) doesn't leave the screen — it swaps into
 * the same wrap-up form Log Results uses on its own, pre-filled with
 * whatever was scored live, so nothing typed during practice is thrown
 * away for not reaching the last drill.
 */
export function PracticeRunner({
  teamId,
  planId,
  planTitle,
  steps,
  totalMinutes,
  lastResults = {},
}: {
  teamId: string;
  planId: string;
  planTitle: string;
  steps: RunnableStep[];
  totalMinutes: number;
  lastResults?: Record<string, number>;
}) {
  const [mode, setMode] = useState<"running" | "wrapup">("running");
  const [index, setIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(
    steps[0]?.minutes ? steps[0].minutes * 60 : null
  );
  const [paused, setPaused] = useState(false);
  const [scores, setScores] = useState<Record<number, string>>({});

  const step = steps[index];
  const next = steps[index + 1];
  const isLastStep = index === steps.length - 1;

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

  function finishOrAdvance() {
    if (isLastStep) {
      haptic("success");
      setMode("wrapup");
    } else {
      goTo(index + 1);
    }
  }

  function endPractice() {
    haptic("tap");
    setMode("wrapup");
  }

  if (mode === "wrapup") {
    const wrapupResults: WrapupRow[] = steps
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.goal?.target)
      .map(({ s, i }) => ({
        label: s.label,
        goalTarget: s.goal!.target,
        goalUnit: s.goal!.unit ?? null,
        actual: scores[i]?.trim() ? Number(scores[i]) : null,
      }));

    return (
      <div className="min-h-[100dvh] bg-background px-4 py-6 text-foreground sm:py-10">
        <SessionWrapup
          teamId={teamId}
          planId={planId}
          planTitle={planTitle}
          initialRunDate={new Date().toISOString().slice(0, 10)}
          initialResults={wrapupResults}
        />
      </div>
    );
  }

  const elapsedBeforeStep = steps.slice(0, index).reduce((sum, s) => sum + (s.minutes || 0), 0);
  const elapsedInStep = step?.minutes ? step.minutes - (secondsLeft ?? 0) / 60 : 0;
  const elapsedMinutes = Math.round(elapsedBeforeStep + elapsedInStep);
  const progressPct = totalMinutes > 0 ? Math.min(100, (elapsedMinutes / totalMinutes) * 100) : 0;
  const lastForStep = step ? lastResults[step.label] : undefined;

  return (
    <div className="theme-dark flex min-h-[100dvh] flex-col bg-background px-5 py-6 text-foreground">
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
                <p className="font-display mt-8 text-center text-7xl tabular-nums text-foreground">
                  {formatClock(secondsLeft)}
                </p>
                <p className="mt-1 text-center text-[10px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">
                  time on this drill
                </p>
              </>
            ) : (
              <div className="mt-8 rounded-2xl border border-line bg-surface p-5 text-center text-sm text-foreground-dim">
                No time set for this drill — tap Next when you&rsquo;re ready to move on.
              </div>
            )}

            {step.goal?.target ? (
              <div className="mt-5 rounded-2xl border border-line bg-surface p-3.5">
                <p className="text-[9.5px] font-extrabold uppercase tracking-wide text-foreground-mute">
                  Log the score — goal {step.goal.target}
                  {step.goal.unit ? ` ${step.goal.unit}` : ""}
                </p>
                <div className="mt-2 flex items-center gap-2.5">
                  <input
                    type="number"
                    value={scores[index] ?? ""}
                    onChange={(e) => setScores((prev) => ({ ...prev, [index]: e.target.value }))}
                    placeholder="—"
                    className="w-20 rounded-lg border border-[var(--line-strong)] bg-raised px-2 py-2 text-center font-display text-2xl text-foreground focus:border-accent focus:outline-none"
                  />
                  {step.goal.unit && (
                    <span className="text-xs font-bold text-foreground-mute">{step.goal.unit}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => haptic("success")}
                    className="ml-auto shrink-0 rounded-lg bg-accent px-3.5 py-2 text-[10.5px] font-extrabold uppercase tracking-wide text-white"
                  >
                    Save
                  </button>
                </div>
                {lastForStep !== undefined && (
                  <p className="mt-2 text-[11px] text-foreground-mute">
                    Last time:{" "}
                    <span className="font-extrabold text-[var(--data-positive)]">
                      {lastForStep}
                      {step.goal.unit ? ` ${step.goal.unit}` : ""}
                    </span>
                  </p>
                )}
              </div>
            ) : null}

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
                onClick={finishOrAdvance}
                className="flex-1 rounded-xl bg-raised py-4 text-[11px] font-extrabold uppercase tracking-wide text-foreground-dim"
              >
                {isLastStep ? "Finish" : "Next"}
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
