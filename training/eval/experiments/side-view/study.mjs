// Side-view feasibility study. See PREREGISTRATION.md (written first). Needs the replay sample: training/work/phone-replay/hardwood-lab-replay-sample.json
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../../lib/registry.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const G = 9.81, BALL = 0.24, RIM_H = 3.048, RIM_D = 0.457;
const rngSeed = (s) => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rand = rngSeed(20261017);
const U = (a, b) => a + (b - a) * rand();
const N01 = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

// ---------- 1. what the camera really observes (real tracked shots) ----------
const sample = JSON.parse(fs.readFileSync(path.join(ROOT, "training/work/phone-replay/hardwood-lab-replay-sample.json"), "utf8"));
const shots = sample.sessions.flatMap((s) => s.shots).filter((x) => x.points.length >= 12 && x.quality.level !== "none");
const resid = [], slopes = [], widths = [], dts = [], ratios = [];
for (const s of shots) {
  const p = [...s.points].sort((a, b) => a[0] - b[0]);
  const w = p.map((q) => q[3]);
  widths.push(median(w));
  for (let i = 1; i < p.length; i++) dts.push(p[i][0] - p[i - 1][0]);
  // width noise: residual of a local line through 5 neighbours
  for (let i = 2; i < p.length - 2; i++) { const nb = [w[i - 2], w[i - 1], w[i + 1], w[i + 2]]; resid.push((w[i] - (nb[0] + nb[1] + nb[2] + nb[3]) / 4) / (median(w))); }
  // apparent size change along the shot: first third vs last third
  const k = Math.floor(p.length / 3);
  ratios.push(median(w.slice(0, k)) / median(w.slice(-k)));
  const lt = p.map((q) => q[0] / 1000), lw = w.map(Math.log), mt = lt.reduce((a, b) => a + b) / lt.length, mw = lw.reduce((a, b) => a + b) / lw.length;
  slopes.push(lt.reduce((a, t, i) => a + (t - mt) * (lw[i] - mw), 0) / lt.reduce((a, t) => a + (t - mt) ** 2, 0));
}
const sdRobust = (a) => 1.4826 * median(a.map((x) => Math.abs(x - median(a))));
const real = {
  tracks: shots.length, ballWidthPx_median: +median(widths).toFixed(1),
  pixelsPerMetreAtRim: +(median(widths) / BALL).toFixed(0),
  widthNoise_relative_robust_sd: +sdRobust(resid).toFixed(3),
  apparentSizeRatio_firstThird_over_lastThird: { median: +median(ratios).toFixed(3), p10: +pct(ratios, 0.1).toFixed(3), p90: +pct(ratios, 0.9).toFixed(3) },
  logWidthSlope_per_s: { median: +median(slopes).toFixed(3), p10: +pct(slopes, 0.1).toFixed(3), p90: +pct(slopes, 0.9).toFixed(3) },
  frameInterval_ms_median: Math.round(median(dts)),
};
real.sizeCueSignalToNoise = +(Math.abs(real.apparentSizeRatio_firstThird_over_lastThird.median - 1) / (real.widthNoise_relative_robust_sd * Math.sqrt(2 / (Math.floor(24 / 3)))) ).toFixed(2);
console.log("REAL", JSON.stringify(real, null, 1));

// ---------- 2. model ----------
// world: X right, Y up, Z away from the camera. camera at (0, hc, 0), pitch up. image: u right, v up, in pixels, relative to the rim's own image position.
// theta = [x0,y0,z0,vx,vy,vz, logf, pitch, hc, Zr]
const project = (th, P) => {
  const [, , , , , , lf, pitch, hc] = th, f = Math.exp(lf);
  const X = P[0], Y = P[1] - hc, Z = P[2];
  const c = Math.cos(pitch), s = Math.sin(pitch);
  const Yc = c * Y - s * Z, Zc = s * Y + c * Z;
  return [f * X / Zc, f * Yc / Zc, f * BALL / Zc];
};
const pos = (th, t) => [th[0] + th[3] * t, th[1] + th[4] * t - 0.5 * G * t * t, th[2] + th[5] * t];
const observe = (th, ts, withWidth) => {
  const rim = project(th, [0, RIM_H, th[9]]);
  const out = [];
  for (const t of ts) { const q = project(th, pos(th, t)); out.push(q[0] - rim[0], q[1] - rim[1]); if (withWidth) out.push(q[2]); }
  return out;
};
const quantities = (th) => {
  // time the ball is at rim height on the way down
  const a = -0.5 * G, b = th[4], c = th[1] - RIM_H;
  const tr = (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  const tApex = th[4] / G;
  const p = pos(th, tr), v = [th[3], th[4] - G * tr, th[5]];
  return [th[1] + th[4] * tApex - 0.5 * G * tApex * tApex - RIM_H, Math.atan2(-v[1], Math.hypot(v[0], v[2])) * 180 / Math.PI, p[0] * 100, (p[2] - th[9]) * 100, tr];
};
const NAMES = ["apex height above the rim (m)", "entry angle (deg)", "sideways at the rim (cm)", "depth at the rim (cm)"];
const TOL = [0.15, 3, 5, 10];

function lin(A, B) { // solve A X = B (A n x n, B n x m) by Gauss-Jordan
  const n = A.length, m = B[0].length, M = A.map((r, i) => [...r, ...B[i]]);
  for (let i = 0; i < n; i++) { let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r; [M[i], M[p]] = [M[p], M[i]]; const d = M[i][i]; for (let j = i; j < n + m; j++) M[i][j] /= d; for (let r = 0; r < n; r++) if (r !== i) { const f = M[r][i]; if (f) for (let j = i; j < n + m; j++) M[r][j] -= f * M[i][j]; } }
  return M.map((r) => r.slice(n));
}
const jac = (fn, th) => { const base = fn(th); const J = base.map(() => new Array(th.length).fill(0)); th.forEach((v, k) => { const h = Math.max(1e-6, Math.abs(v) * 1e-6); const a = [...th], b = [...th]; a[k] += h; b[k] -= h; const fa = fn(a), fb = fn(b); for (let i = 0; i < base.length; i++) J[i][k] = (fa[i] - fb[i]) / (2 * h); }); return J; };

// ---------- 3. simulated shots ----------
const SIGMA_POS = 1.0; // px: the measured localisation error is 0.81 px median, 1.74 px p95
const SIGMA_W = Math.max(real.widthNoise_relative_robust_sd, 0.03);
function makeShot() {
  const d = U(3, 7.5), b = U(1, 6), hc = U(1.2, 1.7), pitch = U(0.02, 0.2), y0 = U(1.9, 2.5), x0 = N01() * 0.4, alpha = U(48, 62) * Math.PI / 180;
  const Zr = b + d, dh = RIM_H - y0, v = Math.sqrt(G * d * d / (2 * Math.cos(alpha) ** 2 * (d * Math.tan(alpha) - dh)));
  const T = d / (v * Math.cos(alpha));
  const f = (real.pixelsPerMetreAtRim) * Zr; // ball width at the rim equals the real median
  return { th: [x0, y0, b, -x0 / T, v * Math.sin(alpha), v * Math.cos(alpha), Math.log(f), pitch, hc, Zr], T, d, b };
}
const SHOTS = Array.from({ length: 400 }, makeShot);
function boundFor(shot, scenario, withWidth) {
  const ts = []; const dt = real.frameInterval_ms_median / 1000;
  for (let t = shot.T - 0.9; t <= shot.T + 0.05; t += dt) if (t > 0.05) ts.push(t);
  const fn = (th) => observe(th, ts, withWidth);
  const J = jac(fn, shot.th);
  const n = shot.th.length;
  const P = Array.from({ length: n }, () => new Array(n).fill(0));
  // information from data
  const wvec = []; for (let i = 0; i < ts.length; i++) { wvec.push(SIGMA_POS, SIGMA_POS); if (withWidth) wvec.push(SIGMA_W * BALL * Math.exp(shot.th[6]) / (shot.th[9])); }
  for (let i = 0; i < J.length; i++) for (let a = 0; a < n; a++) for (let b2 = 0; b2 < n; b2++) P[a][b2] += J[i][a] * J[i][b2] / (wvec[i] ** 2);
  // priors: the release state is unknown (very weak prior); nuisance parameters by scenario
  const sigma = [5, 3, 8, 5, 8, 8, scenario === "S1" ? 1e-6 : 0.10, scenario === "S1" ? 1e-7 : 3 * Math.PI / 180, scenario === "S1" ? 1e-6 : 0.3, scenario === "S1" ? 1e-6 : 1.0];
  for (let k = 0; k < n; k++) P[k][k] += 1 / (sigma[k] ** 2);
  const C = lin(P, Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))));
  const Q = jac((th) => quantities(th).slice(0, 4), shot.th);
  return Q.map((g) => Math.sqrt(Math.max(0, g.reduce((a, gi, i) => a + gi * g.reduce((s, gj, j) => s + gj * C[i][j], 0), 0))));
}
const summarize = (scenario, withWidth) => {
  const all = SHOTS.map((s) => boundFor(s, scenario, withWidth));
  return NAMES.map((name, q) => { const col = all.map((r) => r[q]); return { quantity: name, tolerance: TOL[q], median: +median(col).toFixed(3), p90: +pct(col, 0.9).toFixed(3), shareWithinTolerance: +(col.filter((x) => x <= TOL[q]).length / col.length).toFixed(2), meets: pct(col, 0.9) <= TOL[q] }; });
};
const results = { S1_bestCase_perfectCalibration_noWidth: summarize("S1", false), S1_withWidthCue: summarize("S1", true), S2_roughlyKnownCamera_noWidth: summarize("S2", false), S2_withWidthCue: summarize("S2", true) };
console.log("BOUNDS", JSON.stringify(results, null, 1));

// Does the simulation's apparent-size change look like the real footage? (If it is larger than real, the simulation flatters the size cue, which only makes the conclusion more cautious.)
const simRatios = SHOTS.map((sh) => { const dt = real.frameInterval_ms_median / 1000; const w = []; for (let t = sh.T - 0.9; t <= sh.T; t += dt) { if (t > 0.05) w.push(project(sh.th, pos(sh.th, t))[2]); } const k = Math.floor(w.length / 3); return median(w.slice(0, k)) / median(w.slice(-k)); });
real.simulatedApparentSizeRatio = { median: +median(simRatios).toFixed(3), p10: +pct(simRatios, 0.1).toFixed(3), p90: +pct(simRatios, 0.9).toFixed(3) };
console.log("SIM RATIO vs REAL", JSON.stringify(real.simulatedApparentSizeRatio), JSON.stringify(real.apparentSizeRatio_firstThird_over_lastThird));

// ---------- 4. one real 3D shot, different camera set-ups: how the picture's arc changes ----------
const ref = SHOTS[0], ts = []; for (let t = ref.T - 0.9; t <= ref.T; t += 0.0667) ts.push(t);
const apparent = [];
for (const pitch of [0.02, 0.1, 0.2]) for (const b of [1, 3, 6]) {
  const Zr = b + ref.d; const th = [...ref.th]; th[2] = b; th[6] = Math.log(real.pixelsPerMetreAtRim * Zr); th[7] = pitch; th[9] = Zr; th[3] = -th[0] / ref.T;
  const o = observe(th, ts, false); // [u,v,...]
  const us = o.filter((_, i) => i % 2 === 0), vs = o.filter((_, i) => i % 2 === 1);
  const iA = vs.indexOf(Math.max(...vs));
  apparent.push({ cameraPitch_deg: +(pitch * 180 / Math.PI).toFixed(0), cameraBehindShooter_m: b, highestPointInPicture_px_above_rim: Math.round(vs[iA]), ballWidthAtApexPx: Math.round(o.length ? project(th, pos(th, ts[iA]))[2] : 0) });
}
console.log("APPARENT", JSON.stringify(apparent));
const trueQ = quantities(ref.th);
const out = { real, bounds: results, sameShotDifferentCameras: { trueApexAboveRim_m: +trueQ[0].toFixed(2), trueEntryAngle_deg: +trueQ[1].toFixed(0), views: apparent }, noise: { positionPx: SIGMA_POS, widthRelative: SIGMA_W }, simulated: SHOTS.length, tolerances: Object.fromEntries(NAMES.map((n, i) => [n, TOL[i]])) };
fs.writeFileSync(path.join(HERE, "results.json"), JSON.stringify(out, null, 1));
const s2ok = results.S2_withWidthCue.every((r) => r.meets) && results.S2_roughlyKnownCamera_noWidth.every((r) => r.meets);
console.log("S2 meets every tolerance:", s2ok);
