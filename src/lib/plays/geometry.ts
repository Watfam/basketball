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

/** How far a sampled drag path wanders from the straight line between its own endpoints — small means "meant to be straight," large means a deliberate freehand curve. */
export function maxDeviationFromChord(points: Point[]): number {
  if (points.length < 3) return 0;
  const start = points[0];
  const end = points[points.length - 1];
  const chord = sub(end, start);
  const chordLen = length(chord);
  if (chordLen < 1e-6) return Math.max(...points.map((p) => distance(p, start)));
  const dir = scale(chord, 1 / chordLen);
  const normal = { x: -dir.y, y: dir.x };
  return Math.max(...points.map((p) => Math.abs((p.x - start.x) * normal.x + (p.y - start.y) * normal.y)));
}
