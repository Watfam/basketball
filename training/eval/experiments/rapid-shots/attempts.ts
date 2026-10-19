/**
 * Is a counted rim event one attempt or more?  (Experiment, not wired into counting.)
 *
 * The shot counter groups every rim-zone sighting less than 40 frames apart into ONE shot, so a miss followed by a quick putback is one shot.
 * A ball that bounces off the rim comes back down about 13 to 24 frames later; a second attempt needs the ball caught and shot again.
 * What tells them apart is flight: a bounce is ONE ball in continuous ballistic flight from the first rim contact to its return (one parabola
 * fits what was seen), a second attempt starts after that flight is broken (the ball was not followed, or does not fit one parabola).
 * No timer and no ball identity: only whether the sightings between two arrivals form one flight.
 *
 * Sightings are in the same hoop window as the rules (px, rim at the origin after subtracting it), time in reference frames (29.97 fps).
 */
export type Sighting = { f: number; dx: number; dy: number };
export type Arrival = { f0: number; f1: number };
export type Link = { from: Arrival; to: Arrival; gap: number; continuous: boolean; rms: number | null; accel: number | null; followed: number };

export const ATTEMPT = {
  /** A descent starts at least this far above the rim line (round 1 used 35 and missed the flat arcs that peak 20 to 35 px over the rim), within `arriveX` sideways, and arrives within `arriveDy` of the rim line. */
  startAbove: 18,
  startMaxAbove: 140,
  arriveX: 90,
  arriveDy: -12,
  /** Following one ball: fastest believable move per reference frame, plus slack for detector jitter; a gap longer than this ends the chain. */
  maxSpeed: 30,
  jitter: 12,
  chainBreakFrames: 10,
  /** Two arrivals closer than this are one (the same ball seen twice). */
  mergeFrames: 4,
  /** A return closer than this to the previous arrival is a bounce whatever the fit says: a ball cannot be caught and shot in under about 0.4 s. */
  minGapFrames: 12,
  /** One flight: residual, downward acceleration (px per reference frame squared), points needed to judge. */
  fitRms: 5,
  accelMin: 0.3,
  accelMax: 1.6,
  minFitPoints: 5,
} as const;

function polyfit(xs: number[], ys: number[], deg: number): { co: number[]; rms: number } {
  const n = xs.length, m = deg + 1;
  const AtA = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => xs.reduce((s, x) => s + x ** (i + j), 0)));
  const Atb = Array.from({ length: m }, (_, i) => xs.reduce((s, x, k) => s + x ** i * ys[k], 0));
  for (let i = 0; i < m; i += 1) {
    let piv = i;
    for (let r = i + 1; r < m; r += 1) if (Math.abs(AtA[r][i]) > Math.abs(AtA[piv][i])) piv = r;
    [AtA[i], AtA[piv]] = [AtA[piv], AtA[i]];
    [Atb[i], Atb[piv]] = [Atb[piv], Atb[i]];
    for (let r = i + 1; r < m; r += 1) {
      const k = AtA[r][i] / AtA[i][i];
      for (let c = i; c < m; c += 1) AtA[r][c] -= k * AtA[i][c];
      Atb[r] -= k * Atb[i];
    }
  }
  const co = Array(m).fill(0);
  for (let i = m - 1; i >= 0; i -= 1) {
    let s = Atb[i];
    for (let c = i + 1; c < m; c += 1) s -= AtA[i][c] * co[c];
    co[i] = s / AtA[i][i];
  }
  const rss = xs.reduce((s, x, k) => s + (ys[k] - co.reduce((a, c, d) => a + c * x ** d, 0)) ** 2, 0);
  return { co, rms: Math.sqrt(rss / n) };
}

/** One ball followed forward from sightings[start]: the next sighting that could be the same ball, until a gap or `endF`. */
export function follow(sightings: Sighting[], start: number, endF: number): Sighting[] {
  const chain = [sightings[start]];
  for (let j = start + 1; j < sightings.length; j += 1) {
    const q = sightings[j], last = chain[chain.length - 1];
    if (q.f > endF) break;
    if (q.f === last.f) continue;
    const dt = q.f - last.f;
    if (dt > ATTEMPT.chainBreakFrames) break;
    if (Math.hypot(q.dx - last.dx, q.dy - last.dy) > ATTEMPT.maxSpeed * dt + ATTEMPT.jitter) continue;
    chain.push(q);
  }
  return chain;
}

/** Descents that reach the rim line: a ball coming down from at least `startAbove` px above it, followed to within `arriveDy` of it. */
export function arrivals(sightings: Sighting[]): Arrival[] {
  const found: Arrival[] = [], used = new Set<number>();
  for (let i = 0; i < sightings.length; i += 1) {
    const p = sightings[i];
    if (used.has(i) || p.dy > -ATTEMPT.startAbove || p.dy < -ATTEMPT.startMaxAbove || Math.abs(p.dx) > ATTEMPT.arriveX) continue;
    let last = p;
    const chain = [i];
    for (let j = i + 1; j < sightings.length; j += 1) {
      const q = sightings[j];
      const dt = q.f - last.f;
      if (dt > ATTEMPT.chainBreakFrames) break;
      if (dt === 0) continue;
      if (Math.hypot(q.dx - last.dx, q.dy - last.dy) > ATTEMPT.maxSpeed * dt + ATTEMPT.jitter) continue;
      if (q.dy < last.dy - 2) continue;
      chain.push(j);
      last = q;
      if (q.dy >= ATTEMPT.arriveDy) {
        found.push({ f0: p.f, f1: q.f });
        for (const k of chain) used.add(k);
        break;
      }
    }
  }
  const merged: Arrival[] = [];
  for (const a of found.sort((x, y) => x.f1 - y.f1)) {
    const m = merged[merged.length - 1];
    if (m && a.f1 - m.f1 <= ATTEMPT.mergeFrames) m.f0 = Math.min(m.f0, a.f0);
    else merged.push({ ...a });
  }
  return merged;
}

/** Does one flight explain the sightings from `a.f1` to the next arrival `b`? */
export function linkOf(sightings: Sighting[], a: Arrival, b: Arrival): Link {
  const gap = b.f1 - a.f1;
  const start = sightings.findIndex((p) => p.f >= a.f1);
  if (start < 0) return { from: a, to: b, gap, continuous: false, rms: null, accel: null, followed: 0 };
  const chain = follow(sightings, start, b.f1);
  const reached = chain[chain.length - 1].f >= b.f1 - 2;
  if (chain.length < ATTEMPT.minFitPoints) return { from: a, to: b, gap, continuous: false, rms: null, accel: null, followed: chain.length };
  const t0 = chain[0].f, ts = chain.map((p) => p.f - t0);
  const fy = polyfit(ts, chain.map((p) => p.dy), 2), fx = polyfit(ts, chain.map((p) => p.dx), 1);
  const rms = Math.sqrt((fy.rms ** 2 + fx.rms ** 2) / 2), accel = 2 * fy.co[2];
  const oneFlight = reached && rms <= ATTEMPT.fitRms && accel >= ATTEMPT.accelMin && accel <= ATTEMPT.accelMax;
  return { from: a, to: b, gap, continuous: oneFlight, rms, accel, followed: chain.length };
}

export type AttemptReport = {
  /** Where each attempt's descent arrived (reference frames). */
  attempts: Arrival[];
  links: Link[];
  /** True when the flight between two arrivals is broken and they are far enough apart for a catch and a shot. */
  possiblyTwo: boolean;
};

/** Attempts inside one counted event, from the sightings around it (give it from about 30 frames before the first zone sighting to the last). */
export function attemptsIn(sightings: Sighting[]): AttemptReport {
  const s = [...sightings].sort((x, y) => x.f - y.f);
  const arr = arrivals(s);
  if (arr.length < 2) return { attempts: arr, links: [], possiblyTwo: false };
  const links: Link[] = [];
  const attempts: Arrival[] = [arr[0]];
  for (let i = 1; i < arr.length; i += 1) {
    const link = linkOf(s, arr[i - 1], arr[i]);
    links.push(link);
    if (!link.continuous && link.gap >= ATTEMPT.minGapFrames) attempts.push(arr[i]);
  }
  return { attempts, links, possiblyTwo: attempts.length > 1 };
}
