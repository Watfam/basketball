import type { HistoryShot } from "./history-types.ts";
import type { OutcomeRow } from "./plain.ts";

/**
 * Helpers for showing stored shots (no screen, so they are tested). Stored points are only ever OBSERVED sightings, so a line is never drawn
 * across a missing stretch: a gap of more than 100 ms between two sightings (more than about one missed camera frame) breaks the line.
 */
export const BREAK_MS = 100;
const WINDOW_MS: [number, number] = [-1000, 400];

/** Observed points in rim-relative ball widths [x right, y up], as separate pieces, up to and including point number `upTo` (all by default). */
export function pathPieces(shot: HistoryShot, opts: { upTo?: number; window?: boolean } = {}): [number, number][][] {
  const bw = shot.ballWidthPx && shot.ballWidthPx > 0 ? shot.ballWidthPx : 24;
  const all = [...shot.points].sort((a, b) => a[0] - b[0]);
  const pts = (opts.window === false ? all : all.filter((p) => p[0] >= WINDOW_MS[0] && p[0] <= WINDOW_MS[1])).slice(0, opts.upTo === undefined ? undefined : opts.upTo);
  const pieces: [number, number][][] = [];
  let prevT = -Infinity;
  for (const p of pts) {
    if (!pieces.length || p[0] - prevT > BREAK_MS) pieces.push([]);
    pieces[pieces.length - 1].push([p[1] / bw, p[2] / bw]);
    prevT = p[0];
  }
  return pieces;
}


export const rowOf = (s: HistoryShot): OutcomeRow => ({ made: s.made, level: s.quality.level, x: typeof s.fingerprint?.m.rim_level_x_bw === "number" ? s.fingerprint.m.rim_level_x_bw : null });

/** Sessions that can fairly be compared (same camera setup) are kept together; shots of a session follow it. */
export function setupGroups<S extends { sessionKey: string }>(groups: S[][], shots: HistoryShot[]): { sessions: S[]; shots: HistoryShot[] }[] {
  return groups.map((g) => { const keys = new Set(g.map((s) => s.sessionKey)); return { sessions: g, shots: shots.filter((x) => keys.has(x.sessionKey)) }; });
}

/** Overlay lines for makes against misses: the most recent shots with a trustworthy path (capped so the picture stays readable). */
export function outcomeLines(shots: HistoryShot[], cap = 120): { made: boolean; pts: [number, number][] }[] {
  const ok = shots.filter((s) => (s.quality.level === "tracked" || s.quality.level === "partial") && s.points.length >= 2);
  return ok.slice(-cap).flatMap((s) => pathPieces(s).filter((p) => p.length >= 2).map((pts) => ({ made: s.made, pts })));
}
