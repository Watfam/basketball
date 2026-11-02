import { distance, type Point } from "./geometry";
import { resolveDefense } from "./resolve";
import type { DefenseId, DrawnLine, Frame, OffenseId } from "./types";

/** "Starts within about 3 feet of him." */
export const NEAR = 3;

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
 * The drawn line — of the given type(s), from either frame — that explains a move from `fromPos` to
 * `toPos`: one whose two ends each land near one of those points, not just whichever happens to start
 * nearby. Two authoring styles both produce a line that matches this: the live designer's own
 * forward-looking one (a line drawn on the frame you're leaving, found in `fromLines`) and a
 * hand-authored, retroactive one (a line drawn on the frame you're arriving at, annotating how you got
 * there, found in `toLines`) — this doesn't care which frame it came from, only that both ends line up.
 */
export function findMovementLine(fromLines: DrawnLine[], toLines: DrawnLine[], types: DrawnLine["type"][], fromPos: Point, toPos: Point): DrawnLine | undefined {
  const candidates = linesOfType([...fromLines, ...toLines], types).filter(
    (l) => distance(l.points[0], fromPos) <= NEAR && distance(l.points[l.points.length - 1], toPos) <= NEAR
  );
  candidates.sort((a, b) => distance(a.points[0], fromPos) - distance(b.points[0], fromPos));
  return candidates[0];
}

/** How close a line's endpoint must sit to a player's spot to count as "drawn onto him" — tight, so a line that merely passes near him, or deliberately ends a couple feet short, doesn't get dragged along too when he moves. */
const LINE_FOLLOW_EPSILON = 0.3;

/**
 * Re-points any line whose end sat exactly on `fromPos` (a player about to move away from it) to
 * `toPos` instead. A line is never tagged to a player's id — "was it drawn onto him" is answered
 * purely by whether it's currently sitting on his spot — so this works the same for a brand new line
 * someone just drew and for hand-authored library content, with no migration needed either way.
 * Without this, dragging, nudging or swapping a player leaves every line that touched him pointing at
 * the empty space he used to stand in.
 */
export function reattachLines(lines: DrawnLine[], fromPos: Point, toPos: Point): DrawnLine[] {
  return lines.map((l) => {
    const start = l.points[0];
    const end = l.points[l.points.length - 1];
    const startHit = distance(start, fromPos) < LINE_FOLLOW_EPSILON;
    const endHit = distance(end, fromPos) < LINE_FOLLOW_EPSILON;
    if (!startHit && !endHit) return l;
    const points = [...l.points];
    if (startHit) points[0] = toPos;
    if (endHit) points[points.length - 1] = toPos;
    return { ...l, points };
  });
}

/**
 * The same re-pointing as reattachLines, but for a single cached arrival path (`Frame.arrivals[id]`
 * or `Frame.ballArrival`) rather than a visible, drawn `DrawnLine` — nextFrame() sets these when it
 * auto-advances a step, and until now nothing ever touched them again. Move a player on the frame he
 * just arrived at (fixing up exactly where he ends up) and the cached path keeps ending at his old
 * spot — invisible at rest, but playback follows it right up to the old point and only then snaps to
 * his real new one, which is the "jump back, then move" glitch this closes.
 */
export function reattachArrival(path: Point[] | undefined, fromPos: Point, toPos: Point): Point[] | undefined {
  if (!path || path.length === 0) return path;
  const end = path[path.length - 1];
  if (distance(end, fromPos) >= LINE_FOLLOW_EPSILON) return path;
  const next = [...path];
  next[next.length - 1] = toPos;
  return next;
}

/** "Literally the same spot" — much tighter than the line-follow epsilon, since this is only ever meant to catch an exact copy (a step that was just holding him), never a step that happens to leave him nearby for some other reason. */
const HOLD_EPSILON = 0.05;

function framePos(frame: Frame, id: OffenseId | DefenseId): Point | undefined {
  if (id.startsWith("O")) return frame.offense.find((o) => o.id === id)?.pos;
  return resolveDefense(frame).find((d) => d.id === id)?.pos;
}

function withPlayerAt(frame: Frame, id: OffenseId | DefenseId, fromPos: Point, toPos: Point): Frame {
  const lines = reattachLines(frame.lines, fromPos, toPos);
  const arrivals = frame.arrivals?.[id] ? { ...frame.arrivals, [id]: reattachArrival(frame.arrivals[id], fromPos, toPos) } : frame.arrivals;
  const ballArrival = id === frame.ballHolder ? reattachArrival(frame.ballArrival, fromPos, toPos) : frame.ballArrival;
  if (id.startsWith("O")) {
    return { ...frame, offense: frame.offense.map((o) => (o.id === id ? { ...o, pos: toPos } : o)), lines, arrivals, ballArrival };
  }
  return { ...frame, defense: frame.defense.map((d) => (d.id === (id as DefenseId) ? { ...d, coverage: "manual" as const, manualPos: toPos } : d)), lines };
}

/**
 * Moves a player in one step (`frames[index]`) to `toPos`, then keeps every other step honest about
 * it: the step right before gets its lines/arrivals re-pointed the same as `reattachLines` (a line
 * ending here may start from his old spot), and — the point of this function — every step AFTER this
 * one that was simply holding him at the SAME old spot (no independent position of its own) picks up
 * the new spot too, cascading forward until a step is reached where he's already somewhere else. That
 * step (an intentional, different placement) and everything beyond it are left untouched. Without
 * this, fixing an early step's position leaves every later step that was just copying it forward
 * pointing at the empty spot he used to stand in — the same staleness `reattachLines` already fixes
 * for drawn lines, generalized to the stored position itself.
 */
export function movePlayerAcrossFrames(frames: Frame[], index: number, id: OffenseId | DefenseId, toPos: Point): Frame[] {
  const fromPos = framePos(frames[index], id);
  if (!fromPos) {
    return frames.map((fr, i) => {
      if (i !== index) return fr;
      if (id.startsWith("O")) return { ...fr, offense: fr.offense.map((o) => (o.id === id ? { ...o, pos: toPos } : o)) };
      return { ...fr, defense: fr.defense.map((d) => (d.id === (id as DefenseId) ? { ...d, coverage: "manual" as const, manualPos: toPos } : d)) };
    });
  }

  const next = [...frames];
  next[index] = withPlayerAt(frames[index], id, fromPos, toPos);

  if (index - 1 >= 0) {
    const prev = frames[index - 1];
    next[index - 1] = { ...prev, lines: reattachLines(prev.lines, fromPos, toPos) };
  }

  for (let i = index + 1; i < frames.length; i++) {
    const fr = frames[i];
    const pos = framePos(fr, id);
    if (!pos || distance(pos, fromPos) >= HOLD_EPSILON) {
      next[i] = { ...fr, lines: reattachLines(fr.lines, fromPos, toPos) };
      break;
    }
    next[i] = withPlayerAt(fr, id, fromPos, toPos);
  }

  return next;
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
