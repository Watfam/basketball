import type { Point } from "./geometry";
import { COURT_WIDTH, type Frame } from "./types";

function mirrorPoint(p: Point): Point {
  return { x: COURT_WIDTH - p.x, y: p.y };
}

/** Reflects a frame left-right across the court's centerline — same action, same hoop, run from the other side of the floor. */
export function mirrorFrame(frame: Frame): Frame {
  return {
    ...frame,
    offense: frame.offense.map((p) => ({ ...p, pos: mirrorPoint(p.pos) })),
    defense: frame.defense.map((d) => (d.manualPos ? { ...d, manualPos: mirrorPoint(d.manualPos) } : d)),
    lines: frame.lines.map((l) => ({ ...l, points: l.points.map(mirrorPoint) })),
    arrivals: frame.arrivals
      ? (Object.fromEntries(
          Object.entries(frame.arrivals).map(([id, path]) => [id, path?.map(mirrorPoint)])
        ) as Frame["arrivals"])
      : frame.arrivals,
    ballArrival: frame.ballArrival?.map(mirrorPoint),
  };
}

export function mirrorFrames(frames: Frame[]): Frame[] {
  return frames.map(mirrorFrame);
}
