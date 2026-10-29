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

/**
 * Inserts a copy of the frame at `index` right after it — same positions, lines and note, for a step
 * that repeats a shape with one small change. The copy has no arrivals of its own: nothing actually
 * moved getting into it (it's identical to the frame right before it), so there's no path to replay.
 */
export function duplicateFrameAt(frames: Frame[], index: number): Frame[] {
  const source = frames[index];
  if (!source) return frames;
  const copy: Frame = { ...source, lines: source.lines.map((l) => ({ ...l, points: [...l.points] })), arrivals: undefined, ballArrival: undefined };
  const next = [...frames];
  next.splice(index + 1, 0, copy);
  return next;
}

/**
 * Removes the frame at `index`. Refuses to drop the play's last frame. The frame that now follows
 * the gap loses its own recorded arrival paths — they described arriving from the frame that just
 * disappeared, which no longer matches where its new predecessor actually stands — falling back to a
 * plain straight-line glide instead of a path that would otherwise start from the wrong place.
 */
export function removeFrameAt(frames: Frame[], index: number): Frame[] {
  if (frames.length <= 1 || index < 0 || index >= frames.length) return frames;
  const next = frames.filter((_, i) => i !== index);
  if (index < next.length) {
    next[index] = { ...next[index], arrivals: undefined, ballArrival: undefined };
  }
  return next;
}
