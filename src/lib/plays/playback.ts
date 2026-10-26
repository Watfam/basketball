import { lerp, pointAlongPath, type Point } from "./geometry";
import type { Frame } from "./types";

/** Nominal (unscaled by speed) durations from the spec. */
export const HOLD_MS = 1300;
export const TRANSITION_MS = 1500;

export type PlaybackClock = { frameIndex: number; phase: "hold" | "transition"; t: number };

/** Advances the playback clock by `dtMs` of wall-clock time at the given speed. `done` means playback has reached the end of the last frame's hold and should pause. */
export function advanceClock(clock: PlaybackClock, dtMs: number, speed: number, frameCount: number): PlaybackClock & { done: boolean } {
  const duration = (clock.phase === "hold" ? HOLD_MS : TRANSITION_MS) / speed;
  const t = clock.t + dtMs / duration;
  if (t < 1) return { ...clock, t, done: false };

  if (clock.phase === "hold") {
    if (clock.frameIndex >= frameCount - 1) return { ...clock, t: 1, done: true };
    return { frameIndex: clock.frameIndex, phase: "transition", t: 0, done: false };
  }
  return { frameIndex: clock.frameIndex + 1, phase: "hold", t: 0, done: false };
}

/** The clock's position as a fraction (0-1) of the whole play's nominal timeline — for a scrubber. */
export function clockToFraction(clock: PlaybackClock, frameCount: number): number {
  const perFrame = HOLD_MS + TRANSITION_MS;
  const total = frameCount * HOLD_MS + Math.max(0, frameCount - 1) * TRANSITION_MS;
  if (total <= 0) return 0;
  const before = clock.frameIndex * perFrame;
  const within = clock.phase === "hold" ? clock.t * HOLD_MS : HOLD_MS + clock.t * TRANSITION_MS;
  return Math.max(0, Math.min(1, (before + within) / total));
}

/** The inverse of clockToFraction — where a dragged scrubber lands. */
export function fractionToClock(fraction: number, frameCount: number): PlaybackClock {
  const perFrame = HOLD_MS + TRANSITION_MS;
  const total = frameCount * HOLD_MS + Math.max(0, frameCount - 1) * TRANSITION_MS;
  const target = Math.max(0, Math.min(1, fraction)) * total;
  let frameIndex = Math.min(frameCount - 1, Math.floor(target / perFrame));
  const within = target - frameIndex * perFrame;
  if (within < HOLD_MS) return { frameIndex, phase: "hold", t: within / HOLD_MS };
  frameIndex = Math.min(frameCount - 2, frameIndex);
  return { frameIndex, phase: "transition", t: (within - HOLD_MS) / TRANSITION_MS };
}

/**
 * The frame to render at a point in the transition from `from` to `to`: a player glides along the
 * path he arrived on (his drawn line) if `to` recorded one, otherwise a straight interpolation; a
 * formula-driven defender is passed through unchanged so his coverage keeps reacting live to the
 * interpolated offense/ball below. Returns a ball override for when the ball is traveling a pass's
 * own path rather than sitting on a player.
 */
export function interpolateFrame(from: Frame, to: Frame, t: number): { frame: Frame; ballOverride?: Point } {
  const offense = to.offense.map((o) => {
    const path = to.arrivals?.[o.id];
    if (path) return { ...o, pos: pointAlongPath(path, t) };
    const fromPos = from.offense.find((f) => f.id === o.id)?.pos ?? o.pos;
    return { ...o, pos: lerp(fromPos, o.pos, t) };
  });

  // Based on `from`, not `to`: a defender with no arrival path keeps reacting to the *current*
  // coverage/man assignment, smoothly, for the whole glide — the next frame's own assignment (e.g. a
  // coverage the coach deliberately changed) takes over only at the instant that frame is actually
  // reached, not at the first frame of the transition toward it.
  const defense = from.defense.map((d) => {
    const path = to.arrivals?.[d.id];
    if (!path) return d;
    return { ...d, coverage: "manual" as const, manualPos: pointAlongPath(path, t) };
  });

  // Same reasoning as defense: who "has the ball" for coverage purposes (e.g. Auto's on-ball check)
  // stays the old holder until the catch actually happens, at arrival — not the instant the pass is
  // thrown.
  const frame: Frame = { ...to, offense, defense, ballHolder: from.ballHolder };
  const ballOverride = to.ballArrival ? pointAlongPath(to.ballArrival, t) : undefined;
  return { frame, ballOverride };
}
