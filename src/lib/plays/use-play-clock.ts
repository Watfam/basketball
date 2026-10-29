import { useEffect, useRef, useState } from "react";
import type { Point } from "./geometry";
import { advanceClock, clockToFraction, fractionToClock, interpolateFrame, type PlaybackClock } from "./playback";
import type { Frame } from "./types";

export const SPEEDS = [0.5, 1, 2] as const;

/**
 * The engine behind every "watch this play" screen — both the full-screen film player and the inline
 * viewer run the exact same clock, so they can never drift into looking or behaving differently.
 *
 * `jumpToStep(i)` is the step list's click handler: it always re-plays the ONE transition that leads
 * into step i (from step i-1's hold straight into i), regardless of where the diagram currently sits —
 * snapping back to the pre-state first if needed — rather than trying to catch up through every step
 * in between. That matches "click the words, the play jumps there": one readable, bounded animation
 * per click, not a scrub through however many frames happen to be in the way.
 */
export function usePlayClock(frames: Frame[], { autoplay = false }: { autoplay?: boolean } = {}) {
  const [clock, setClock] = useState<PlaybackClock>({ frameIndex: 0, phase: "hold", t: 0 });
  const [playing, setPlaying] = useState(autoplay);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const lastRef = useRef<number | null>(null);
  const stopAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) {
      lastRef.current = null;
      return;
    }
    let raf: number;
    const tick = (now: number) => {
      const last = lastRef.current ?? now;
      const dt = now - last;
      lastRef.current = now;
      setClock((prev) => {
        const next = advanceClock(prev, dt, speed, frames.length);
        const reachedStop = stopAtRef.current !== null && next.frameIndex === stopAtRef.current && next.phase === "hold";
        if (next.done || reachedStop) {
          stopAtRef.current = null;
          setPlaying(false);
        }
        return { frameIndex: next.frameIndex, phase: next.phase, t: next.t };
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, frames.length]);

  const fromFrame = frames[clock.frameIndex];
  let shown: Frame;
  let ballOverride: Point | undefined;
  if (clock.phase === "hold") {
    shown = fromFrame;
  } else {
    const toFrame = frames[clock.frameIndex + 1];
    const result = interpolateFrame(fromFrame, toFrame, clock.t);
    shown = result.frame;
    ballOverride = result.ballOverride;
  }

  function togglePlay() {
    stopAtRef.current = null;
    if (!playing && clock.frameIndex === frames.length - 1 && clock.phase === "hold" && clock.t >= 1) {
      setClock({ frameIndex: 0, phase: "hold", t: 0 });
    }
    setPlaying((p) => !p);
  }

  function scrub(fraction: number) {
    stopAtRef.current = null;
    lastRef.current = null;
    setClock(fractionToClock(fraction, frames.length));
  }

  /** Animates straight into step i (frame i, i>=1) from the hold right before it; i===0 snaps to the starting alignment with no animation. */
  function jumpToStep(i: number) {
    lastRef.current = null;
    if (i <= 0) {
      stopAtRef.current = null;
      setPlaying(false);
      setClock({ frameIndex: 0, phase: "hold", t: 0 });
      return;
    }
    stopAtRef.current = i;
    setClock({ frameIndex: i - 1, phase: "transition", t: 0 });
    setPlaying(true);
  }

  const fraction = clockToFraction(clock, frames.length);

  return { clock, shown, ballOverride, fromFrame, playing, speed, setSpeed, togglePlay, scrub, jumpToStep, fraction };
}
