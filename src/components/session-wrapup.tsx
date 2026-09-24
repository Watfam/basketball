"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSessionResults, type DrillResultInput } from "@/app/actions";
import { haptic } from "@/lib/haptics";

export type WrapupRow = DrillResultInput;

/**
 * The one screen for closing out a practice: catch up any drill that
 * carries a goal but never got a score logged live, write down what
 * actually happened, save. Used two ways — handed off from Run Practice
 * with whatever was already scored live, or opened directly from a saved
 * plan to back-fill a practice that was never run through the live
 * screen at all. Same screen either way, since the coach doesn't care
 * which path got them here.
 */
export function SessionWrapup({
  teamId,
  planId,
  planTitle,
  initialRunDate,
  initialResults,
  initialNotes = "",
  existingSessionId,
}: {
  teamId: string;
  planId: string | null;
  planTitle: string;
  initialRunDate: string;
  initialResults: WrapupRow[];
  initialNotes?: string;
  existingSessionId?: string;
}) {
  const router = useRouter();
  const [runDate, setRunDate] = useState(initialRunDate);
  const [results, setResults] = useState(initialResults);
  const [notes, setNotes] = useState(initialNotes);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function updateActual(index: number, value: string) {
    const parsed = value.trim() === "" ? null : Number(value);
    setResults((prev) =>
      prev.map((r, i) => (i === index ? { ...r, actual: Number.isNaN(parsed) ? null : parsed } : r))
    );
  }

  function save() {
    haptic("tap");
    setError(null);
    startTransition(async () => {
      const result = await saveSessionResults({
        sessionId: existingSessionId,
        teamId,
        planId,
        planTitle,
        runDate,
        notes: notes.trim() || null,
        results,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      haptic("success");
      router.push(`/teams/${teamId}/practice`);
    });
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-5">
      <button
        type="button"
        onClick={() => {
          haptic("tap");
          router.push(`/teams/${teamId}/practice`);
        }}
        className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim transition-colors hover:text-foreground"
      >
        ← Cancel, don&rsquo;t save
      </button>

      <section className="rounded-3xl border border-line bg-surface p-6">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-display text-xl uppercase leading-none tracking-wide text-foreground">
            {planTitle}
          </p>
          <input
            type="date"
            value={runDate}
            onChange={(e) => setRunDate(e.target.value)}
            className="rounded-lg border border-line bg-[var(--raised)] px-2.5 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none"
          />
        </div>

        {results.length === 0 ? (
          <p className="mt-4 text-sm text-foreground-dim">
            No drills in this plan have a goal set yet — add one from the builder (next to Minutes)
            to start tracking a score for it.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-line">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-2.5 py-2.5">
                <div
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${
                    r.actual !== null
                      ? "bg-[var(--data-positive)]/15 text-[var(--data-positive)]"
                      : "bg-[var(--raised)] text-foreground-mute"
                  }`}
                >
                  {r.actual !== null ? "✓" : "?"}
                </div>
                <span className="flex-1 text-sm font-semibold text-foreground">{r.label}</span>
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-foreground-mute">
                  Goal {r.goalTarget}
                  {r.goalUnit ? ` ${r.goalUnit}` : ""}
                </span>
                <input
                  type="number"
                  value={r.actual ?? ""}
                  onChange={(e) => updateActual(i, e.target.value)}
                  placeholder="—"
                  className="w-14 shrink-0 rounded-lg border border-line bg-[var(--raised)] px-1 py-1.5 text-center text-sm font-extrabold text-foreground placeholder:text-foreground-mute focus:border-accent focus:outline-none"
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-line bg-surface p-6">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent">
          Post-Practice Notes
        </p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={5}
          placeholder="What worked, what to fix next time..."
          className="mt-2 w-full rounded-lg border border-line bg-[var(--raised)] px-3 py-2 text-sm text-foreground placeholder:text-foreground-mute focus:border-accent focus:outline-none"
        />
      </section>

      {error && <p className="text-center text-sm text-red-400">{error}</p>}

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="w-full rounded-xl bg-accent py-3.5 text-sm font-extrabold uppercase tracking-[0.12em] text-white shadow-lg shadow-[var(--glow)] transition-colors hover:bg-accent-hover disabled:opacity-40"
      >
        {pending ? "Saving…" : "Save & Finish"}
      </button>
    </div>
  );
}
