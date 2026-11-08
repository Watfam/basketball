/** Plain court-feet point. x: 0-50 across (sideline to sideline). y: 0-94 (baseline to baseline), the defended hoop at the top. */
export type Point = { x: number; y: number };

export const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
export const scale = (a: Point, s: number): Point => ({ x: a.x * s, y: a.y * s });
export const length = (a: Point): number => Math.hypot(a.x, a.y);
export const distance = (a: Point, b: Point): number => length(sub(a, b));

/** The zero vector has no direction; callers get (0, 0) back rather than NaN. */
export function unit(a: Point): Point {
  const len = length(a);
  return len < 1e-6 ? { x: 0, y: 0 } : scale(a, 1 / len);
}

export function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Moves `from` toward `to`, never past it. */
export function clampDistanceTo(from: Point, to: Point, maxDist: number): Point {
  const d = distance(from, to);
  return d <= maxDist ? to : add(from, scale(unit(sub(to, from)), maxDist));
}

/**
 * Shortens a path by `dist` feet, walking back from its end — so a line's own tip (and the arrowhead
 * drawn at it) lands just outside the player token it points at instead of underneath it. Player
 * tokens paint over the line layer, so an arrowhead placed exactly at the destination's own
 * coordinate is invisible: it is there, just hidden under an opaque circle. Walks segment by segment
 * rather than assuming the last segment alone is long enough, so a path whose final leg is short
 * still trims the full `dist`.
 */
export function trimEnd(points: Point[], dist: number): Point[] {
  if (points.length < 2 || dist <= 0) return points;
  const pts = points.slice();
  let remaining = dist;
  for (let i = pts.length - 1; i > 0; i--) {
    const seg = distance(pts[i], pts[i - 1]);
    if (seg >= remaining) {
      const t = remaining / seg;
      return [...pts.slice(0, i), lerp(pts[i], pts[i - 1], t)];
    }
    remaining -= seg;
    pts.pop();
  }
  return [pts[0]];
}

/** Catmull-Rom through 2+ points, as a cubic-bezier SVG path (smooth freehand curves). Falls back to a straight line for exactly 2 points. */
export function smoothPath(points: Point[]): string {
  if (points.length < 2) return "";
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  const p = points;
  let d = `M ${p[0].x} ${p[0].y}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/** A point at parameter t (0-1) along a Catmull-Rom path through `points` — used to glide a player along the curve it drew. Linear for a straight (2-point) line. */
export function pointAlongPath(points: Point[], t: number): Point {
  if (points.length < 2) return points[0] ?? { x: 0, y: 0 };
  if (points.length === 2) return lerp(points[0], points[1], t);
  const segT = t * (points.length - 1);
  const i = Math.min(points.length - 2, Math.floor(segT));
  const localT = segT - i;
  const p0 = points[i - 1] ?? points[i];
  const p1 = points[i];
  const p2 = points[i + 1];
  const p3 = points[i + 2] ?? p2;
  const t2 = localT * localT;
  const t3 = t2 * localT;
  return {
    x: 0.5 * (2 * p1.x + (p2.x - p0.x) * localT + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (3 * p1.x - p0.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * (2 * p1.y + (p2.y - p0.y) * localT + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (3 * p1.y - p0.y - 3 * p2.y + p3.y) * t3),
  };
}

/** A zigzag along a path (straight or curved) — the dribble line's look, as an SVG path. */
export function zigzagAlongPath(points: Point[], amplitude = 1.1, segments = 10): string {
  if (points.length < 2) return "";
  let path = "";
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const base = pointAlongPath(points, t);
    const ahead = pointAlongPath(points, Math.min(1, t + 0.02));
    const back = pointAlongPath(points, Math.max(0, t - 0.02));
    const tangent = unit(sub(ahead, back));
    const normal = { x: -tangent.y, y: tangent.x };
    const side = i === 0 || i === segments ? 0 : i % 2 === 1 ? 1 : -1;
    const pt = add(base, scale(normal, side * amplitude));
    path += i === 0 ? `M ${pt.x} ${pt.y}` : ` L ${pt.x} ${pt.y}`;
  }
  return path;
}

/** Perpendicular distance from `p` to the infinite line through `a`-`b` — falls back to plain distance from `a` when they coincide (a zero-length "line" has no direction to measure against). */
function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const ab = sub(b, a);
  const abLen = length(ab);
  if (abLen < 1e-9) return distance(p, a);
  const ap = sub(p, a);
  return Math.abs(ap.x * ab.y - ap.y * ab.x) / abLen;
}

/**
 * Ramer-Douglas-Peucker: reduces a dense freehand path (one point roughly every 0.6 ft of a real
 * drag) down to the few points that actually matter for its shape, within `epsilon` feet of the
 * original. A path that's basically straight collapses all the way to just its own two endpoints —
 * the real finger/mouse jitter in an intended-to-be-straight drag never survives this, so the
 * rendered line comes out clean rather than visibly jagged. A genuinely curved drag keeps only its
 * real bends, not one stored, individually-draggable point per sample — a 15 ft curved drag used to
 * leave 20+ overlapping edit handles behind it; this leaves 2-5, matching the shape a coach would
 * actually want to grab and adjust.
 */
export function simplifyPath(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points;
  const start = points[0];
  const end = points[points.length - 1];
  let maxDist = -1;
  let maxIndex = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], start, end);
    if (d > maxDist) {
      maxDist = d;
      maxIndex = i;
    }
  }
  if (maxDist > epsilon) {
    const left = simplifyPath(points.slice(0, maxIndex + 1), epsilon);
    const right = simplifyPath(points.slice(maxIndex), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [start, end];
}
