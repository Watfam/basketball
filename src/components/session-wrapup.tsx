"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSessionResults, type DrillResultInput } from "@/app/actions";
import { haptic } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { FormError, Input, TextArea } from "@/components/ui/field";

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
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          haptic("tap");
          router.push(`/teams/${teamId}/practice`);
        }}
        className="-ml-3"
      >
        ← Cancel, don&rsquo;t save
      </Button>

      <section className="rounded-3xl border border-line bg-surface p-6">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-display text-xl uppercase leading-none tracking-wide text-foreground">
            {planTitle}
          </p>
          {/* Wrapped so the date field keeps its own width (Input is w-full). */}
          <div className="shrink-0">
            <Input type="date" value={runDate} onChange={(e) => setRunDate(e.target.value)} />
          </div>
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
                      : "bg-raised text-foreground-mute"
                  }`}
                >
                  {r.actual !== null ? "✓" : "?"}
                </div>
                <span className="flex-1 text-sm font-semibold text-foreground">{r.label}</span>
                <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-foreground-mute">
                  Goal {r.goalTarget}
                  {r.goalUnit ? ` ${r.goalUnit}` : ""}
                </span>
                <input
                  type="number"
                  value={r.actual ?? ""}
                  onChange={(e) => updateActual(i, e.target.value)}
                  placeholder="—"
                  className="w-14 shrink-0 rounded-lg border border-line bg-raised px-1 py-1.5 text-center text-sm font-extrabold text-foreground placeholder:text-foreground-mute focus:border-accent focus:outline-none"
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-line bg-surface p-6">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent">
          Post-Practice Notes
        </p>
        <TextArea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={5}
          placeholder="What worked, what to fix next time..."
          className="mt-2"
        />
      </section>

      {error && <FormError className="text-center">{error}</FormError>}

      <Button size="lg" block onClick={save} disabled={pending}>
        {pending ? "Saving…" : "Save & Finish"}
      </Button>
    </div>
  );
}
