import { distance, type Point } from "./geometry";
import { resolveDefense } from "./resolve";
import type { DrawnLine, Frame, OffenseId } from "./types";

/** "Starts within about 3 feet of him." */
const NEAR = 3;

function linesOfType(lines: DrawnLine[], types: DrawnLine["type"][]): DrawnLine[] {
  return lines.filter((l) => types.includes(l.type));
}

/** The frame's movement lines (cut/dribble/screen) that start near `pos`, closest first. */
function movementLinesNear(lines: DrawnLine[], pos: Point): DrawnLine[] {
  return linesOfType(lines, ["cut", "dribble", "screen"])
    .filter((l) => distance(l.points[0], pos) <= NEAR)
    .sort((a, b) => distance(a.points[0], pos) - distance(b.points[0], pos));
}

/**
 * Copies the current frame and moves each player to the end of any cut, dribble or screen line that
 * starts within about 3 ft of him — including a formula-driven defender, checked against wherever his
 * coverage currently has him standing, not just a Manual one. A pass line starting at the ball handler
 * hands the ball to whichever offensive player ends up nearest its end. The new frame starts with no
 * lines and an empty note, ready for the next thing to be drawn.
 */
export function nextFrame(current: Frame): Frame {
  const arrivals: NonNullable<Frame["arrivals"]> = {};

  const offense = current.offense.map((o) => {
    const line = movementLinesNear(current.lines, o.pos)[0];
    if (!line) return { ...o };
    arrivals[o.id] = line.points;
    return { ...o, pos: line.points[line.points.length - 1] };
  });

  const resolved = resolveDefense(current);
  const defense = current.defense.map((d) => {
    const rd = resolved.find((r) => r.id === d.id)!;
    const line = movementLinesNear(current.lines, rd.pos)[0];
    if (!line) return { ...d };
    arrivals[d.id] = line.points;
    return { ...d, coverage: "manual" as const, manualPos: line.points[line.points.length - 1] };
  });

  let ballHolder = current.ballHolder;
  let ballArrival: Point[] | undefined;
  const ballPos = current.offense.find((o) => o.id === current.ballHolder)?.pos;
  if (ballPos) {
    const passLine = linesOfType(current.lines, ["pass"]).find((l) => distance(l.points[0], ballPos) <= NEAR);
    if (passLine) {
      const end = passLine.points[passLine.points.length - 1];
      let nearest: { id: OffenseId; d: number } | null = null;
      for (const o of offense) {
        const d = distance(o.pos, end);
        if (!nearest || d < nearest.d) nearest = { id: o.id, d };
      }
      if (nearest) {
        ballHolder = nearest.id;
        ballArrival = passLine.points;
      }
    }
  }

  return { offense, defense, ballHolder, lines: [], note: "", arrivals: Object.keys(arrivals).length ? arrivals : undefined, ballArrival };
}
