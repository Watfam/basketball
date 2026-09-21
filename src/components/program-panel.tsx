"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startProgramDay } from "@/app/actions";
import { ProgressRing } from "@/components/charts/progress-ring";
import { haptic } from "@/lib/haptics";
import type { ProgramProgress } from "@/lib/basketball/program";

/**
 * The program a player is currently on. This is the "you're on week 2,
 * day 3" view that replaces picking from a list — the plan decides what's
 * next, so the primary action is always the scheduled session.
 */
export function ProgramPanel({
  playerId,
  programName,
  weekCount,
  daysPerWeek,
  progress,
  nextWorkoutName,
}: {
  playerId: string;
  programName: string;
  weekCount: number;
  daysPerWeek: number;
  progress: ProgramProgress;
  nextWorkoutName: string | null;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const next = progress.nextDay;

  function start() {
    if (!next) return;
    haptic("tap");
    startTransition(async () => {
      const result = await startProgramDay(playerId, next.id);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.push(`/players/${playerId}/sessions/${result.sessionId}`);
    });
  }

  return (
    <section className="theme-dark hero-sheen panel-lit relative overflow-hidden rounded-3xl border border-line shadow-[var(--shadow-panel)]">
      <div className="court-lines absolute inset-0 opacity-60" aria-hidden />

      <div className="relative px-5 pt-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-accent">
              Your Program
            </p>
            <h2 className="font-display mt-1.5 text-2xl uppercase leading-[0.98] tracking-tight text-foreground">
              {programName}
            </h2>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-foreground-mute">
              {weekCount} weeks · {daysPerWeek} days a week
            </p>
          </div>

          <ProgressRing ratio={progress.ratio} size={74} stroke={6} idPrefix="prog">
            <span className="font-display text-xl leading-none text-foreground">
              {progress.completedCount}
              <span className="text-foreground-mute">/{progress.totalCount}</span>
            </span>
            <span className="mt-0.5 text-[8px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim">
              Days
            </span>
          </ProgressRing>
        </div>
      </div>

      {progress.isComplete ? (
        <div className="relative mt-4 border-t border-line px-5 py-5 text-center">
          <p className="font-display text-gradient-accent text-4xl uppercase leading-none">
            Block Complete
          </p>
          <p className="mt-2 text-sm text-foreground-dim">
            Every day logged. Retake the assessment to see what moved.
          </p>
        </div>
      ) : (
        next && (
          <div className="relative mt-4 border-t border-line px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--data-cyan)]">
                  Week {next.week_number} · Day {next.day_number}
                  {next.is_deload && " · Deload"}
                </p>
                <p className="mt-1 truncate text-sm font-bold text-foreground">
                  {nextWorkoutName ?? "Next session"}
                </p>
              </div>
            </div>

            {next.note && (
              <p className="mt-2.5 border-l-2 border-accent pl-3 text-xs leading-relaxed text-foreground-dim">
                {next.note}
              </p>
            )}

            <button
              type="button"
              onClick={start}
              disabled={pending}
              className="mt-4 w-full rounded-xl bg-accent py-3.5 text-sm font-extrabold uppercase tracking-[0.12em] text-white shadow-lg shadow-[var(--glow)] transition-colors hover:bg-accent-hover active:scale-[0.99] disabled:opacity-50"
            >
              {pending ? "Starting…" : "Start Today's Session"}
            </button>

            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
          </div>
        )
      )}

      <div className="relative border-t border-line">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full px-5 py-3 text-[10px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim transition-colors hover:text-foreground"
        >
          {expanded ? "Hide the plan" : "See the whole plan"}
        </button>

        {expanded && (
          <div className="space-y-3 px-5 pb-5">
            {progress.weeks.map((week) => (
              <div key={week.weekNumber}>
                <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">
                  Week {week.weekNumber}
                  {week.days.some((d) => d.is_deload) && " · Deload"}
                </p>
                <div className="flex gap-1.5">
                  {week.days.map((day) => {
                    const done = progress.completedDayIds.has(day.id);
                    const isNext = next?.id === day.id;
                    return (
                      <div
                        key={day.id}
                        title={`Week ${day.week_number}, day ${day.day_number}`}
                        className={`h-7 flex-1 rounded-md border text-center text-[10px] font-extrabold leading-[1.6rem] ${
                          done
                            ? "border-accent bg-accent text-white"
                            : isNext
                              ? "border-accent text-accent"
                              : "border-line bg-[var(--data-dim)] text-foreground-mute"
                        }`}
                      >
                        {day.day_number}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
