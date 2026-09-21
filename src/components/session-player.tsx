"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  completeWorkoutSession,
  discardWorkoutSession,
  logDrillProgress,
} from "@/app/actions";
import { ProgressRing } from "@/components/charts/progress-ring";
import { DrillInstructions } from "@/components/drill-instructions";
import {
  resolvePrescription,
  BLOCK_LABELS,
  type LevelTarget,
} from "@/lib/basketball/prescription";
import { isWatchableUrl } from "@/lib/basketball/film";
import type { SkillLevel } from "@/lib/basketball/assessment";
import { haptic } from "@/lib/haptics";

type Drill = {
  id: string;
  name: string;
  description: string | null;
  video_url: string | null;
  source_trainer: string | null;
  setup: string | null;
  cues: string[] | null;
  common_mistakes: string[] | null;
  equipment: string[] | null;
  // Film that teaches this drill. Film at the moment of doing is the
  // highest-value place it can appear — a cue you read thirty seconds
  // before the rep is a cue you might actually apply.
  film_resources?: {
    id: string;
    title: string;
    watch_for: string[] | null;
    url: string | null;
    notes: string | null;
  }[];
};

export type SessionDrill = {
  // The workout_drills row id. A drill can now appear more than once in a
  // workout ("right side", then "left side"), so drill_id is no longer
  // unique within a session and can't be used as a key.
  id: string;
  drill_id: string;
  sort_order: number;
  block: string | null;
  variant_label: string | null;
  levels: string[] | null;
  level_targets: Record<string, LevelTarget> | null;
  target_sets: number | null;
  target_reps: number | null;
  target_duration_seconds: number | null;
  drills: Drill | null;
};

type DrillLog = {
  drill_id: string;
  workout_drill_id: string;
  metrics: Record<string, unknown>;
};

type Props = {
  playerId: string;
  sessionId: string;
  workoutName: string;
  drills: SessionDrill[];
  // Drives both which variation of a slot the player gets and how the
  // sets/reps scale — see lib/basketball/prescription.ts.
  level: SkillLevel;
  // Week-over-week progression when this session is part of a program.
  volumeStep: number;
  // "Week 3 · Day 2" when this session came from a program schedule.
  programLabel?: string | null;
  // A planned lighter day. Said out loud so a shorter session reads as
  // the plan working rather than something being wrong.
  isDeload?: boolean;
  alreadyCompleted: boolean;
  // workout_drills entry ids already logged in a previous visit to this
  // session — lets a player leave mid-workout and pick back up later
  // instead of losing progress or redoing what they already did.
  initialLoggedEntryIds: string[];
};

/**
 * All drills render permanently, side by side, in a scroll-snap track —
 * the same technique as the hub's workout carousel. "Advancing" (whether
 * auto-triggered by finishing a drill, or a manual swipe to peek ahead or
 * review a previous one) is just scrolling; nothing ever mounts or
 * unmounts. That matters because the previous version swapped one
 * drill's JSX in and out via React state, and every framer-motion
 * exit-animation approach tried for that (mode="wait", mode="popLayout")
 * turned out to be unreliable in this stack — confirmed stuck screens in
 * a real production build. Scroll-snap has no exit-animation state to
 * get stuck in, and as a bonus a drill's own progress now survives being
 * scrolled away from and back to, since it's never torn down.
 */
export function SessionPlayer({
  playerId,
  sessionId,
  workoutName,
  drills,
  level,
  volumeStep,
  programLabel = null,
  isDeload = false,
  alreadyCompleted,
  initialLoggedEntryIds,
}: Props) {
  const router = useRouter();
  const scrollerRef = useRef<HTMLDivElement>(null);

  const initialCompleted = useMemo(() => {
    const loggedIds = new Set(initialLoggedEntryIds);
    const indexes = new Set<number>();
    drills.forEach((d, i) => {
      if (loggedIds.has(d.id)) indexes.add(i);
    });
    return indexes;
  }, [drills, initialLoggedEntryIds]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [completed, setCompleted] = useState<Set<number>>(initialCompleted);
  const [progressByIndex, setProgressByIndex] = useState<Record<number, number>>({});
  const [finished, setFinished] = useState(alreadyCompleted);
  const [finishConfirming, setFinishConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Resuming a session that already has some drills logged — jump
  // straight to the first one that isn't done yet instead of starting
  // back at drill 1.
  useEffect(() => {
    if (initialCompleted.size === 0) return;
    const nextIndex = drills.findIndex((_, i) => !initialCompleted.has(i));
    if (nextIndex > 0) {
      requestAnimationFrame(() => {
        const el = scrollerRef.current;
        if (!el) return;
        el.scrollTo({ left: nextIndex * el.clientWidth, behavior: "instant" });
        setActiveIndex(nextIndex);
      });
    }
    // Only on mount — this is a one-time "where was I" jump, not something
    // that should re-fire as completed/drills change during the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleScroll() {
    const el = scrollerRef.current;
    if (!el || el.clientWidth === 0) return;
    setActiveIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  function scrollToIndex(i: number) {
    const el = scrollerRef.current;
    if (!el) return;
    const target = i * el.clientWidth;
    el.scrollTo({ left: target, behavior: "smooth" });
    // Safety net: some environments silently no-op a smooth scrollTo
    // (confirmed happening under rAF-throttled/backgrounded conditions)
    // rather than animating it. Without this, a drill could get marked
    // complete while the view stays stuck on it. Force-correct if the
    // smooth scroll didn't actually land after a beat.
    setTimeout(() => {
      if (Math.abs(el.scrollLeft - target) > 2) {
        el.scrollTo({ left: target, behavior: "instant" });
      }
    }, 400);
  }

  function finishSession() {
    startTransition(async () => {
      const result = await completeWorkoutSession(sessionId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      haptic("success");
      setFinished(true);
    });
  }

  function handleDrillComplete(index: number, log: DrillLog) {
    const nextCompleted = new Set(completed).add(index);
    setCompleted(nextCompleted);
    haptic("step");

    // Fire-and-forget: saved immediately so progress survives leaving
    // mid-workout, without making every drill wait on a network round
    // trip before it can advance.
    logDrillProgress(sessionId, log.drill_id, log.metrics, log.workout_drill_id).then((result) => {
      if (result?.error) setError(result.error);
    });

    if (nextCompleted.size < drills.length) {
      // Jump to the next not-yet-done drill — usually index + 1, but if
      // drills were done out of order (swiped ahead, did that one first)
      // this finds whatever's actually left.
      const nextIndex = drills.findIndex((_, i) => !nextCompleted.has(i));
      if (nextIndex !== -1) scrollToIndex(nextIndex);
      return;
    }

    // Every drill is done, regardless of the order they were done in.
    finishSession();
  }

  // Leaving without having logged anything throws the session away
  // instead of saving an empty one. An empty session isn't progress, and
  // keeping it clutters history and inflates every stat built on session
  // counts. Anything already logged means we keep it and just exit.
  function exitSession() {
    haptic("tap");
    startTransition(async () => {
      if (completed.size === 0) await discardWorkoutSession(sessionId);
      router.push(`/players/${playerId}`);
    });
  }

  function skipActiveDrill() {
    if (completed.has(activeIndex)) return;
    haptic("tap");
    const drill = drills[activeIndex];
    handleDrillComplete(activeIndex, {
      drill_id: drill.drill_id,
      workout_drill_id: drill.id,
      metrics: { skipped: true, variant: drill.variant_label },
    });
  }

  if (finished) {
    return (
      <SessionComplete
        workoutName={workoutName}
        loggedCount={completed.size}
        totalCount={drills.length}
        onDone={() => router.push(`/players/${playerId}`)}
      />
    );
  }

  if (drills.length === 0) {
    return (
      <div className="mx-auto w-full max-w-md text-center text-sm text-foreground-dim">
        This workout has no drills yet.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <button
          type="button"
          onClick={exitSession}
          disabled={pending}
          className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim transition-colors hover:text-foreground disabled:opacity-50"
        >
          {/* Two different exits behind one control, because the right
              behaviour depends on whether any work happened. Nothing
              logged: the session is discarded outright. Something logged:
              it stays resumable from the hub's Continue banner, since
              every drill is saved the moment it's finished. */}
          {completed.size === 0 ? "← Cancel" : "← Save & exit"}
        </button>
        <span className="truncate text-[11px] font-bold uppercase tracking-wider text-foreground-mute">
          {programLabel ?? workoutName}
        </span>
      </div>

      {isDeload && (
        <p className="mb-3 rounded-lg border border-[var(--data-cyan)]/40 bg-[var(--data-cyan)]/10 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[var(--data-cyan)]">
          Deload week — lighter on purpose
        </p>
      )}

      <div className="mb-3 flex items-center gap-1.5">
        {drills.map((_, i) => {
          const width = completed.has(i) ? 100 : (progressByIndex[i] ?? 0) * 100;
          return (
            <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--data-dim)]">
              <motion.div
                initial={false}
                animate={{ width: `${width}%` }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="h-full rounded-full bg-accent"
              />
            </div>
          );
        })}
      </div>

      <div className="mb-4 flex items-baseline justify-between">
        <p className="font-display text-2xl uppercase leading-none tracking-wide text-foreground">
          Drill {activeIndex + 1}
          <span className="text-foreground-mute">/{drills.length}</span>
        </p>
        <span className="text-[10px] font-bold uppercase tracking-wider text-foreground-mute">
          Swipe for more
        </span>
      </div>

      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {drills.map((drill, i) => (
          <div key={drill.id} className="w-full shrink-0 snap-center">
            <DrillCard
              drill={drill}
              level={level}
              volumeStep={volumeStep}
              onProgress={(fraction) => setProgressByIndex((prev) => ({ ...prev, [i]: fraction }))}
              onComplete={(log) => handleDrillComplete(i, log)}
            />
          </div>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      <button
        type="button"
        onClick={skipActiveDrill}
        disabled={pending || completed.has(activeIndex)}
        className="mt-4 w-full text-center text-xs font-semibold text-foreground-dim hover:text-foreground disabled:opacity-50"
      >
        {completed.has(activeIndex) ? "Drill logged" : "Skip this drill"}
      </button>

      {/* Only offered once something has actually been logged. Finishing
          a session with nothing done used to mark it completed, which fed
          the streak, the session count and the milestones with sessions
          where no work happened — the "0 of 2 drills · DONE" rows. With
          nothing logged the only way out is Cancel, which discards. */}
      {completed.size > 0 &&
        (finishConfirming ? (
          <div className="mt-3 rounded-xl border border-line bg-surface px-4 py-3 text-center">
            <p className="text-sm text-foreground">
              Finish now with {completed.size} of {drills.length} drills logged? Whatever
              you&rsquo;ve done is already saved.
            </p>
            <div className="mt-3 flex justify-center gap-4">
              <button
                type="button"
                onClick={finishSession}
                disabled={pending}
                className="text-xs font-bold uppercase tracking-wide text-accent hover:text-accent-hover disabled:opacity-50"
              >
                {pending ? "Finishing…" : "Finish now"}
              </button>
              <button
                type="button"
                onClick={() => setFinishConfirming(false)}
                className="text-xs font-semibold text-foreground-dim hover:text-foreground"
              >
                Keep going
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setFinishConfirming(true)}
            className="mt-3 w-full text-center text-xs font-semibold text-foreground-dim hover:text-foreground"
          >
            Finish workout now
          </button>
        ))}
    </div>
  );
}

function DrillCard({
  drill,
  level,
  volumeStep,
  onProgress,
  onComplete,
}: {
  drill: SessionDrill;
  level: SkillLevel;
  volumeStep: number;
  onProgress: (fraction: number) => void;
  onComplete: (log: DrillLog) => void;
}) {
  const prescription = resolvePrescription(drill, level, volumeStep);
  const isTimed = Boolean(prescription.durationSeconds);
  const blockLabel = drill.block ? BLOCK_LABELS[drill.block] : null;
  const film = drill.drills?.film_resources?.[0] ?? null;

  return (
    <div className="panel-lit rounded-3xl border border-line bg-surface p-6 sm:p-7">
      <div className="flex flex-wrap items-center gap-2">
        {blockLabel && (
          <span className="rounded-md bg-accent px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white">
            {blockLabel}
          </span>
        )}
        {drill.variant_label && (
          <span className="rounded-md border border-line-strong px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--data-cyan)]">
            {drill.variant_label}
          </span>
        )}
      </div>

      <h2 className="font-display mt-2.5 text-3xl uppercase leading-[0.95] tracking-tight text-foreground">
        {drill.drills?.name ?? "Drill"}
      </h2>
      {drill.drills?.description && (
        <p className="mt-2 text-sm leading-relaxed text-foreground-dim">
          {drill.drills.description}
        </p>
      )}

      {drill.drills && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <DrillInstructions drill={drill.drills} />
          {/* Only ever an external link, never in-app navigation. Routing a
              player to the Film Room mid-set dumped them in a library with
              no way back to the workout. The cues below are the lesson;
              this is just the footage, and it opens in a new tab so the
              session is still sitting here when they come back. */}
          {film && isWatchableUrl(film.url) && (
            <a
              href={film.url as string}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[var(--data-cyan)] transition-colors hover:opacity-80"
            >
              Watch film ↗
            </a>
          )}
        </div>
      )}

      {/* The lesson itself, inline. Sending a player off to the Film Room
          mid-set would cost them the set; one cue read here is worth more
          than a link they won't follow. */}
      {film && (film.watch_for ?? []).length > 0 && (
        <div className="mt-3 rounded-xl border border-[var(--data-cyan)]/30 bg-[var(--data-cyan)]/5 px-3.5 py-3">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--data-cyan)]">
            Watch for
          </p>
          <ul className="mt-1.5 space-y-1">
            {(film.watch_for ?? []).slice(0, 2).map((item) => (
              <li key={item} className="text-xs leading-relaxed text-foreground-dim">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-7">
        {isTimed ? (
          <TimerDrill
            targetSeconds={prescription.durationSeconds as number}
            onProgress={onProgress}
            onComplete={(actualSeconds) =>
              onComplete({
                drill_id: drill.drill_id,
                workout_drill_id: drill.id,
                metrics: {
                  type: "timed",
                  variant: drill.variant_label,
                  target_duration_seconds: prescription.durationSeconds,
                  actual_duration_seconds: actualSeconds,
                },
              })
            }
          />
        ) : (
          <RepDrill
            targetSets={prescription.sets}
            targetReps={prescription.reps}
            onProgress={onProgress}
            onComplete={(actualSets) =>
              onComplete({
                drill_id: drill.drill_id,
                workout_drill_id: drill.id,
                metrics: {
                  type: "reps",
                  variant: drill.variant_label,
                  target_sets: prescription.sets,
                  target_reps: prescription.reps,
                  actual_sets: actualSets,
                },
              })
            }
          />
        )}
      </div>
    </div>
  );
}

function TimerDrill({
  targetSeconds,
  onProgress,
  onComplete,
}: {
  targetSeconds: number;
  onProgress: (fraction: number) => void;
  onComplete: (actualSeconds: number) => void;
}) {
  const [running, setRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(targetSeconds);
  const doneRef = useRef(false);

  // Ticks in real time once started, whether or not this card is the one
  // currently in view — swiping over to peek at the next drill shouldn't
  // pause a timer for an exercise you're still physically doing.
  useEffect(() => {
    if (!running) return;
    onProgress((targetSeconds - secondsLeft) / targetSeconds);
    if (secondsLeft <= 0) {
      if (!doneRef.current) {
        doneRef.current = true;
        haptic("success");
        onComplete(targetSeconds);
      }
      return;
    }
    if (secondsLeft <= 10) haptic("tap");
    const timeout = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, secondsLeft]);

  return (
    <div className="text-center">
      <div className="flex justify-center">
        <ProgressRing
          ratio={secondsLeft / targetSeconds}
          size={176}
          stroke={8}
          idPrefix="timer"
          animate={false}
        >
          <span className="font-display text-6xl leading-none text-foreground">{secondsLeft}</span>
          <span className="mt-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-foreground-dim">
            {running ? "seconds left" : "seconds"}
          </span>
        </ProgressRing>
      </div>

      {!running && (
        <button
          type="button"
          onClick={() => {
            haptic("tap");
            setRunning(true);
          }}
          className="mt-6 w-full rounded-xl bg-accent px-4 py-3.5 text-sm font-extrabold uppercase tracking-[0.12em] text-white transition-colors hover:bg-accent-hover active:scale-[0.99]"
        >
          Start
        </button>
      )}
    </div>
  );
}

// Rest between sets. A flat default rather than a per-drill column: the
// schema has no rest field, and one honest default is better than a fake
// per-drill number. Always skippable — a prescribed rest that can't be
// cut short is worse than none.
const REST_SECONDS = 15;

function RepDrill({
  targetSets,
  targetReps,
  onProgress,
  onComplete,
}: {
  targetSets: number | null;
  targetReps: number | null;
  onProgress: (fraction: number) => void;
  onComplete: (actualSets: number) => void;
}) {
  // Tapping per individual rep breaks down for anything fast (30 dribbles
  // in a row isn't tappable) — tap once per completed SET instead, and
  // auto-complete once the target number of sets is reached, the same way
  // the timer auto-completes at 0.
  const totalSets = targetSets ?? 1;
  const [setsDone, setSetsDone] = useState(0);
  const [restLeft, setRestLeft] = useState<number | null>(null);
  const doneRef = useRef(false);

  const resting = restLeft !== null;

  // Every state change happens inside the timeout callback rather than in
  // the effect body, so this never sets state during render/commit.
  useEffect(() => {
    if (restLeft === null) return;
    const timeout = setTimeout(() => {
      const next = restLeft - 1;
      if (next <= 0) {
        haptic("success");
        setRestLeft(null);
        return;
      }
      // A single cue at 10 seconds out, not a buzz every second — this is
      // a "get ready" nudge, and the work timer already owns the
      // buzz-down-to-zero pattern.
      if (next === 10) haptic("tap");
      setRestLeft(next);
    }, 1000);
    return () => clearTimeout(timeout);
  }, [restLeft]);

  function logSet() {
    if (doneRef.current || resting) return;
    haptic("tap");
    const next = setsDone + 1;
    setSetsDone(next);
    onProgress(next / totalSets);

    if (next >= totalSets) {
      doneRef.current = true;
      haptic("success");
      onComplete(next);
      return;
    }

    setRestLeft(REST_SECONDS);
  }

  if (resting) {
    return (
      <div className="text-center">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[var(--data-cyan)]">
          Rest
        </p>

        <div className="mt-3 flex justify-center">
          <ProgressRing
            ratio={(restLeft ?? 0) / REST_SECONDS}
            size={168}
            stroke={8}
            idPrefix="rest"
            animate={false}
          >
            <span className="font-display text-6xl leading-none text-foreground">{restLeft}</span>
            <span className="mt-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-foreground-dim">
              seconds
            </span>
          </ProgressRing>
        </div>

        <p className="mt-4 text-sm font-semibold text-foreground-dim">
          Set {setsDone + 1} of {totalSets} up next
        </p>

        <button
          type="button"
          onClick={() => {
            haptic("tap");
            setRestLeft(null);
          }}
          className="mt-3 text-xs font-extrabold uppercase tracking-[0.12em] text-accent transition-colors hover:text-accent-hover"
        >
          Skip rest →
        </button>
      </div>
    );
  }

  return (
    <div className="text-center">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-foreground-dim">
        {targetReps ? `${targetReps} reps per set` : "Tap when a set is done"}
      </p>

      <button
        type="button"
        onClick={logSet}
        className="group relative mx-auto mt-3 flex h-44 w-44 items-center justify-center"
      >
        <ProgressRing
          ratio={setsDone / totalSets}
          size={176}
          stroke={8}
          idPrefix="sets"
          animate={false}
        >
          <span className="font-display text-6xl leading-none text-foreground">
            {setsDone}
            <span className="text-foreground-mute">/{totalSets}</span>
          </span>
          <span className="mt-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-accent">
            Tap when done
          </span>
        </ProgressRing>
      </button>
    </div>
  );
}

function SessionComplete({
  workoutName,
  loggedCount,
  totalCount,
  onDone,
}: {
  workoutName: string;
  loggedCount: number;
  totalCount: number;
  onDone: () => void;
}) {
  const fullyDone = loggedCount >= totalCount;
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.82, rotate: -4 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 20 }}
        className="hero-sheen panel-lit relative w-full overflow-hidden rounded-3xl border border-accent p-7 text-center shadow-2xl"
      >
        <div className="court-lines absolute inset-0 opacity-60" aria-hidden />
        <div className="relative">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent">
            Workout Complete
          </p>
          <h2 className="font-display mt-3 text-4xl uppercase leading-[0.9] tracking-tight text-foreground">
            {workoutName}
          </h2>

          <div className="mt-5 flex items-baseline justify-center gap-1.5">
            <span className="font-display text-gradient-accent text-6xl leading-none">
              {loggedCount}
            </span>
            <span className="font-display text-3xl leading-none text-foreground-mute">
              /{totalCount}
            </span>
          </div>
          <p className="mt-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-foreground-dim">
            {totalCount === 1 ? "Drill logged" : "Drills logged"}
          </p>

          <p className="mt-4 text-sm text-foreground-dim">
            {fullyDone ? "Full session. That's the standard." : "Work is work. Pick it back up next time."}
          </p>
        </div>
      </motion.div>

      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        type="button"
        onClick={onDone}
        className="mt-5 w-full rounded-xl bg-accent px-4 py-3.5 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-accent-hover"
      >
        Done
      </motion.button>
    </div>
  );
}
