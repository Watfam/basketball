/**
 * Camera framing, measured from one picture: where the rim is, how big it looks, how flat it looks, and how the backboard sits behind it.
 *
 * Geometry only, in the picture's own pixels, no physical claims. The rim is the orange ring; the board is the white frame behind it, found as
 * four straight lines. Every quantity can be missing: a measurement that cannot be trusted is null and says why, because the caller must be
 * able to abstain. Pure arithmetic on a pixel buffer, no camera, no screen, so it is tested. Never called from the counting loop.
 */

export type Pixels = { data: Uint8ClampedArray | Uint8Array; width: number; height: number };
export type Pt = { x: number; y: number };

export type RimFit = { cx: number; cy: number; w: number; h: number; n: number };
export type BoardFit = {
  /** Top-left, top-right, bottom-right, bottom-left, in the working picture's pixels. */
  corners: [Pt, Pt, Pt, Pt];
  /** How much of each edge's expected length is actually white frame, 0..1: top, bottom, left, right. */
  support: [number, number, number, number];
  /** The board's top edge touches the picture's top: its height is not trustworthy. */
  cutTop: boolean;
};

export type FramingQuantities = {
  /** Rim centre as fractions of the picture. */
  posX: number;
  posY: number;
  /** Rim width as a fraction of the picture width. */
  size: number;
  /** Rim height divided by its width. */
  elev: number;
  /** Board width at its mid-height divided by rim width; null when no board was found. */
  az: number | null;
  /** Rim centre minus board centre, in rim widths; null when no board was found. */
  off: number | null;
  /** Board width at mid-height divided by board height at mid-width; independent of the rim colour fit. */
  asp: number | null;
  /** Mean tilt of the board's side edges in degrees (positive = the tops lean right); null when no board was found. */
  roll: number | null;
};

export type FramingMeasurement = {
  q: FramingQuantities | null;
  rim: RimFit | null;
  board: BoardFit | null;
  /** Source picture size and the box-filter factor used to get the working picture. */
  src: { width: number; height: number };
  factor: number;
  /** Why something is missing, in plain words. */
  issues: string[];
  /** Every rim-shaped orange blob that was considered, with how well a board was found behind it (diagnostics). */
  candidates: { cx: number; cy: number; w: number; h: number; score: number }[];
  ms: number;
};

export const WORK_WIDTH = 1920;

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

type Work = { w: number; h: number; r: Uint8Array; g: Uint8Array; b: Uint8Array; lum: Uint8Array; sat: Uint8Array; hue: Float32Array };

export function prepare(p: Pixels, factor: number): Work {
  const w = Math.floor(p.width / factor);
  const h = Math.floor(p.height / factor);
  const n = w * h;
  const r = new Uint8Array(n), g = new Uint8Array(n), b = new Uint8Array(n), lum = new Uint8Array(n), sat = new Uint8Array(n);
  const hue = new Float32Array(n);
  const area = factor * factor;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sr = 0, sg = 0, sb = 0;
      for (let dy = 0; dy < factor; dy += 1) {
        let i = ((y * factor + dy) * p.width + x * factor) * 4;
        for (let dx = 0; dx < factor; dx += 1) { sr += p.data[i]; sg += p.data[i + 1]; sb += p.data[i + 2]; i += 4; }
      }
      const R = sr / area, G = sg / area, B = sb / area;
      const k = y * w + x;
      r[k] = R; g[k] = G; b[k] = B;
      const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn;
      lum[k] = 0.299 * R + 0.587 * G + 0.114 * B;
      sat[k] = mx === 0 ? 0 : (255 * d) / mx;
      let hh = 0;
      if (d > 0) hh = mx === R ? ((G - B) / d) * 60 : mx === G ? (2 + (B - R) / d) * 60 : (4 + (R - G) / d) * 60;
      hue[k] = hh < 0 ? hh + 360 : hh;
    }
  }
  return { w, h, r, g, b, lum, sat, hue };
}

type Blob = { x0: number; y0: number; x1: number; y1: number; n: number; xs: number[]; ys: number[] };

function orangeBlobs(W: Work, bx0: number, by0: number, bx1: number, by1: number): Blob[] {
  const { w, h } = W;
  const on = new Uint8Array(w * h);
  const wx0 = Math.max(0, Math.floor(bx0)), wx1 = Math.min(w - 1, Math.ceil(bx1)), wy0 = Math.max(0, Math.floor(by0)), wy1 = Math.min(h - 1, Math.ceil(by1));
  for (let y = wy0; y <= wy1; y += 1) for (let x = wx0; x <= wx1; x += 1) { const i = y * w + x; on[i] = W.hue[i] <= 40 && W.sat[i] >= 60 && W.r[i] >= 70 && W.r[i] - W.b[i] >= 30 && W.r[i] - W.g[i] >= 12 ? 1 : 0; }
  // Join pieces that a net string or a thin shadow splits (one pixel each way).
  const joined = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y += 1) for (let x = 1; x < w - 1; x += 1) {
    const i = y * w + x;
    if (on[i] || on[i - 1] || on[i + 1] || on[i - w] || on[i + w]) joined[i] = 1;
  }
  const seen = new Uint8Array(w * h);
  const blobs: Blob[] = [];
  const stack: number[] = [];
  for (let s = 0; s < w * h; s += 1) {
    if (!joined[s] || seen[s]) continue;
    const blob: Blob = { x0: w, y0: h, x1: 0, y1: 0, n: 0, xs: [], ys: [] };
    stack.push(s); seen[s] = 1;
    while (stack.length) {
      const i = stack.pop() as number;
      const x = i % w, y = (i / w) | 0;
      if (on[i]) { blob.n += 1; blob.xs.push(x); blob.ys.push(y); if (x < blob.x0) blob.x0 = x; if (x > blob.x1) blob.x1 = x; if (y < blob.y0) blob.y0 = y; if (y > blob.y1) blob.y1 = y; }
      if (x > 0 && joined[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
      if (x < w - 1 && joined[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
      if (y > 0 && joined[i - w] && !seen[i - w]) { seen[i - w] = 1; stack.push(i - w); }
      if (y < h - 1 && joined[i + w] && !seen[i + w]) { seen[i + w] = 1; stack.push(i + w); }
    }
    if (blob.n >= 20) blobs.push(blob);
  }
  return blobs;
}

function pct(sorted: number[], f: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(f * (sorted.length - 1))))];
}

/** The strict orange seed misses the rim's duller stretches; grow it into the looser orange mask around it (same rows, nearby columns). */
function grow(W: Work, blob: Blob): Blob {
  const bw = blob.x1 - blob.x0 + 1, bh = blob.y1 - blob.y0 + 1;
  const x0 = Math.max(0, Math.floor(blob.x0 - 0.5 * bw)), x1 = Math.min(W.w - 1, Math.ceil(blob.x1 + 0.5 * bw));
  const y0 = Math.max(0, Math.floor(blob.y0 - 0.5 * bh - 2)), y1 = Math.min(W.h - 1, Math.ceil(blob.y1 + 0.5 * bh + 2));
  const rw = x1 - x0 + 1, rh = y1 - y0 + 1;
  const loose = (i: number) => W.r[i] >= 60 && W.r[i] - W.b[i] >= 22 && W.r[i] - W.g[i] >= 6 && W.sat[i] >= 45 && W.hue[i] <= 45;
  const seen = new Uint8Array(rw * rh);
  const stack: number[] = [];
  const out: Blob = { x0: W.w, y0: W.h, x1: 0, y1: 0, n: 0, xs: [], ys: [] };
  for (let k = 0; k < blob.xs.length; k += 1) { const lx = blob.xs[k] - x0, ly = blob.ys[k] - y0; if (lx >= 0 && ly >= 0 && lx < rw && ly < rh && !seen[ly * rw + lx]) { seen[ly * rw + lx] = 1; stack.push(ly * rw + lx); } }
  while (stack.length) {
    const li = stack.pop() as number;
    const lx = li % rw, ly = (li / rw) | 0, x = lx + x0, y = ly + y0;
    out.n += 1; out.xs.push(x); out.ys.push(y);
    if (x < out.x0) out.x0 = x; if (x > out.x1) out.x1 = x; if (y < out.y0) out.y0 = y; if (y > out.y1) out.y1 = y;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = lx + dx, ny = ly + dy;
      if (nx < 0 || ny < 0 || nx >= rw || ny >= rh || seen[ny * rw + nx]) continue;
      if (loose((ny + y0) * W.w + nx + x0)) { seen[ny * rw + nx] = 1; stack.push(ny * rw + nx); }
    }
  }
  return out.n ? out : blob;
}

function rimOf(blob: Blob): RimFit {
  const xs = [...blob.xs].sort((a, b) => a - b);
  const ys = [...blob.ys].sort((a, b) => a - b);
  const x0 = pct(xs, 0.02), x1 = pct(xs, 0.98), y0 = pct(ys, 0.02), y1 = pct(ys, 0.98);
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0 + 1, h: y1 - y0 + 1, n: blob.n };
}

type Roi = { x0: number; y0: number; w: number; h: number };

/** Bright thin bars: how much brighter a pixel is than the pixels `d` away on both sides, across (vertical bars) or down (horizontal bars). */
export function ridges(W: Work, roi: Roi, d: number): { h: Uint8Array; v: Uint8Array } {
  const { w: rw, h: rh } = roi;
  const L = (x: number, y: number) => W.lum[(roi.y0 + Math.min(rh - 1, Math.max(0, y))) * W.w + roi.x0 + Math.min(rw - 1, Math.max(0, x))];
  const hh = new Uint8Array(rw * rh), vv = new Uint8Array(rw * rh);
  const TAU = 20;
  for (let y = 0; y < rh; y += 1) for (let x = 0; x < rw; x += 1) {
    const c = (L(x, y) + L(x + 1, y) + L(x, y + 1) + L(x - 1, y) + L(x, y - 1)) / 5;
    const up = (L(x, y - d) + L(x - 1, y - d) + L(x + 1, y - d)) / 3, dn = (L(x, y + d) + L(x - 1, y + d) + L(x + 1, y + d)) / 3;
    const lf = (L(x - d, y) + L(x - d, y - 1) + L(x - d, y + 1)) / 3, rt = (L(x + d, y) + L(x + d, y - 1) + L(x + d, y + 1)) / 3;
    if (c - (up + dn) / 2 > TAU) hh[y * rw + x] = 1;
    if (c - (lf + rt) / 2 > TAU) vv[y * rw + x] = 1;
  }
  return { h: hh, v: vv };
}

export type Edge = { a: number; b: number; run: number; from: number; to: number };

/**
 * The straightest long bars in a band: for every slope and offset, walk along the line and keep the longest stretch of bar pixels
 * (gaps of up to 3 px allowed, a pixel either side tolerated). horizontal: y = a + b (x - cx); otherwise x = a + b (y - cy), relative to the rim centre.
 * Returns the best few that are distinct from each other; the caller picks the combination that closes into a board.
 */
export function topEdges(m: Uint8Array, roi: Roi, rim: RimFit, horizontal: boolean, bMax: number, bStep: number, aLo: number, aHi: number, uLo: number, uHi: number, keep: number): Edge[] {
  const all: Edge[] = [];
  const nb = Math.round((2 * bMax) / bStep) + 1;
  const at = (x: number, y: number) => {
    const lx = Math.round(x - roi.x0), ly = Math.round(y - roi.y0);
    if (lx < 1 || ly < 1 || lx >= roi.w - 1 || ly >= roi.h - 1) return false;
    const i = ly * roi.w + lx;
    return horizontal ? m[i] === 1 || m[i - roi.w] === 1 || m[i + roi.w] === 1 : m[i] === 1 || m[i - 1] === 1 || m[i + 1] === 1;
  };
  for (let bi = 0; bi < nb; bi += 1) {
    const b = -bMax + bi * bStep;
    for (let a = Math.ceil(aLo); a <= aHi; a += 1) {
      let run = 0, gap = 0, start = uLo, bestRun = 0, bestFrom = uLo, bestTo = uLo;
      for (let u = Math.ceil(uLo); u <= uHi; u += 1) {
        const x = horizontal ? rim.cx + u : rim.cx + a + b * u;
        const y = horizontal ? rim.cy + a + b * u : rim.cy + u;
        if (at(x, y)) { if (run === 0) start = u; run += 1 + gap; gap = 0; if (run > bestRun) { bestRun = run; bestFrom = start; bestTo = u; } }
        else if (run > 0) { gap += 1; if (gap > 3) { run = 0; gap = 0; } }
      }
      if (bestRun >= 0.8 * rim.w) all.push({ a, b, run: bestRun, from: bestFrom, to: bestTo });
    }
  }
  all.sort((p, q) => q.run - p.run);
  const out: Edge[] = [];
  for (const e of all) {
    if (out.every((o) => Math.abs(o.a - e.a) > 0.12 * rim.w || Math.abs(o.b - e.b) > horizontalSlopeGap(horizontal))) out.push(e);
    if (out.length >= keep) break;
  }
  return out;
}
const horizontalSlopeGap = (horizontal: boolean) => (horizontal ? 0.08 : 0.04);

function board(W: Work, rim: RimFit, issues: string[]): { fit: BoardFit } | null {
  const rw = rim.w;
  const x0 = Math.max(0, Math.floor(rim.cx - 5.6 * rw)), x1 = Math.min(W.w, Math.ceil(rim.cx + 5.6 * rw));
  const y0 = Math.max(0, Math.floor(rim.cy - 4.6 * rw)), y1 = Math.min(W.h, Math.ceil(rim.cy + 1.8 * rw));
  const roi: Roi = { x0, y0, w: x1 - x0, h: y1 - y0 };
  if (roi.w < 20 || roi.h < 20) { issues.push("the search area for the board is too small"); return null; }
  const d = Math.max(2, Math.round(0.12 * rw));
  const { h: mh, v: mv } = ridges(W, roi, d);
  const K = 5;
  const tops = topEdges(mh, roi, rim, true, 0.8, 0.02, -3.8 * rw, -1.0 * rw, -5.4 * rw, 5.4 * rw, K);
  const bottoms = topEdges(mh, roi, rim, true, 0.8, 0.02, -0.4 * rw, 1.4 * rw, -5.4 * rw, 5.4 * rw, K);
  const lefts = topEdges(mv, roi, rim, false, 0.4, 0.01, -5.2 * rw, -0.6 * rw, -4.4 * rw, 1.7 * rw, K);
  const rights = topEdges(mv, roi, rim, false, 0.4, 0.01, -0.3 * rw, 5.2 * rw, -4.4 * rw, 1.7 * rw, K);
  if (!tops.length || !bottoms.length || !lefts.length || !rights.length) { issues.push("the board's edges could not be found"); return null; }
  // Intersection of a horizontal-ish line y = a1 + b1 x with a vertical-ish line x = a2 + b2 y (relative to the rim centre).
  const meet = (h: Edge, v: Edge): Pt => {
    const x = (v.a + v.b * h.a) / (1 - v.b * h.b);
    return { x: x + rim.cx, y: h.a + h.b * x + rim.cy };
  };
  const len = (p: Pt, q: Pt) => Math.hypot(q.x - p.x, q.y - p.y);
  // How much of the segment between two corners lies on bar pixels (a pixel either side allowed).
  const cover = (m: Uint8Array, p: Pt, q: Pt, horizontal: boolean): number => {
    const n = Math.max(1, Math.round(len(p, q)));
    let hit = 0;
    for (let i = 0; i <= n; i += 1) {
      const x = p.x + ((q.x - p.x) * i) / n, y = p.y + ((q.y - p.y) * i) / n;
      const lx = Math.round(x - roi.x0), ly = Math.round(y - roi.y0);
      if (lx < 1 || ly < 1 || lx >= roi.w - 1 || ly >= roi.h - 1) continue;
      const k = ly * roi.w + lx;
      if (horizontal ? mh[k] || mh[k - roi.w] || mh[k + roi.w] : mv[k] || mv[k - 1] || mv[k + 1]) hit += 1;
    }
    return hit / (n + 1);
  };
  void mh; void mv;
  let bestScore = -1;
  let fitBest: { corners: [Pt, Pt, Pt, Pt]; support: [number, number, number, number] } | null = null;
  for (const t of tops) for (const bo of bottoms) for (const l of lefts) for (const r of rights) {
    const tl = meet(t, l), tr = meet(t, r), br = meet(bo, r), bl = meet(bo, l);
    const wAvg = (len(tl, tr) + len(bl, br)) / 2, hAvg = (len(tl, bl) + len(tr, br)) / 2;
    if (wAvg < 1.0 * rw || wAvg > 5.6 * rw || hAvg < 1.0 * rw || hAvg > 4.6 * rw) continue;
    if (!(tl.y < bl.y && tr.y < br.y && tl.x < tr.x && bl.x < br.x)) continue;
    const sup: [number, number, number, number] = [cover(mh, tl, tr, true), cover(mh, bl, br, true), cover(mv, tl, bl, false), cover(mv, tr, br, false)];
    const sc = (sup[0] + sup[1] + sup[2] + sup[3]) / 4 + 0.5 * Math.min(...sup);
    if (sc > bestScore) { bestScore = sc; fitBest = { corners: [tl, tr, br, bl], support: sup }; }
  }
  if (!fitBest) { issues.push("the lines found do not form a plausible backboard"); return null; }
  const [tl, tr] = fitBest.corners;
  const corners = fitBest.corners, support = fitBest.support;
  return { fit: { corners, support, cutTop: Math.min(tl.y, tr.y) < 2 } };
}

/** The decision of how strongly a finding must be supported before it is believed. */
export const MIN_BOARD_SUPPORT = 0.5;

export type Seed = { x: number; y: number };

/**
 * Measure the framing around where the app already believes the rim is (the aim the player confirmed, as fractions of the picture).
 * Seeded on purpose: searching a whole yard for "an orange ring" finds shirts, bricks and bins; the app always knows roughly where the rim is.
 */
export function measureFraming(p: Pixels, seed: Seed): FramingMeasurement {
  const t0 = now();
  const factor = Math.max(1, Math.floor(p.width / WORK_WIDTH));
  const issues: string[] = [];
  const W = prepare(p, factor);
  const sx = seed.x * W.w, sy = seed.y * W.h, reach = 0.045 * W.w;
  const blobs = orangeBlobs(W, sx - reach, sy - reach, sx + reach, sy + reach).filter((b) => {
    const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
    return bw >= 12 && bw <= 260 && bh / bw >= 0.08 && bh / bw <= 0.9 && Math.hypot((b.x0 + b.x1) / 2 - sx, (b.y0 + b.y1) / 2 - sy) <= reach;
  });
  if (!blobs.length) {
    issues.push("no orange rim was found near where the rim should be");
    return { q: null, rim: null, board: null, src: { width: p.width, height: p.height }, factor, issues, candidates: [], ms: now() - t0 };
  }
  blobs.sort((a, b) => b.n - a.n);
  const rim = rimOf(grow(W, blobs[0]));
  const bi: string[] = [];
  const b = board(W, rim, bi);
  let fit = b ? b.fit : null;
  if (!fit) issues.push(...bi);
  else if (Math.min(...fit.support) < MIN_BOARD_SUPPORT) { issues.push(`the backboard frame is only partly visible (weakest edge ${Math.round(Math.min(...fit.support) * 100)} percent)`); fit = null; }
  else if (fit.cutTop) issues.push("the top of the backboard is outside the picture");
  const px = factor;
  let az: number | null = null, off: number | null = null, roll: number | null = null, asp: number | null = null;
  if (fit) {
    const [tl, tr, br, bl] = fit.corners;
    const yMid = (tl.y + tr.y + br.y + bl.y) / 4;
    const lx = tl.x + ((bl.x - tl.x) * (yMid - tl.y)) / (bl.y - tl.y);
    const rx = tr.x + ((br.x - tr.x) * (yMid - tr.y)) / (br.y - tr.y);
    az = (rx - lx) / rim.w;
    off = (rim.cx - (lx + rx) / 2) / rim.w;
    const xMid = (tl.x + tr.x + br.x + bl.x) / 4;
    const ty = tl.y + ((tr.y - tl.y) * (xMid - tl.x)) / (tr.x - tl.x), by = bl.y + ((br.y - bl.y) * (xMid - bl.x)) / (br.x - bl.x);
    asp = (rx - lx) / Math.max(1, by - ty);
    const tilt = (a: Pt, c: Pt) => (Math.atan2(c.x - a.x, c.y - a.y) * 180) / Math.PI;
    roll = (tilt(tl, bl) + tilt(tr, br)) / 2;
  }
  const q: FramingQuantities = {
    posX: (rim.cx * px) / p.width, posY: (rim.cy * px) / p.height, size: (rim.w * px) / p.width, elev: rim.h / rim.w, az, off, asp, roll,
  };
  return { q, rim, board: fit, src: { width: p.width, height: p.height }, factor, issues, candidates: blobs.map((c) => ({ cx: (c.x0 + c.x1) / 2, cy: (c.y0 + c.y1) / 2, w: c.x1 - c.x0 + 1, h: c.y1 - c.y0 + 1, score: c.n })), ms: now() - t0 };
}
