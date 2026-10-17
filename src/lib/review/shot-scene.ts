import type { CameraSetup, HistoryShot } from "./history-types.ts";
import { BREAK_MS } from "./history-view.ts";

/**
 * What the shot screens draw, worked out from a saved shot's OBSERVED sightings and nothing else (no video, no estimated position, no
 * physical measurement). Positions are the camera picture's: pixels right of and above the rim's centre. Everything here says what the camera
 * saw; none of it says why a shot went in or missed. Pure, so the screens are tested without a screen.
 */
export const LOW_SCORE = 50;
export const MIN_SIGHTINGS = 6;
/** Regulation sizes, used only to draw the rim and backboard to scale from the ball's own size in the picture. They are not detected. */
export const BALL_M = 0.24, RIM_M = 0.457;
export const BOARD_M = { w: 1.83, h: 1.07, belowRim: 0.15, targetW: 0.59, targetH: 0.45 };

export type Sighting = { t: number; x: number; y: number; w: number; score: number; /** The detector was not sure, or a gap sits right next to it. */ unsure: boolean };
export type Gap = { fromT: number; toT: number };
export type Scene = {
  id: string;
  seq: number;
  made: boolean;
  /** The player reversed the camera's call. */
  callChanged: boolean;
  level: HistoryShot["quality"]["level"];
  sightings: Sighting[];
  gaps: Gap[];
  /** The ball's width in the picture near the rim, px. */
  ballPx: number;
  pxPerM: number;
  rimW: number;
  /** Where the ball was seen going down past the rim's height: time, and how far left/right of the rim's centre (ball widths, + is right in the picture). */
  crossing: { t: number; xBw: number } | null;
  /** Highest sighting above the rim's height, ball widths. */
  highBw: number | null;
  closest: { t: number; distBw: number } | null;
  startT: number;
  endT: number;
  usable: boolean;
};

/** Whether a shot has a path worth showing, without building its scene. */
export const hasUsablePath = (s: HistoryShot): boolean => s.points.length >= MIN_SIGHTINGS && s.quality.level !== "none" && s.quality.level !== "unreliable";

const bwOf = (s: HistoryShot) => (s.ballWidthPx && s.ballWidthPx > 0 ? s.ballWidthPx : 24);

export function sceneOf(shot: HistoryShot): Scene {
  const bw = bwOf(shot);
  const p = [...shot.points].sort((a, b) => a[0] - b[0]);
  const sightings: Sighting[] = p.map((q, i) => ({
    t: q[0], x: q[1], y: q[2], w: q[3] > 0 ? q[3] : bw, score: q[4],
    unsure: q[4] < LOW_SCORE || (i > 0 && q[0] - p[i - 1][0] > BREAK_MS) || (i < p.length - 1 && p[i + 1][0] - q[0] > BREAK_MS),
  }));
  const gaps: Gap[] = [];
  for (let i = 1; i < sightings.length; i += 1) if (sightings[i].t - sightings[i - 1].t > BREAK_MS) gaps.push({ fromT: sightings[i - 1].t, toT: sightings[i].t });
  let crossing: Scene["crossing"] = null;
  for (let i = 0; i + 1 < sightings.length && !crossing; i += 1) {
    const a = sightings[i], b = sightings[i + 1];
    if (a.y > 0 && b.y <= 0 && b.t - a.t <= 2 * BREAK_MS) {
      const f = a.y / (a.y - b.y);
      crossing = { t: a.t + f * (b.t - a.t), xBw: (a.x + f * (b.x - a.x)) / bw };
    }
  }
  const high = sightings.length ? Math.max(...sightings.map((s) => s.y)) : null;
  let closest: Scene["closest"] = null;
  for (const s of sightings) { const d = Math.hypot(s.x, s.y) / bw; if (!closest || d < closest.distBw) closest = { t: s.t, distBw: d }; }
  return {
    id: shot.id, seq: shot.seq, made: shot.made, callChanged: shot.detectedMade !== null && shot.detectedMade !== shot.made, level: shot.quality.level,
    sightings, gaps, ballPx: bw, pxPerM: bw / BALL_M, rimW: (RIM_M / BALL_M) * bw, crossing,
    highBw: high === null ? null : high / bw, closest,
    startT: sightings[0]?.t ?? 0, endT: sightings[sightings.length - 1]?.t ?? 0,
    usable: sightings.length >= MIN_SIGHTINGS && shot.quality.level !== "none" && shot.quality.level !== "unreliable",
  };
}

export type StageState = { shown: Sighting | null; seenNow: boolean; inGap: boolean; /** Past the last sighting: the camera stopped following it. */ ended: boolean; trail: Sighting[]; upcoming: Sighting | null };

/** The ball at time t: the latest sighting at or before t, held (never moved) until the next one. */
export function stateAt(scene: Scene, t: number): StageState {
  const s = scene.sightings;
  let i = -1;
  for (let k = 0; k < s.length; k += 1) { if (s[k].t <= t) i = k; else break; }
  const shown = i >= 0 ? s[i] : null;
  const next = i + 1 < s.length ? s[i + 1] : null;
  const inGap = !!shown && !!next && next.t - shown.t > BREAK_MS && t - shown.t > BREAK_MS;
  return { shown, seenNow: !!shown && t - shown.t <= BREAK_MS, inGap, ended: !!shown && !next && t - shown.t > BREAK_MS, trail: i >= 0 ? s.slice(0, i + 1) : [], upcoming: next };
}

/** Times of the sightings, for stepping a frame at a time. */
export const sightingTimes = (scene: Scene): number[] => scene.sightings.map((x) => x.t);
export function stepTime(times: number[], t: number, dir: 1 | -1): number {
  if (times.length === 0) return t;
  if (dir > 0) return times.find((x) => x > t + 0.5) ?? times[times.length - 1];
  for (let i = times.length - 1; i >= 0; i -= 1) if (times[i] < t - 0.5) return times[i];
  return times[0];
}

// ---- comparing two shots ----------------------------------------------------------------------------------------------------------

export type Sync = { mode: "rim_height" | "closest" | "start"; aT: number; bT: number; note: string };
/** The moment to line two shots up on: both seen coming down past the rim's height, else both at their closest to the rim, else their first sightings. */
export function syncPoint(a: Scene, b: Scene): Sync {
  if (a.crossing && b.crossing) return { mode: "rim_height", aT: a.crossing.t, bT: b.crossing.t, note: "Lined up at the moment each ball was seen coming down past the rim's height." };
  if (a.closest && b.closest && a.usable && b.usable) return { mode: "closest", aT: a.closest.t, bT: b.closest.t, note: "One of these was not seen coming down past the rim's height, so they are lined up at the moment each was closest to the rim." };
  return { mode: "start", aT: a.startT, bT: b.startT, note: "These could not be lined up on the rim, so each starts at its first sighting." };
}

const lr = (xBw: number) => (Math.abs(xBw) < 0.25 ? "almost dead centre" : `${Math.abs(xBw).toFixed(1)} ball width${Math.abs(xBw) >= 1.5 ? "s" : ""} ${xBw > 0 ? "right" : "left"} of centre`);
export type Difference = { label: string; a: string; b: string };

/**
 * What can be read off two shots filmed the same way, in the camera picture's own terms. Only things that were seen are listed; a missing
 * observation says so. Nothing here is a physical measurement or a reason.
 */
export function observedDifferences(a: Scene, b: Scene): Difference[] {
  const out: Difference[] = [];
  out.push({ label: "Where it came down past the rim's height", a: a.crossing ? lr(a.crossing.xBw) : "not seen coming down", b: b.crossing ? lr(b.crossing.xBw) : "not seen coming down" });
  out.push({ label: "Highest point in the picture", a: a.highBw === null ? "not seen" : `${a.highBw.toFixed(1)} ball widths above the rim`, b: b.highBw === null ? "not seen" : `${b.highBw.toFixed(1)} ball widths above the rim` });
  const follow = (s: Scene) => (s.sightings.length ? `${Math.round((s.endT - s.startT) / 100) / 10} s` : "not seen");
  out.push({ label: "How long the camera followed it", a: follow(a), b: follow(b) });
  out.push({ label: "Stretches where it was not seen", a: String(a.gaps.length), b: String(b.gaps.length) });
  return out;
}

export const COMPARE_CAUTION = "Two shots can look different because of the shot, the spot it was taken from, or what the camera picked up. This view shows what the camera saw; it does not say which.";

// ---- patterns ----------------------------------------------------------------------------------------------------------------------

export type ArrivalDot = { id: string; seq: number; made: boolean; xBw: number };
export type PatternSummary = {
  usable: number;
  arrivals: ArrivalDot[];
  makes: number;
  misses: number;
  /** Typical examples: the make and the miss closest to that group's middle arrival. */
  typicalMake: ArrivalDot | null;
  typicalMiss: ArrivalDot | null;
  side: { left: number; right: number; centre: number; lean: "left" | "right" | "none"; text: string; strong: boolean; /** Why the side may come from the phone's place rather than the shot. Null when the phone was said to be straight behind. */ caveat: string | null } | null;
  coverage: { shots: number; withPath: number; seenComingDown: number };
};

const median = (a: number[]) => { const s = [...a].sort((p, q) => p - q); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
function wilson(k: number, n: number, z = 1.96) { if (n === 0) return { lo: 0, hi: 1 }; const p = k / n, d = 1 + (z * z) / n, c = (p + (z * z) / (2 * n)) / d, h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d; return { lo: c - h, hi: c + h }; }
export const MIN_MISSES_FOR_SIDE = 8;

/**
 * A short summary of a group of shots filmed the same way: where each came down past the rim's height (one dot each, not a pile of lines), a typical
 * make and a typical miss, and which side the misses were seen on. The side is reported only from enough misses and only as "leaning" when the share
 * on one side is clearly more than half. It does not rank makes by distance: a miss being farther from the middle is what a miss is.
 */
const OFF_AXIS = "From a phone that is not straight behind you, a shot that is a little short or long also looks like a miss to one side.";

export function summarizePatterns(shots: HistoryShot[], position: CameraSetup["position"] = "unsure"): PatternSummary {
  const scenes = shots.map(sceneOf);
  const withPath = scenes.filter((s) => s.sightings.length >= 2).length;
  const arrivals: ArrivalDot[] = scenes.filter((s) => s.usable && s.crossing).map((s) => ({ id: s.id, seq: s.seq, made: s.made, xBw: s.crossing!.xBw }));
  const typical = (made: boolean) => { const g = arrivals.filter((a) => a.made === made); const m = median(g.map((a) => a.xBw)); return m === null ? null : g.reduce((best, a) => (Math.abs(a.xBw - m) < Math.abs(best.xBw - m) ? a : best)); };
  const misses = arrivals.filter((a) => !a.made);
  let side: PatternSummary["side"] = null;
  if (misses.length >= MIN_MISSES_FOR_SIDE) {
    const left = misses.filter((a) => a.xBw < -0.25).length, right = misses.filter((a) => a.xBw > 0.25).length, centre = misses.length - left - right;
    const sided = left + right;
    let lean: "left" | "right" | "none" = "none", strong = false;
    if (sided >= MIN_MISSES_FOR_SIDE) { const w = wilson(Math.max(left, right), sided); if (w.lo > 0.5) { lean = left > right ? "left" : "right"; strong = true; } }
    const picture = `Most of your misses (${Math.max(left, right)} of ${sided} that went to a side) were seen coming down to the ${lean} of the rim's centre in the picture.`;
    const none = `Your misses were seen on both sides of the rim's centre (${left} left, ${right} right), so there is no clear side.`;
    // From an off-axis phone the side of a miss is partly a short/long miss seen at an angle (training/eval/experiments/analytics-audit): not a fact about the shot.
    if (position === "side") side = { left, right, centre, lean: "none", strong: false, text: `Your phone was off to one side, so the side your misses fell on cannot be read as a lean in your shooting (${left} left, ${right} right in the picture).`, caveat: OFF_AXIS };
    else side = { left, right, centre, lean, strong, text: strong ? picture : none, caveat: strong ? (position === "behind" ? "A phone that is a little off-centre can add a small lean." : `${OFF_AXIS} Say where the phone was, or film from straight behind you, to read it as your shot.`) : null };
  }
  return { usable: arrivals.length, arrivals, makes: arrivals.length - misses.length, misses: misses.length, typicalMake: typical(true), typicalMiss: typical(false), side, coverage: { shots: shots.length, withPath, seenComingDown: arrivals.length } };
}
