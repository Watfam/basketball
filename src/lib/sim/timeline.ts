/** Turns a play's frames into a fixed-step timeline of where our five players and the ball are — the one thing every simulated defense is run against, so the same play is judged on identical offense every time. */
import { distance, type Point } from "@/lib/plays/geometry";
import { interpolateFrame } from "@/lib/plays/playback";
import type { Frame, OffenseId } from "@/lib/plays/types";

export const DT = 0.1;
const LEAD_S = 0.6;
const HOLD_S = 1.0;
const MOVE_S = 1.5;
const FINAL_S = 1.4;
const SHOT_AFTER_S = 0.7;

export type OffenseAt = Record<OffenseId, Point>;

export type Tick = {
  offense: OffenseAt;
  ball: Point;
  /** Who has the ball; null while it is in the air. */
  holder: OffenseId | null;
  /** 0-1 along the pass while the ball is in the air, otherwise null. */
  flight: number | null;
  /** The 1-based step (frame number) this moment belongs to — a movement tick belongs to the step it is leading into. */
  step: number;
  moving: boolean;
  screeners: OffenseId[];
};

export type PassEvent = { from: OffenseId; to: OffenseId; startTick: number; endTick: number; step: number };
export type CatchEvent = { player: OffenseId; tick: number; step: number };

export type Timeline = {
  ticks: Tick[];
  passes: PassEvent[];
  catches: CatchEvent[];
  shotTick: number;
  shooter: OffenseId;
  stepCount: number;
};

function offenseAt(frame: Frame): OffenseAt {
  const out = {} as OffenseAt;
  for (const o of frame.offense) out[o.id] = { ...o.pos };
  return out;
}

/** Who sets each drawn screen: the offensive player standing closest to where the screen line starts. */
function screenersIn(frame: Frame): OffenseId[] {
  const ids: OffenseId[] = [];
  for (const l of frame.lines) {
    if (l.type !== "screen" || !l.points.length) continue;
    let best: OffenseId | null = null;
    let bestD = 3;
    for (const o of frame.offense) {
      const d = distance(o.pos, l.points[0]);
      if (d < bestD) {
        bestD = d;
        best = o.id;
      }
    }
    if (best && !ids.includes(best)) ids.push(best);
  }
  return ids;
}

export function buildTimeline(frames: Frame[]): Timeline {
  const ticks: Tick[] = [];
  const n = frames.length;
  let finalStart = 0;

  for (let i = 0; i < n; i++) {
    const frame = frames[i];
    const holdTicks = Math.round((i === 0 ? LEAD_S : i === n - 1 ? FINAL_S : HOLD_S) / DT);
    const incoming = i > 0 ? screenersIn(frames[i - 1]) : [];
    if (i === n - 1) finalStart = ticks.length;
    for (let k = 0; k < holdTicks; k++) {
      const offense = offenseAt(frame);
      ticks.push({ offense, ball: { ...offense[frame.ballHolder] }, holder: frame.ballHolder, flight: null, step: i + 1, moving: false, screeners: incoming });
    }
    if (i === n - 1) break;

    const next = frames[i + 1];
    const moveTicks = Math.round(MOVE_S / DT);
    const start = interpolateFrame(frame, next, 0).ballOverride;
    const end = interpolateFrame(frame, next, 1).ballOverride;
    const outgoing = screenersIn(frame);
    for (let k = 1; k <= moveTicks; k++) {
      const rawT = k / moveTicks;
      const { frame: f, ballOverride } = interpolateFrame(frame, next, rawT);
      const offense = offenseAt(f);
      const ball = ballOverride ? { ...ballOverride } : { ...offense[f.ballHolder] };
      let holder: OffenseId | null = f.ballHolder;
      let flying = false;
      if (ballOverride && start && end) {
        const nearStart = distance(ballOverride, start) <= 0.3;
        const nearEnd = distance(ballOverride, end) <= 0.3;
        if (nearEnd && next.ballHolder !== frame.ballHolder) holder = next.ballHolder;
        else if (!nearStart && !nearEnd) {
          holder = null;
          flying = true;
        }
      } else if (rawT >= 1) holder = next.ballHolder;
      ticks.push({
        offense,
        ball,
        holder,
        flight: flying ? 0 : null,
        step: i + 2,
        moving: true,
        screeners: rawT >= 0.4 ? outgoing : [],
      });
    }
  }

  // Flight progress: how far along its own pass the ball is, so a steal near the passer or the catcher isn't confused with one in the lane.
  for (let k = 0; k < ticks.length; k++) {
    if (ticks[k].flight === null || (k > 0 && ticks[k - 1].flight !== null)) continue;
    let e = k;
    while (e + 1 < ticks.length && ticks[e + 1].flight !== null) e++;
    const len = e - k + 1;
    for (let j = k; j <= e; j++) ticks[j].flight = (j - k + 0.5) / len;
  }

  const passes: PassEvent[] = [];
  const catches: CatchEvent[] = [];
  let lastHolder: OffenseId | null = ticks[0]?.holder ?? null;
  let flightStart = -1;
  let flightFrom: OffenseId | null = null;
  for (let k = 0; k < ticks.length; k++) {
    const t = ticks[k];
    if (t.holder === null) {
      if (flightStart < 0) {
        flightStart = k;
        flightFrom = lastHolder;
      }
      continue;
    }
    if (flightStart >= 0 && flightFrom) {
      passes.push({ from: flightFrom, to: t.holder, startTick: flightStart, endTick: k, step: t.step });
      catches.push({ player: t.holder, tick: k, step: t.step });
    } else if (t.holder !== lastHolder && lastHolder !== null) {
      catches.push({ player: t.holder, tick: k, step: t.step });
    }
    flightStart = -1;
    lastHolder = t.holder;
  }

  const shotTick = Math.min(ticks.length - 1, finalStart + Math.round(SHOT_AFTER_S / DT));
  return { ticks, passes, catches, shotTick, shooter: frames[n - 1].ballHolder, stepCount: n };
}
