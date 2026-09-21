"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { submitAssessment } from "@/app/actions";
import { PRIMARY_POSITIONS } from "@/lib/basketball/taxonomy";
import {
  RATING_CATEGORIES,
  RATING_SCALE_MAX,
  STYLE_TAGS,
  computeArchetype,
  rankAssessmentGoals,
  type AssessmentAnswers,
  type RatingCategoryValue,
  type StyleTagValue,
} from "@/lib/basketball/assessment";
import { haptic } from "@/lib/haptics";
import { PlayerCard } from "@/components/player-card";

type StepKind = "position" | "style" | "ratings" | "goal";

type Props = {
  playerId: string;
  playerName: string;
  initialPosition: string | null;
  // A retest carries the previous answers in as the starting point, so
  // the player adjusts what changed instead of re-entering everything
  // from zero — which is both less work and a more honest comparison,
  // since a blank slate invites a different anchor every time.
  isRetest?: boolean;
  previousRatings?: Record<RatingCategoryValue, number> | null;
  previousStyleTags?: StyleTagValue[] | null;
  previousGoal?: string | null;
};

export function AssessmentFlow({
  playerId,
  playerName,
  initialPosition,
  isRetest = false,
  previousRatings = null,
  previousStyleTags = null,
  previousGoal = null,
}: Props) {
  const router = useRouter();

  // Position is often already answered during "Set up your family" — skip
  // re-asking it here unless it's genuinely unset (or, defensively, set to
  // a value that isn't one of the current position options).
  const positionAlreadyKnown = PRIMARY_POSITIONS.some((p) => p.value === initialPosition);
  const steps = useMemo<StepKind[]>(
    () => (positionAlreadyKnown ? ["style", "ratings", "goal"] : ["position", "style", "ratings", "goal"]),
    [positionAlreadyKnown]
  );
  const STEP_COUNT = steps.length;

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [primaryPosition, setPrimaryPosition] = useState(initialPosition ?? "");
  const [styleTags, setStyleTags] = useState<StyleTagValue[]>(previousStyleTags ?? []);
  const [ratings, setRatings] = useState<Record<RatingCategoryValue, number>>(
    previousRatings ?? {
      ball_handling: 0,
      shooting: 0,
      defense: 0,
      athleticism: 0,
    }
  );
  const [goal, setGoal] = useState(previousGoal ?? "");

  const currentStep = steps[step];

  // Reorders (never filters) the goal list toward what's most relevant to
  // this player's position and weakest self-ratings once those are known —
  // see rankAssessmentGoals for why nothing is ever hidden outright.
  const rankedGoals = useMemo(
    () => rankAssessmentGoals(primaryPosition, ratings),
    [primaryPosition, ratings]
  );

  const canAdvance = useMemo(() => {
    if (currentStep === "position") return primaryPosition !== "";
    if (currentStep === "style") return styleTags.length > 0;
    if (currentStep === "ratings") return Object.values(ratings).every((v) => v > 0);
    if (currentStep === "goal") return goal !== "";
    return true;
  }, [currentStep, primaryPosition, styleTags, ratings, goal]);

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
      const result = await submitAssessment(playerId, answers, isRetest ? "checkin" : "onboarding");
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
        // A retest lands back on the hub, where the attribute radar draws
        // the previous values underneath the new ones — that before/after
        // is the whole point of retesting.
        onContinue={() => router.push(isRetest ? `/players/${playerId}` : "/")}
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

      {/*
        No AnimatePresence here on purpose: its exit-then-enter sequencing
        (mode="wait") can stall on a slow/interrupted exit animation and
        strand the UI on the previous step even after React state has
        already moved on — a real risk with kids tapping through fast.
        Keying on `step` still gives each step its own entrance animation;
        React just swaps the DOM immediately on key change instead of
        waiting for anything to finish first.
      */}
      <motion.div
        key={step}
        initial={{ opacity: 0, x: direction * 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="court-glow rounded-3xl border border-line bg-surface p-6 sm:p-8"
        >
          {currentStep === "position" && (
            <StepShell
              eyebrow={isRetest ? "Retest" : `${playerName}'s assessment`}
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

          {currentStep === "style" && (
            <StepShell
              eyebrow={isRetest ? "Retest" : `${playerName}'s assessment`}
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

          {currentStep === "ratings" && (
            <StepShell
              eyebrow={isRetest ? "Retest · Self-scout" : "Self-scout"}
              title={isRetest ? "Rate yourself again" : "Rate yourself, honestly"}
              subtitle={isRetest ? "These start where you left them. Move only what actually changed." : undefined}
            >
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

          {currentStep === "goal" && (
            <StepShell eyebrow="Almost there" title="What's your #1 goal this year?">
              <div className="space-y-2.5">
                {rankedGoals.map((g) => (
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
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.82, rotate: -4 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 20 }}
        className="w-full"
      >
        <PlayerCard
          playerName={playerName}
          archetype={archetype}
          primaryPosition={primaryPosition}
          styleTags={styleTags}
          ratings={ratings}
          animateBars
        />
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
