"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { submitAssessment } from "@/app/actions";
import { PRIMARY_POSITIONS } from "@/lib/basketball/taxonomy";
import {
  ASSESSMENT_GOALS,
  RATING_CATEGORIES,
  RATING_SCALE_MAX,
  STYLE_TAGS,
  computeArchetype,
  type AssessmentAnswers,
  type RatingCategoryValue,
  type StyleTagValue,
} from "@/lib/basketball/assessment";
import { haptic } from "@/lib/haptics";

const STEP_COUNT = 4; // position, style, ratings, goal — reveal is separate.

type Props = {
  playerId: string;
  playerName: string;
  initialPosition: string | null;
};

export function AssessmentFlow({ playerId, playerName, initialPosition }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [primaryPosition, setPrimaryPosition] = useState(initialPosition ?? "");
  const [styleTags, setStyleTags] = useState<StyleTagValue[]>([]);
  const [ratings, setRatings] = useState<Record<RatingCategoryValue, number>>({
    ball_handling: 0,
    shooting: 0,
    defense: 0,
    athleticism: 0,
  });
  const [goal, setGoal] = useState("");

  const canAdvance = useMemo(() => {
    if (step === 0) return primaryPosition !== "";
    if (step === 1) return styleTags.length > 0;
    if (step === 2) return Object.values(ratings).every((v) => v > 0);
    if (step === 3) return goal !== "";
    return true;
  }, [step, primaryPosition, styleTags, ratings, goal]);

  function goNext() {
    haptic("step");
    if (step < STEP_COUNT - 1) {
      setDirection(1);
      setStep((s) => s + 1);
      return;
    }
    // Final step — submit.
    const answers: AssessmentAnswers = { primary_position: primaryPosition, style_tags: styleTags, ratings, goal };
    startTransition(async () => {
      const result = await submitAssessment(playerId, answers);
      if (result?.error) {
        setError(result.error);
        return;
      }
      haptic("success");
      setRevealed(true);
    });
  }

  function goBack() {
    if (step === 0) return;
    haptic("tap");
    setDirection(-1);
    setStep((s) => s - 1);
  }

  if (revealed) {
    return (
      <PlayerCardReveal
        playerName={playerName}
        archetype={computeArchetype(primaryPosition, styleTags)}
        primaryPosition={primaryPosition}
        styleTags={styleTags}
        ratings={ratings}
        onContinue={() => router.push("/")}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-6 flex items-center gap-2">
        {Array.from({ length: STEP_COUNT }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= step ? "bg-accent" : "bg-line"
            }`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={step}
          custom={direction}
          initial={{ opacity: 0, x: direction * 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction * -24 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="court-glow rounded-3xl border border-line bg-surface p-6 sm:p-8"
        >
          {step === 0 && (
            <StepShell
              eyebrow={`${playerName}'s assessment`}
              title="What position do you play most?"
            >
              <div className="grid grid-cols-2 gap-2.5">
                {PRIMARY_POSITIONS.map((p) => (
                  <ChoiceCard
                    key={p.value}
                    label={p.label}
                    selected={primaryPosition === p.value}
                    onClick={() => {
                      haptic("tap");
                      setPrimaryPosition(p.value);
                    }}
                  />
                ))}
              </div>
            </StepShell>
          )}

          {step === 1 && (
            <StepShell
              eyebrow="Playing style"
              title="How would you describe your game?"
              subtitle="Pick up to 2 — this shapes your Player Card and every workout we curate."
            >
              <div className="grid grid-cols-2 gap-2.5">
                {STYLE_TAGS.map((tag) => (
                  <ChoiceCard
                    key={tag.value}
                    label={tag.label}
                    blurb={tag.blurb}
                    selected={styleTags.includes(tag.value)}
                    onClick={() => {
                      haptic("tap");
                      setStyleTags((prev) =>
                        prev.includes(tag.value)
                          ? prev.filter((t) => t !== tag.value)
                          : prev.length < 2
                            ? [...prev, tag.value]
                            : [prev[1], tag.value]
                      );
                    }}
                  />
                ))}
              </div>
            </StepShell>
          )}

          {step === 2 && (
            <StepShell eyebrow="Self-scout" title="Rate yourself, honestly">
              <div className="space-y-5">
                {RATING_CATEGORIES.map((cat) => (
                  <RatingRow
                    key={cat.value}
                    label={cat.label}
                    value={ratings[cat.value]}
                    onChange={(v) => {
                      haptic("tap");
                      setRatings((prev) => ({ ...prev, [cat.value]: v }));
                    }}
                  />
                ))}
              </div>
            </StepShell>
          )}

          {step === 3 && (
            <StepShell eyebrow="Almost there" title="What's your #1 goal this year?">
              <div className="space-y-2.5">
                {ASSESSMENT_GOALS.map((g) => (
                  <ChoiceCard
                    key={g.value}
                    label={g.label}
                    wide
                    selected={goal === g.value}
                    onClick={() => {
                      haptic("tap");
                      setGoal(g.value);
                    }}
                  />
                ))}
              </div>
            </StepShell>
          )}
        </motion.div>
      </AnimatePresence>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      <div className="mt-5 flex gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={goBack}
            className="rounded-xl px-4 py-3 text-sm font-semibold text-foreground-dim hover:text-foreground"
          >
            Back
          </button>
        )}
        <button
          type="button"
          disabled={!canAdvance || pending}
          onClick={goNext}
          className="flex-1 rounded-xl bg-accent px-4 py-3.5 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Building your card…" : step === STEP_COUNT - 1 ? "Reveal my Player Card" : "Next"}
        </button>
      </div>
    </div>
  );
}

function StepShell({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">{eyebrow}</p>
      <h2 className="mt-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-foreground-dim">{subtitle}</p>}
      <div className="mt-6">{children}</div>
    </div>
  );
}

function ChoiceCard({
  label,
  blurb,
  selected,
  onClick,
  wide,
}: {
  label: string;
  blurb?: string;
  selected: boolean;
  onClick: () => void;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3.5 py-3 text-left transition-colors ${
        wide ? "w-full" : ""
      } ${
        selected
          ? "border-accent bg-accent/15 text-foreground"
          : "border-line bg-elevated text-foreground-dim hover:border-accent/50 hover:text-foreground"
      }`}
    >
      <p className="text-sm font-semibold">{label}</p>
      {blurb && <p className="mt-0.5 text-xs text-foreground-dim">{blurb}</p>}
    </button>
  );
}

function RatingRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <div className="mt-2 grid grid-cols-5 gap-1.5">
        {Array.from({ length: RATING_SCALE_MAX }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`h-8 rounded-lg border text-xs font-bold transition-colors ${
              n <= value
                ? "border-accent bg-accent text-white"
                : "border-line bg-elevated text-foreground-dim hover:border-accent/50"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function PlayerCardReveal({
  playerName,
  archetype,
  primaryPosition,
  styleTags,
  ratings,
  onContinue,
}: {
  playerName: string;
  archetype: string;
  primaryPosition: string;
  styleTags: StyleTagValue[];
  ratings: Record<RatingCategoryValue, number>;
  onContinue: () => void;
}) {
  const positionLabel = PRIMARY_POSITIONS.find((p) => p.value === primaryPosition)?.label ?? "";

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.82, rotate: -4 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 20 }}
        className="court-glow relative w-full overflow-hidden rounded-3xl border-2 border-accent bg-elevated p-6 shadow-2xl sm:p-8"
      >
        <div className="flex items-start justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Player Card</p>
          <span className="rounded-full border border-accent px-3 py-1 text-xs font-bold uppercase text-accent">
            {positionLabel}
          </span>
        </div>

        <h2 className="mt-4 text-2xl font-extrabold leading-tight tracking-tight text-foreground sm:text-3xl">
          {archetype}
        </h2>
        <p className="mt-1 text-sm font-medium text-foreground-dim">{playerName}</p>

        <div className="mt-6 space-y-3">
          {RATING_CATEGORIES.map((cat) => (
            <div key={cat.value}>
              <div className="flex items-center justify-between text-xs font-semibold text-foreground-dim">
                <span>{cat.label}</span>
                <span>{ratings[cat.value]}/{RATING_SCALE_MAX}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(ratings[cat.value] / RATING_SCALE_MAX) * 100}%` }}
                  transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
                  className="h-full rounded-full bg-accent"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {styleTags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-foreground-dim"
            >
              {STYLE_TAGS.find((t) => t.value === tag)?.label}
            </span>
          ))}
        </div>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-5 text-center text-sm text-foreground-dim"
      >
        Your Player Card evolves as you train — workouts and film below are matched to it.
      </motion.p>

      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        type="button"
        onClick={onContinue}
        className="mt-4 w-full rounded-xl bg-accent px-4 py-3.5 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-accent-hover"
      >
        Enter Hardwood Lab
      </motion.button>
    </div>
  );
}
