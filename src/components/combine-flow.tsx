"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitCombine } from "@/app/actions";
import {
  scoreToRating,
  parseScore,
  scoreUnit,
  formatScore,
  ratingsFromResults,
  BAND_LABELS,
  type CombineDrill,
} from "@/lib/basketball/combine";
import { RATING_CATEGORIES } from "@/lib/basketball/assessment";
import { computeOverall, type Ratings } from "@/lib/basketball/rating";
import { haptic } from "@/lib/haptics";

const CATEGORY_LABELS: Record<string, string> = {
  ball_handling: "Ball Handling",
  shooting: "Shooting",
  defense: "Defense",
  athleticism: "Athleticism",
};

/**
 * The measured combine: one test at a time, protocol on screen, enter the
 * number you actually got.
 *
 * Every test is skippable. A player with no cones, no tape measure or no
 * full court still gets a real result from what they could do, and the
 * categories they didn't measure keep their previous ratings rather than
 * being zeroed by absence.
 */
export function CombineFlow({
  playerId,
  playerName,
  drills,
  currentRatings,
  band,
  bandKnown,
}: {
  playerId: string;
  playerName: string;
  drills: CombineDrill[];
  currentRatings: Ratings;
  // Which benchmark table these scores are measured against.
  band: string;
  // False when age or gender was missing and the middle band was assumed.
  bandKnown: boolean;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const atReview = index >= drills.length;
  const drill = drills[index];

  const { ratings, perDrill } = ratingsFromResults(drills, scores, currentRatings, band);
  const recordedCount = Object.keys(scores).length;

  function record() {
    const value = parseScore(draft);
    if (value === null) {
      setError("Enter the number you got.");
      return;
    }
    if (drill.metric === "makes_of" && drill.attempts && value > drill.attempts) {
      setError(`Can't be more than ${drill.attempts}.`);
      return;
    }
    haptic("step");
    setError(null);
    setScores((prev) => ({ ...prev, [drill.id]: value }));
    setDraft("");
    setIndex((i) => i + 1);
  }

  function skip() {
    haptic("tap");
    setError(null);
    setDraft("");
    setIndex((i) => i + 1);
  }

  function back() {
    haptic("tap");
    setError(null);
    setDraft("");
    setIndex((i) => Math.max(0, i - 1));
  }

  function finish() {
    haptic("success");
    startTransition(async () => {
      const results = Object.entries(scores).map(([drillId, rawScore]) => ({
        drillId,
        rawScore,
        derivedRating: perDrill[drillId] ?? 1,
      }));
      const result = await submitCombine(playerId, ratings, results);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.push(`/players/${playerId}/assessments`);
    });
  }

  if (atReview) {
    return (
      <div className="mx-auto w-full max-w-md">
        <div className="panel-lit rounded-3xl border border-line bg-surface p-6">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent">
            Your results
          </p>
          <h2 className="font-display mt-2 text-3xl uppercase leading-[0.95] tracking-tight text-foreground">
            {recordedCount} of {drills.length} recorded
          </h2>

          <div className="mt-5 grid grid-cols-2 gap-px bg-line">
            {RATING_CATEGORIES.map((cat) => {
              const before = currentRatings[cat.value] ?? 0;
              const after = ratings[cat.value] ?? 0;
              const delta = after - before;
              return (
                <div key={cat.value} className="bg-surface px-4 py-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-wide text-foreground-dim">
                    {cat.label}
                  </p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="font-display text-3xl leading-none text-foreground">
                      {after}
                    </span>
                    {delta !== 0 && (
                      <span
                        className={`text-[11px] font-extrabold ${
                          delta > 0 ? "text-[var(--data-positive)]" : "text-foreground-mute"
                        }`}
                      >
                        {delta > 0 ? "+" : ""}
                        {delta}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3">
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-dim">
              Overall
            </span>
            <span className="font-display text-3xl leading-none text-accent">
              {computeOverall(ratings)}
            </span>
          </div>

          {recordedCount < drills.length && (
            <p className="mt-4 rounded-xl border border-dashed border-line px-4 py-3 text-xs leading-relaxed text-foreground-dim">
              You skipped {drills.length - recordedCount}. Those categories keep the ratings you
              already had — nothing gets marked down for a test you couldn&rsquo;t run.
            </p>
          )}

          <button
            type="button"
            onClick={finish}
            disabled={pending || recordedCount === 0}
            className="mt-5 w-full rounded-xl bg-accent py-3.5 text-sm font-extrabold uppercase tracking-[0.12em] text-white shadow-lg shadow-[var(--glow)] transition-colors hover:bg-accent-hover disabled:opacity-40 disabled:shadow-none"
          >
            {pending ? "Saving…" : "Save my combine"}
          </button>
          {recordedCount === 0 && (
            <p className="mt-2 text-center text-xs text-foreground-dim">
              Record at least one test to save.
            </p>
          )}
          {error && <p className="mt-2 text-center text-xs text-red-400">{error}</p>}

          <button
            type="button"
            onClick={back}
            className="mt-2 w-full text-center text-[11px] font-bold uppercase tracking-wide text-foreground-mute transition-colors hover:text-foreground-dim"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  const preview = parseScore(draft);
  const previewRating = preview !== null ? scoreToRating(drill, preview, band) : null;

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="font-display text-xl uppercase leading-none tracking-wide text-foreground">
          {playerName}
        </p>
        <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">
          Test {index + 1} of {drills.length}
        </span>
      </div>

      <div className="mb-5 flex items-center gap-1">
        {drills.map((d, i) => (
          <div
            key={d.id}
            className={`h-1 flex-1 rounded-full transition-colors ${
              scores[d.id] !== undefined
                ? "bg-accent"
                : i < index
                  ? "bg-[var(--line-strong)]"
                  : "bg-[var(--data-dim)]"
            }`}
          />
        ))}
      </div>

      {/* Named explicitly: a rating only means something if you know what
          it was measured against. */}
      <p className="mb-3 text-center text-[10px] font-bold uppercase tracking-wider text-foreground-mute">
        Scored against {BAND_LABELS[band] ?? band}
        {bandKnown ? "" : " — set age and gender for a closer match"}
      </p>

      <div className="panel-lit rounded-3xl border border-line bg-surface p-6">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent">
          {CATEGORY_LABELS[drill.category] ?? drill.category}
        </p>
        <h2 className="font-display mt-2 text-3xl uppercase leading-[0.95] tracking-tight text-foreground">
          {drill.name}
        </h2>

        {drill.setup && (
          <p className="mt-3 text-sm leading-relaxed text-foreground-dim">{drill.setup}</p>
        )}

        {(drill.equipment ?? []).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(drill.equipment ?? []).map((e) => (
              <span
                key={e}
                className="rounded-full border border-line bg-[var(--raised)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground-dim"
              >
                {e}
              </span>
            ))}
          </div>
        )}

        {(drill.cues ?? []).length > 0 && (
          <div className="mt-4 border-t border-line pt-4">
            <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-accent">
              Rules
            </p>
            <ul className="space-y-1.5">
              {(drill.cues ?? []).map((c) => (
                <li key={c} className="flex gap-2.5 text-sm leading-relaxed text-foreground">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 border-t border-line pt-4">
          <label
            htmlFor={`score-${drill.id}`}
            className="mb-2 block text-[10px] font-extrabold uppercase tracking-[0.18em] text-accent"
          >
            Your score — {scoreUnit(drill)}
          </label>
          <div className="flex items-center gap-3">
            <input
              id={`score-${drill.id}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              inputMode="decimal"
              placeholder={drill.metric === "seconds" ? "13.2" : "24"}
              className="w-full rounded-xl border border-line bg-[var(--raised)] px-3 py-3 font-display text-2xl text-foreground placeholder:text-foreground-mute focus:border-accent focus:outline-none"
            />
            {/* Live so a player sees what the number means before
                committing to it, rather than only at the end. */}
            {previewRating !== null && (
              <div className="shrink-0 text-right">
                <p className="font-display text-3xl leading-none text-accent">{previewRating}</p>
                <p className="text-[9px] font-extrabold uppercase tracking-wide text-foreground-mute">
                  / 10
                </p>
              </div>
            )}
          </div>

          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

          <button
            type="button"
            onClick={record}
            className="mt-4 w-full rounded-xl bg-accent py-3.5 text-sm font-extrabold uppercase tracking-[0.12em] text-white transition-colors hover:bg-accent-hover"
          >
            {index === drills.length - 1 ? "Record & review" : "Record & next"}
          </button>

          <div className="mt-2 flex justify-center gap-5">
            {index > 0 && (
              <button
                type="button"
                onClick={back}
                className="text-[11px] font-bold uppercase tracking-wide text-foreground-mute transition-colors hover:text-foreground-dim"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={skip}
              className="text-[11px] font-bold uppercase tracking-wide text-foreground-mute transition-colors hover:text-foreground-dim"
            >
              Can&rsquo;t do this one
            </button>
          </div>
        </div>
      </div>

      {scores[drill.id] !== undefined && (
        <p className="mt-3 text-center text-[11px] font-bold uppercase tracking-wide text-foreground-mute">
          Already recorded: {formatScore(drill, scores[drill.id])}
        </p>
      )}
    </div>
  );
}
