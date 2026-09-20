"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { completeWorkoutSession } from "@/app/actions";
import { haptic } from "@/lib/haptics";

type Drill = {
  id: string;
  name: string;
  description: string | null;
  video_url: string | null;
  source_trainer: string | null;
};

export type SessionDrill = {
  drill_id: string;
  sort_order: number;
  target_sets: number | null;
  target_reps: number | null;
  target_duration_seconds: number | null;
  drills: Drill | null;
};

type DrillLog = { drill_id: string; metrics: Record<string, unknown> };

type Props = {
  playerId: string;
  sessionId: string;
  workoutName: string;
  drills: SessionDrill[];
  alreadyCompleted: boolean;
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
export function SessionPlayer({ playerId, sessionId, workoutName, drills, alreadyCompleted }: Props) {
  const router = useRouter();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [progressByIndex, setProgressByIndex] = useState<Record<number, number>>({});
  const [finished, setFinished] = useState(alreadyCompleted);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const logsRef = useRef<Record<number, DrillLog>>({});

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

  function handleDrillComplete(index: number, log: DrillLog) {
    logsRef.current[index] = log;
    const nextCompleted = new Set(completed).add(index);
    setCompleted(nextCompleted);
    haptic("step");

    if (nextCompleted.size < drills.length) {
      // Jump to the next not-yet-done drill — usually index + 1, but if
      // drills were done out of order (swiped ahead, did that one first)
      // this finds whatever's actually left.
      const nextIndex = drills.findIndex((_, i) => !nextCompleted.has(i));
      if (nextIndex !== -1) scrollToIndex(nextIndex);
      return;
    }

    // Every drill is done, regardless of the order they were done in.
    startTransition(async () => {
      const result = await completeWorkoutSession(sessionId, Object.values(logsRef.current));
      if (result?.error) {
        setError(result.error);
        return;
      }
      haptic("success");
      setFinished(true);
    });
  }

  function skipActiveDrill() {
    if (completed.has(activeIndex)) return;
    haptic("tap");
    const drill = drills[activeIndex];
    handleDrillComplete(activeIndex, { drill_id: drill.drill_id, metrics: { skipped: true } });
  }

  if (finished) {
    return (
      <SessionComplete
        workoutName={workoutName}
        drillCount={drills.length}
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
      <div className="mb-4 flex items-center gap-2">
        {drills.map((_, i) => {
          const width = completed.has(i) ? 100 : (progressByIndex[i] ?? 0) * 100;
          return (
            <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
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

      <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.2em] text-accent">
        Drill {activeIndex + 1} of {drills.length} — swipe for more
      </p>

      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {drills.map((drill, i) => (
          <div key={drill.drill_id} className="w-full shrink-0 snap-center">
            <DrillCard
              drill={drill}
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
    </div>
  );
}

function DrillCard({
  drill,
  onProgress,
  onComplete,
}: {
  drill: SessionDrill;
  onProgress: (fraction: number) => void;
  onComplete: (log: DrillLog) => void;
}) {
  const isTimed = Boolean(drill.target_duration_seconds);

  return (
    <div className="court-glow rounded-3xl border border-line bg-surface p-6 sm:p-8">
      <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
        {drill.drills?.name ?? "Drill"}
      </h2>
      {drill.drills?.description && (
        <p className="mt-1 text-sm text-foreground-dim">{drill.drills.description}</p>
      )}
      {(drill.drills?.source_trainer || drill.drills?.video_url) && (
        <p className="mt-1 text-xs text-foreground-dim">
          {drill.drills.source_trainer}
          {drill.drills.source_trainer && drill.drills.video_url ? " · " : ""}
          {drill.drills.video_url && (
            <a
              href={drill.drills.video_url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-accent hover:text-accent-hover"
            >
              Watch film ↗
            </a>
          )}
        </p>
      )}

      <div className="mt-8">
        {isTimed ? (
          <TimerDrill
            targetSeconds={drill.target_duration_seconds as number}
            onProgress={onProgress}
            onComplete={(actualSeconds) =>
              onComplete({
                drill_id: drill.drill_id,
                metrics: {
                  type: "timed",
                  target_duration_seconds: drill.target_duration_seconds,
                  actual_duration_seconds: actualSeconds,
                },
              })
            }
          />
        ) : (
          <RepDrill
            targetSets={drill.target_sets}
            targetReps={drill.target_reps}
            onProgress={onProgress}
            onComplete={(actualSets) =>
              onComplete({
                drill_id: drill.drill_id,
                metrics: {
                  type: "reps",
                  target_sets: drill.target_sets,
                  target_reps: drill.target_reps,
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

  const progress = ((targetSeconds - secondsLeft) / targetSeconds) * 100;

  return (
    <div className="text-center">
      <p className="text-6xl font-extrabold tabular-nums text-foreground">{secondsLeft}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-foreground-dim">seconds</p>

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-elevated">
        <div
          className="h-full rounded-full bg-accent transition-all duration-1000 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>

      {!running && (
        <button
          type="button"
          onClick={() => {
            haptic("tap");
            setRunning(true);
          }}
          className="mt-6 w-full rounded-xl bg-accent px-4 py-3.5 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-accent-hover"
        >
          Start
        </button>
      )}
    </div>
  );
}

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
  const doneRef = useRef(false);

  function logSet() {
    if (doneRef.current) return;
    haptic("tap");
    const next = setsDone + 1;
    setSetsDone(next);
    onProgress(next / totalSets);
    if (next >= totalSets) {
      doneRef.current = true;
      haptic("success");
      onComplete(next);
    }
  }

  return (
    <div className="text-center">
      {targetReps && (
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-dim">
          {targetReps} reps per set — tap when a set is done
        </p>
      )}
      <button
        type="button"
        onClick={logSet}
        className="mx-auto mt-3 flex h-40 w-40 flex-col items-center justify-center rounded-full border-2 border-accent bg-accent/10 transition-colors hover:bg-accent/20 active:bg-accent/30"
      >
        <span className="text-5xl font-extrabold tabular-nums text-foreground">
          {setsDone}/{totalSets}
        </span>
        <span className="mt-1 text-xs font-semibold uppercase tracking-wide text-foreground-dim">
          sets · tap when done
        </span>
      </button>
    </div>
  );
}

function SessionComplete({
  workoutName,
  drillCount,
  onDone,
}: {
  workoutName: string;
  drillCount: number;
  onDone: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.82, rotate: -4 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 20 }}
        className="court-glow relative w-full overflow-hidden rounded-3xl border-2 border-accent bg-elevated p-6 text-center shadow-2xl sm:p-8"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Workout Complete</p>
        <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
          {workoutName}
        </h2>
        <p className="mt-2 text-sm text-foreground-dim">
          {drillCount} {drillCount === 1 ? "drill" : "drills"} logged. Nice work.
        </p>
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
