// Motion models for the tracker and the interpolation estimators. cv / ca / bal / hyb.
// bal = "ballistic in image space": no sideways acceleration (x constant velocity), free vertical acceleration. Not a physical-gravity claim.
import { createAxis } from "./kalman.mjs";
import { polyfit } from "../../lib/gapeval.mjs";

export const MODEL_ORDERS = { cv: { x: 2, y: 2 }, ca: { x: 3, y: 3 }, bal: { x: 2, y: 3 } };
export const MODEL_NAMES = ["cv", "ca", "bal", "hyb"];
export const DEFAULT_PARAMS = { q2: 0.2, q3: 0.005, R: 2.25 };

function single(name, params) {
  const o = MODEL_ORDERS[name], { q2, q3, R } = { ...DEFAULT_PARAMS, ...params };
  const ax = createAxis(o.x, o.x === 2 ? q2 : q3, R), ay = createAxis(o.y, o.y === 2 ? q2 : q3, R);
  return {
    name, ax, ay,
    init(p, f) { ax.init(p.x, f); ay.init(p.y, f); },
    predict(f) { const a = ax.predict(f), b = ay.predict(f); return { x: a.pos, y: b.pos, vx: a.vel, vy: b.vel, ax: a.acc, ay: b.acc, varX: a.varPos, varY: b.varPos }; },
    update(p, f) {
      const ix = ax.innovation(p.x, f), iy = ay.innovation(p.y, f);
      ax.update(p.x, f); ay.update(p.y, f);
      return -0.5 * (ix.nu * ix.nu / ix.S + Math.log(ix.S) + iy.nu * iy.nu / iy.S + Math.log(iy.S));
    },
    estimate() { const a = ax.state(), b = ay.state(); return { f: a.f, x: a.pos, y: b.pos, vx: a.vel, vy: b.vel, ax: a.acc, ay: b.acc }; },
  };
}

/** A tracker motion model: init(p, f), predict(f) -> {x, y, vx, vy, varX, varY}, update(p, f), estimate(). hyb mixes cv and bal by recent innovation likelihood. */
export function createMotion(name, params = {}) {
  if (name !== "hyb") return single(name, params);
  const a = single("cv", params), b = single("bal", params), lambda = 0.8;
  let la = 0, lb = 0; // exponentially forgotten log-likelihoods
  const weights = () => { const m = Math.max(la, lb), wa = Math.exp(la - m), wb = Math.exp(lb - m); return [wa / (wa + wb), wb / (wa + wb)]; };
  return {
    name,
    init(p, f) { a.init(p, f); b.init(p, f); la = lb = 0; },
    predict(f) {
      const [wa, wb] = weights(), pa = a.predict(f), pb = b.predict(f), mix = (u, v) => wa * u + wb * v;
      const x = mix(pa.x, pb.x), y = mix(pa.y, pb.y);
      return { x, y, vx: mix(pa.vx, pb.vx), vy: mix(pa.vy, pb.vy), ax: mix(pa.ax, pb.ax), ay: mix(pa.ay, pb.ay),
        varX: wa * (pa.varX + (pa.x - x) ** 2) + wb * (pb.varX + (pb.x - x) ** 2), varY: wa * (pa.varY + (pa.y - y) ** 2) + wb * (pb.varY + (pb.y - y) ** 2), weights: { cv: wa, bal: wb } };
    },
    update(p, f) { const na = a.update(p, f), nb = b.update(p, f); la = lambda * la + na; lb = lambda * lb + nb; return Math.max(na, nb); },
    estimate() { const [wa, wb] = weights(), ea = a.estimate(), eb = b.estimate(), mix = (u, v) => wa * u + wb * v; return { f: ea.f, x: mix(ea.x, eb.x), y: mix(ea.y, eb.y), vx: mix(ea.vx, eb.vx), vy: mix(ea.vy, eb.vy), ax: mix(ea.ax, eb.ax), ay: mix(ea.ay, eb.ay) }; },
  };
}

// ---------------------------------------------------------------- interpolation by trajectory fitting (observations on BOTH sides of a gap only)
const evalPoly = (c, t) => c.reduce((s, v, i) => s + v * t ** i, 0);
function fitAxis(pts, t0, get, deg) {
  const d = Math.min(deg, pts.length - 1);
  if (d < 0) return null;
  const c = polyfit(pts.map((p) => p.f - t0), pts.map(get), d);
  return c && { c, d };
}
const rss = (pts, t0, fx, fy) => pts.reduce((s, p) => s + (evalPoly(fx.c, p.f - t0) - p.x) ** 2 + (evalPoly(fy.c, p.f - t0) - p.y) ** 2, 0) / Math.max(1, pts.length);

/** Reconstructed position at frame t from up to W observed points on each side. Returns null if it cannot be fitted. NEVER touches the inputs. */
export function interpolate(name, W, before, after, t) {
  const pts = [...before.slice(-W), ...after.slice(0, W)];
  if (pts.length < 3) return null;
  const t0 = pts[0].f;
  const one = (nm) => { const o = MODEL_ORDERS[nm], fx = fitAxis(pts, t0, (p) => p.x, o.x - 1), fy = fitAxis(pts, t0, (p) => p.y, o.y - 1); return fx && fy ? { fx, fy, r: rss(pts, t0, fx, fy) } : null; };
  if (name !== "hyb") { const m = one(name); return m && { x: evalPoly(m.fx.c, t - t0), y: evalPoly(m.fy.c, t - t0) }; }
  const a = one("cv"), b = one("bal");
  if (!a || !b) return null;
  const wa = Math.exp(-a.r / 2.25), wb = Math.exp(-b.r / 2.25), s = wa + wb || 1;
  return { x: (wa * evalPoly(a.fx.c, t - t0) + wb * evalPoly(b.fx.c, t - t0)) / s, y: (wa * evalPoly(a.fy.c, t - t0) + wb * evalPoly(b.fy.c, t - t0)) / s };
}
