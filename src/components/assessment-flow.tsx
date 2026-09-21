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
import { attributeTier } from "@/lib/basketball/rating";
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
      <div className="mb-3 flex items-baseline justify-between">
        <p className="font-display text-xl uppercase leading-none tracking-wide text-foreground">
          {isRetest ? "Retest" : playerName}
        </p>
        <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">
          Step {step + 1} of {STEP_COUNT}
        </span>
      </div>

      <div className="mb-5 flex items-center gap-1.5">
        {Array.from({ length: STEP_COUNT }).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= step ? "bg-accent" : "bg-[var(--data-dim)]"
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
        className="panel-lit rounded-3xl border border-line bg-surface p-6 shadow-[var(--shadow-panel)] sm:p-7"
        >
          {currentStep === "position" && (
            <StepShell
              eyebrow="Position"
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
              eyebrow="Your game"
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
              eyebrow="Self-scout"
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

      <div className="mt-4 flex gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={goBack}
            className="rounded-xl border border-line px-5 py-3.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-foreground-dim transition-colors hover:text-foreground"
          >
            Back
          </button>
        )}
        <button
          type="button"
          disabled={!canAdvance || pending}
          onClick={goNext}
          className="flex-1 rounded-xl bg-accent px-4 py-3.5 text-sm font-extrabold uppercase tracking-[0.12em] text-white shadow-lg shadow-[var(--glow)] transition-colors hover:bg-accent-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          {pending
            ? "Building your card…"
            : step === STEP_COUNT - 1
              ? isRetest
                ? "See what moved"
                : "Reveal my Player Card"
              : "Next"}
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
      <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent">{eyebrow}</p>
      <h2 className="font-display mt-2 text-3xl uppercase leading-[0.95] tracking-tight text-foreground">
        {title}
      </h2>
      {subtitle && <p className="mt-2 text-sm leading-relaxed text-foreground-dim">{subtitle}</p>}
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
      className={`relative rounded-xl border px-3.5 py-3 text-left transition-colors ${
        wide ? "w-full" : ""
      } ${
        selected
          ? "border-accent bg-accent/10"
          : "border-line bg-[var(--raised)] hover:border-accent/50"
      }`}
    >
      <p
        className={`text-sm font-bold leading-tight ${
          selected ? "text-accent" : "text-foreground"
        }`}
      >
        {label}
      </p>
      {blurb && (
        <p className="mt-1 text-xs leading-snug text-foreground-dim">{blurb}</p>
      )}
    </button>
  );
}

const TIER_COPY: Record<ReturnType<typeof attributeTier>, string> = {
  elite: "Elite",
  high: "Strong",
  mid: "Solid",
  low: "Building",
};

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
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-foreground-dim">
          {label}
        </span>
        <span className="flex items-baseline gap-1.5">
          {/* The word matters more than the number to a kid deciding
              between a 6 and a 7 — "Solid" vs "Strong" is a judgement
              they can actually make. */}
          {value > 0 && (
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-accent">
              {TIER_COPY[attributeTier(value)]}
            </span>
          )}
          <span className="font-display text-2xl leading-none text-foreground">
            {value > 0 ? value : "—"}
          </span>
          <span className="text-[10px] font-bold text-foreground-mute">/{RATING_SCALE_MAX}</span>
        </span>
      </div>

      {/* One row of ten rather than a 5-wide grid wrapping to two rows:
          a 1-10 scale should look like a single scale. */}
      <div className="mt-2 flex gap-1">
        {Array.from({ length: RATING_SCALE_MAX }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${label} ${n} out of ${RATING_SCALE_MAX}`}
            onClick={() => onChange(n)}
            className={`h-9 flex-1 rounded-md border text-[10px] font-extrabold transition-colors ${
              n <= value
                ? "border-accent bg-accent text-white"
                : "border-line bg-[var(--raised)] text-foreground-mute hover:border-accent/50"
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
        className="mt-5 text-center text-sm leading-relaxed text-foreground-dim"
      >
        Every workout, program and film lesson gets matched to this card — and it moves when you
        rate yourself again.
      </motion.p>

      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        type="button"
        onClick={onContinue}
        className="mt-4 w-full rounded-xl bg-accent px-4 py-3.5 text-sm font-extrabold uppercase tracking-[0.12em] text-white shadow-lg shadow-[var(--glow)] transition-colors hover:bg-accent-hover active:scale-[0.99]"
      >
        Enter Hardwood Lab
      </motion.button>
    </div>
  );
}
