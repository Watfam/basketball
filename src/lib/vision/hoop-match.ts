/**
 * Re-finding the hoop from the last aim.
 *
 * At every aim the app keeps a small picture of the hoop (the backboard, the
 * rim, the net). Next time the camera opens, that picture is looked for in
 * the new view, at a few sizes, and where it matches best the rim is where
 * it was in the old picture. It works when the phone is put back roughly
 * where it stood; how sure it is comes back as a score, and a weak score
 * means "aim by hand". Measured on real clips (training/README.md): score
 * about 0.4 and up was within 7 px of the real rim, 0.25 to 0.4 about 20 px,
 * a different lens or angle came out near 0.19.
 *
 * Pure arithmetic on grey pictures, no camera or screen, so it is tested.
 */

/** The size the pictures are kept and matched at (16:9, like the camera). */
export const MATCH_W = 320;
export const MATCH_H = 180;

/** A strong match starts counting by itself; a fair one asks first; below that the player aims by hand. */
export const MATCH_STRONG = 0.4;
export const MATCH_FAIR = 0.25;

export type HoopRef = {
  /** Brightness of the whole picture at MATCH_W x MATCH_H, row by row. */
  gray: Uint8Array;
  /** Where the rim was, as fractions of the picture. */
  rim: { x: number; y: number };
  /** The hoop window's scale at that aim (1 is the training setup): how big the hoop looked. */
  scale: number;
};

export type HoopMatch = {
  score: number;
  /** The rim in today's picture, as fractions. */
  rim: { x: number; y: number };
  /** How much bigger the hoop is today than in the saved picture. */
  sizeRatio: number;
};

/** Edge strength: lighting changes don't matter, only where things have outlines. */
function edges(gray: Uint8Array, w: number, h: number): Float32Array {
  const e = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      e[i] = Math.hypot(gray[i + 1] - gray[i - 1], gray[i + w] - gray[i - w]);
    }
  }
  return e;
}

type Picture = { p: Float32Array; w: number; h: number };

function halve(src: Picture): Picture {
  const w = src.w >> 1;
  const h = src.h >> 1;
  const p = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = 2 * y * src.w + 2 * x;
      p[y * w + x] = (src.p[i] + src.p[i + 1] + src.p[i + src.w] + src.p[i + src.w + 1]) / 4;
    }
  }
  return { p, w, h };
}

function crop(src: Picture, x0: number, y0: number, w: number, h: number): Picture {
  const p = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) p[y * w + x] = src.p[(y0 + y) * src.w + x0 + x];
  return { p, w, h };
}

function resize(src: Picture, k: number): Picture {
  const w = Math.max(6, Math.round(src.w * k));
  const h = Math.max(6, Math.round(src.h * k));
  const p = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const sx = Math.min(src.w - 1, x / k);
      const sy = Math.min(src.h - 1, y / k);
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(src.w - 1, x0 + 1);
      const y1 = Math.min(src.h - 1, y0 + 1);
      const ax = sx - x0;
      const ay = sy - y0;
      p[y * w + x] =
        src.p[y0 * src.w + x0] * (1 - ax) * (1 - ay) +
        src.p[y0 * src.w + x1] * ax * (1 - ay) +
        src.p[y1 * src.w + x0] * (1 - ax) * ay +
        src.p[y1 * src.w + x1] * ax * ay;
    }
  }
  return { p, w, h };
}

/** Zero-mean and its length, for normalised correlation. */
function normalised(src: Picture) {
  let m = 0;
  for (const v of src.p) m += v;
  m /= src.p.length;
  const p = new Float32Array(src.p.length);
  let n = 0;
  for (let i = 0; i < p.length; i += 1) {
    p[i] = src.p[i] - m;
    n += p[i] * p[i];
  }
  return { p, w: src.w, h: src.h, norm: Math.sqrt(n) || 1 };
}

type Spot = { score: number; x: number; y: number };

/** Normalised correlation of a template at one place (top-left x, y). */
function scoreAt(e: Picture, t: ReturnType<typeof normalised>, x: number, y: number): number {
  let sum = 0;
  let sq = 0;
  let dot = 0;
  for (let yy = 0; yy < t.h; yy += 1) {
    const row = (y + yy) * e.w + x;
    const trow = yy * t.w;
    for (let xx = 0; xx < t.w; xx += 1) {
      const v = e.p[row + xx];
      sum += v;
      sq += v * v;
      dot += t.p[trow + xx] * v;
    }
  }
  const n = t.w * t.h;
  const variance = Math.max(1e-6, sq - (sum * sum) / n);
  return dot / (t.norm * Math.sqrt(variance));
}

function bestSpot(e: Picture, t: ReturnType<typeof normalised>, x0 = 0, y0 = 0, x1 = e.w - t.w, y1 = e.h - t.h): Spot {
  let best: Spot = { score: -2, x: 0, y: 0 };
  for (let y = Math.max(0, y0); y <= Math.min(e.h - t.h, y1); y += 1) {
    for (let x = Math.max(0, x0); x <= Math.min(e.w - t.w, x1); x += 1) {
      const score = scoreAt(e, t, x, y);
      if (score > best.score) best = { score, x, y };
    }
  }
  return best;
}

const SIZES = [0.75, 0.85, 0.92, 1, 1.08, 1.18, 1.3];

/**
 * Looks for the saved hoop picture in today's. Both are grey pictures at
 * MATCH_W x MATCH_H. `yieldNow` lets a caller hand the screen back between
 * sizes so a phone doesn't freeze while it works.
 */
export async function findHoop(
  ref: HoopRef,
  now: Uint8Array,
  yieldNow: () => Promise<void> = () => Promise.resolve()
): Promise<HoopMatch> {
  const eRef: Picture = { p: edges(ref.gray, MATCH_W, MATCH_H), w: MATCH_W, h: MATCH_H };
  const eNow: Picture = { p: edges(now, MATCH_W, MATCH_H), w: MATCH_W, h: MATCH_H };
  const rx = ref.rim.x * MATCH_W;
  const ry = ref.rim.y * MATCH_H;
  // The patch: the backboard above the rim, the rim, the net below; sized by how big the hoop looked.
  const hw = Math.round(55 * ref.scale);
  const up = Math.round(70 * ref.scale);
  const down = Math.round(22 * ref.scale);
  const px0 = Math.max(0, Math.round(rx - hw));
  const py0 = Math.max(0, Math.round(ry - up));
  const pw = Math.min(MATCH_W, Math.round(rx + hw)) - px0;
  const ph = Math.min(MATCH_H, Math.round(ry + down)) - py0;
  const patch = crop(eRef, px0, py0, pw, ph);

  // Coarse: half size, every size of patch.
  const coarseNow = halve(eNow);
  let best = { score: -2, x: 0, y: 0, k: 1 };
  for (const k of SIZES) {
    const t = normalised(halve(resize(patch, k)));
    if (t.w >= coarseNow.w || t.h >= coarseNow.h) continue;
    const s = bestSpot(coarseNow, t);
    if (s.score > best.score) best = { ...s, k };
    await yieldNow();
  }
  if (best.score < 0) return { score: 0, rim: { x: ref.rim.x, y: ref.rim.y }, sizeRatio: 1 };

  // Fine: full size, close to the coarse answer, a few sizes either side.
  let fine = { score: -2, x: best.x * 2, y: best.y * 2, k: best.k };
  for (const k of [best.k * 0.95, best.k, best.k * 1.05]) {
    const t = normalised(resize(patch, k));
    if (t.w >= eNow.w || t.h >= eNow.h) continue;
    const s = bestSpot(eNow, t, best.x * 2 - 4, best.y * 2 - 4, best.x * 2 + 4, best.y * 2 + 4);
    if (s.score > fine.score) fine = { ...s, k };
  }
  const rimX = fine.x + fine.k * (rx - px0);
  const rimY = fine.y + fine.k * (ry - py0);
  return {
    score: Math.max(0, fine.score),
    rim: { x: Math.min(1, Math.max(0, rimX / MATCH_W)), y: Math.min(1, Math.max(0, rimY / MATCH_H)) },
    sizeRatio: fine.k,
  };
}
