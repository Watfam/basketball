import { findMovementLine } from "./frames";
import { lerp, pointAlongPath, type Point } from "./geometry";
import { resolveDefense } from "./resolve";
import type { DrawnLine, Frame } from "./types";

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

/**
 * The inverse of clockToFraction — where a dragged scrubber lands. Walks the timeline segment by
 * segment (hold, transition, hold, transition, ..., hold) rather than dividing by a uniform
 * hold+transition chunk size, because the very last segment is a hold with no transition after it —
 * treating every chunk as uniform put fraction 1.0 (the scrubber's own end stop) one segment early,
 * landing back on frame 0 instead of resting on the last frame. Verified numerically at every frame
 * count's fraction 0 and 1 before fixing.
 */
export function fractionToClock(fraction: number, frameCount: number): PlaybackClock {
  const total = frameCount * HOLD_MS + Math.max(0, frameCount - 1) * TRANSITION_MS;
  let remaining = Math.max(0, Math.min(1, fraction)) * total;
  for (let i = 0; i < frameCount; i++) {
    if (remaining <= HOLD_MS) return { frameIndex: i, phase: "hold", t: HOLD_MS > 0 ? remaining / HOLD_MS : 0 };
    remaining -= HOLD_MS;
    if (i === frameCount - 1) break;
    if (remaining <= TRANSITION_MS) return { frameIndex: i, phase: "transition", t: remaining / TRANSITION_MS };
    remaining -= TRANSITION_MS;
  }
  return { frameIndex: frameCount - 1, phase: "hold", t: 1 };
}

/** Symmetric ease-in-out (ease(0.5) === 0.5 exactly) — motion settles into each stop instead of halting abruptly mid-speed. */
export function ease(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2;
}

/** Re-maps `raw` onto the sub-window [start,end] of the transition, then eases it — ease()'s own internal clamp means a raw value outside the window just holds at 0 or 1, no clamping needed here. */
function windowed(raw: number, start: number, end: number): number {
  return ease((raw - start) / (end - start));
}

/**
 * The sub-window of the transition that beat `beat` gets, given the full set of beats actually in
 * play this step. Consecutive beats overlap by half a beat's width so the motion reads as one
 * continuous action rather than stop-and-go — the same idea as the old fixed move-then-pass split,
 * generalized from exactly two slots to however many beats are actually used.
 */
function beatWindow(beat: number, allBeats: number[]): [number, number] {
  const sorted = [...new Set(allBeats)].sort((a, b) => a - b);
  const k = sorted.length;
  if (k <= 1) return [0, 1];
  const i = sorted.indexOf(beat);
  const span = 1 / (k + 0.5);
  return [i * span, Math.min(1, (i + 1.5) * span)];
}

/**
 * The frame to render at a point in the transition from `from` to `to`: a player glides along the
 * path he arrived on (his drawn line) if `to` recorded one, otherwise a straight interpolation; a
 * formula-driven defender is passed through unchanged so his coverage keeps reacting live to the
 * interpolated offense/ball below. Returns a ball override for when the ball is traveling a pass's
 * own path rather than sitting on a player.
 *
 * By default, movement and a pass in the same transition are staggered, not simultaneous: the cut,
 * dribble or screen that creates the passing lane plays out over the first ~65% of the transition,
 * and the pass itself travels over the last ~50%, so the two halves overlap just enough to read as
 * one continuous action — the actual order of a real possession, not an undifferentiated blend. A
 * transition with only one of the two just eases over the whole window. Tagging a line's `beat`
 * (1, 2 or 3 — see DrawnLine.beat) opts the WHOLE transition into fully sequenced beats instead,
 * generalizing that same two-slot idea to however many beats are actually used; anything untagged
 * defaults to beat 1 (the front of the step) except an untagged pass, which still defaults to right
 * after whatever's moving, matching the plain two-slot behavior when nothing is tagged at all.
 */
const MOVE_TYPES: DrawnLine["type"][] = ["cut", "dribble", "screen"];

export function interpolateFrame(from: Frame, to: Frame, rawT: number): { frame: Frame; ballOverride?: Point } {
  // `arrivals`/`ballArrival` are the fast path — set automatically by nextFrame() for anything built
  // live in the designer. A line drawn some other way (hand-authored data, or a player dragged by
  // hand with a line drawn afterward to annotate the move) never gets one, so this also searches both
  // frames' own lines for one whose two ends land on (where he started, where he ended up) — see
  // findMovementLine. Without this, a curved or multi-bend line would still render correctly at rest
  // but playback would silently cut the corner with a straight glide instead of following it. Reading
  // the matched line itself (rather than just its points) is also how a tagged `beat` is recovered,
  // regardless of which authoring style produced the line.
  const fromDefResolved = resolveDefense(from);

  const offensePaths = new Map<string, Point[]>();
  const offenseBeats = new Map<string, number>();
  for (const o of to.offense) {
    const fromPos = from.offense.find((f) => f.id === o.id)?.pos;
    const line = fromPos ? findMovementLine(from.lines, to.lines, MOVE_TYPES, fromPos, o.pos) : undefined;
    const path = line?.points ?? to.arrivals?.[o.id];
    if (path) {
      offensePaths.set(o.id, path);
      offenseBeats.set(o.id, line?.beat ?? 1);
    }
  }

  const defensePaths = new Map<string, Point[]>();
  const defenseBeats = new Map<string, number>();
  for (const d of from.defense) {
    const toDef = to.defense.find((x) => x.id === d.id);
    const fromPos = fromDefResolved.find((r) => r.id === d.id)?.pos;
    const line = toDef?.coverage === "manual" && toDef.manualPos && fromPos ? findMovementLine(from.lines, to.lines, MOVE_TYPES, fromPos, toDef.manualPos) : undefined;
    const path = line?.points ?? to.arrivals?.[d.id];
    if (path) {
      defensePaths.set(d.id, path);
      defenseBeats.set(d.id, line?.beat ?? 1);
    }
  }

  const fromBallPos = from.offense.find((o) => o.id === from.ballHolder)?.pos;
  const toBallPos = to.offense.find((o) => o.id === to.ballHolder)?.pos;
  const ballLine =
    from.ballHolder !== to.ballHolder && fromBallPos && toBallPos ? findMovementLine(from.lines, to.lines, ["pass"], fromBallPos, toBallPos) : undefined;
  const ballPath = ballLine?.points ?? to.ballArrival;

  const hasBallMove = !!ballPath;
  const hasPlayerMove =
    to.offense.some((o) => {
      const fromPos = from.offense.find((f) => f.id === o.id)?.pos;
      return fromPos ? fromPos.x !== o.pos.x || fromPos.y !== o.pos.y : false;
    }) || defensePaths.size > 0;

  const anyExplicitBeat = [...from.lines, ...to.lines].some((l) => l.beat !== undefined);

  let moveT: number;
  let ballT: number;
  let offenseT: (id: string) => number;
  let defenseT: (id: string) => number;

  if (!anyExplicitBeat) {
    // Nothing in this play has ever used explicit beats — exactly the original two-slot formula,
    // byte-for-byte, so every existing play keeps its exact feel.
    const stagger = hasBallMove && hasPlayerMove;
    moveT = stagger ? windowed(rawT, 0, 0.65) : ease(rawT);
    ballT = stagger ? windowed(rawT, 0.5, 1) : ease(rawT);
    offenseT = () => moveT;
    defenseT = () => moveT;
  } else {
    const movementBeats = [...offenseBeats.values(), ...defenseBeats.values()];
    const defaultBallBeat = movementBeats.length ? Math.max(...movementBeats) + 1 : 1;
    const ballBeat = ballLine?.beat ?? defaultBallBeat;
    const allBeats = hasBallMove ? [...movementBeats, ballBeat] : movementBeats;
    offenseT = (id) => windowed(rawT, ...beatWindow(offenseBeats.get(id) ?? 1, allBeats));
    defenseT = (id) => windowed(rawT, ...beatWindow(defenseBeats.get(id) ?? 1, allBeats));
    moveT = ease(rawT); // only reached by a plain lerp fallback below (no drawn path at all to sequence)
    ballT = windowed(rawT, ...beatWindow(ballBeat, allBeats));
  }

  const offense = to.offense.map((o) => {
    const path = offensePaths.get(o.id);
    if (path) return { ...o, pos: pointAlongPath(path, offenseT(o.id)) };
    const fromPos = from.offense.find((f) => f.id === o.id)?.pos ?? o.pos;
    return { ...o, pos: lerp(fromPos, o.pos, moveT) };
  });

  // Based on `from`, not `to`: a defender with no arrival path keeps reacting to the *current*
  // coverage/man assignment, smoothly, for the whole glide — the next frame's own assignment (e.g. a
  // coverage the coach deliberately changed) takes over only at the instant that frame is actually
  // reached, not at the first frame of the transition toward it.
  const defense = from.defense.map((d) => {
    const path = defensePaths.get(d.id);
    if (!path) return d;
    return { ...d, coverage: "manual" as const, manualPos: pointAlongPath(path, defenseT(d.id)) };
  });

  // Same reasoning as defense: who "has the ball" for coverage purposes (e.g. Auto's on-ball check)
  // stays the old holder until the catch actually happens, at arrival — not the instant the pass is
  // thrown.
  const frame: Frame = { ...to, offense, defense, ballHolder: from.ballHolder };
  const ballOverride = ballPath ? pointAlongPath(ballPath, ballT) : undefined;
  return { frame, ballOverride };
}
