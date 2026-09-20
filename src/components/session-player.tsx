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

export function SessionPlayer({ playerId, sessionId, workoutName, drills, alreadyCompleted }: Props) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [logs, setLogs] = useState<DrillLog[]>([]);
  const [finished, setFinished] = useState(alreadyCompleted);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // How far into the *current* drill the player actually is (0-1) — sets
  // logged / total sets, or seconds elapsed / target — not just "which
  // drill am I on." Without this the current segment jumped to 100% the
  // instant you arrived at a drill you hadn't started yet. Reset during
  // render (React's documented pattern for "adjust state when a prop
  // changes") rather than in an effect, which the lint rules flag.
  const [currentProgress, setCurrentProgress] = useState(0);
  const [progressResetForIndex, setProgressResetForIndex] = useState(index);
  if (progressResetForIndex !== index) {
    setProgressResetForIndex(index);
    setCurrentProgress(0);
  }

  const current = drills[index];
  const isTimed = Boolean(current?.target_duration_seconds);

  function finishDrill(log: DrillLog) {
    const nextLogs = [...logs, log];
    setLogs(nextLogs);

    if (index < drills.length - 1) {
      haptic("step");
      setIndex((i) => i + 1);
      return;
    }

    // Last drill — submit the whole session.
    startTransition(async () => {
      const result = await completeWorkoutSession(sessionId, nextLogs);
      if (result?.error) {
        setError(result.error);
        return;
      }
      haptic("success");
      setFinished(true);
    });
  }

  function skipDrill() {
    if (!current) return;
    haptic("tap");
    finishDrill({ drill_id: current.drill_id, metrics: { skipped: true } });
  }

  if (finished) {
    return <SessionComplete workoutName={workoutName} drillCount={drills.length} onDone={() => router.push(`/players/${playerId}`)} />;
  }

  if (!current) {
    return (
      <div className="mx-auto w-full max-w-md text-center text-sm text-foreground-dim">
        This workout has no drills yet.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-6 flex items-center gap-2">
        {drills.map((_, i) => {
          const width = i < index ? 100 : i === index ? currentProgress * 100 : 0;
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

      {/*
        No AnimatePresence here — tried "wait" (froze the UI on a stale
        drill under fast clicking) and "popLayout" (the outgoing card got
        visibly stuck mid-exit, overlapping the new one, reproduced in a
        real production build, not just dev). Both are real Framer Motion
        exit-tracking failures in this stack, not tooling flukes. A keyed
        motion.div with no exit prop can't get stuck — React just swaps
        the DOM instantly — so the slide is one-sided (new drill swipes
        in; the old one doesn't swipe out), which is the safe trade-off.
      */}
      <motion.div
        key={current.drill_id}
        initial={{ opacity: 0, x: 80 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="court-glow rounded-3xl border border-line bg-surface p-6 sm:p-8"
      >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            Drill {index + 1} of {drills.length}
          </p>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {current.drills?.name ?? "Drill"}
          </h2>
          {current.drills?.description && (
            <p className="mt-1 text-sm text-foreground-dim">{current.drills.description}</p>
          )}
          {(current.drills?.source_trainer || current.drills?.video_url) && (
            <p className="mt-1 text-xs text-foreground-dim">
              {current.drills.source_trainer}
              {current.drills.source_trainer && current.drills.video_url ? " · " : ""}
              {current.drills.video_url && (
                <a
                  href={current.drills.video_url}
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
                targetSeconds={current.target_duration_seconds as number}
                onProgress={setCurrentProgress}
                onComplete={(actualSeconds) =>
                  finishDrill({
                    drill_id: current.drill_id,
                    metrics: { type: "timed", target_duration_seconds: current.target_duration_seconds, actual_duration_seconds: actualSeconds },
                  })
                }
              />
            ) : (
              <RepDrill
                targetSets={current.target_sets}
                targetReps={current.target_reps}
                onProgress={setCurrentProgress}
                onComplete={(actualSets) =>
                  finishDrill({
                    drill_id: current.drill_id,
                    metrics: {
                      type: "reps",
                      target_sets: current.target_sets,
                      target_reps: current.target_reps,
                      actual_sets: actualSets,
                    },
                  })
                }
              />
            )}
          </div>
      </motion.div>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      <button
        type="button"
        onClick={skipDrill}
        disabled={pending}
        className="mt-4 w-full text-center text-xs font-semibold text-foreground-dim hover:text-foreground disabled:opacity-50"
      >
        Skip this drill
      </button>
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
