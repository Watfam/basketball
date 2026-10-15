// Workstream A evaluation: trail purity, link verification, reconstruction error on masked observed points, observed-approach coverage.   node eval-trails.mjs -> results/trails.json
import fs from "node:fs";
import path from "node:path";
import { EVAL } from "../../lib/registry.mjs";
import { analyseClip, CLIPS } from "./shots.mjs";
import { verifyTrail, reconstruct } from "./trail.mjs";
const RES = path.join(EVAL, "experiments/shot-intelligence/results");
const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const out = { generated: new Date().toISOString(), per_clip: {}, A1: {}, A2: {}, A4: {}, approach: {}, breaks: {} };
const isOracle = (p) => p.w < 18 && Math.hypot(p.x - 179.7, p.y - 194.1) <= 14;
const maskErr = { 1: [], 2: [], 3: [] };
let viol = { 30: 0, 15: 0 }, links = { 30: 0, 15: 0 };
for (const thin of [1, 2]) {
  const fk = thin === 1 ? "30fps" : "15fps"; out.approach[fk] = { shots: 0, with_approach: 0, per_clip: {} }; out.breaks[fk] = {};
  for (const id of CLIPS) {
    const A = await analyseClip(id, { thin }), pc = (out.per_clip[id] ??= {})[fk] = { shots: A.shots.length, observed: 0, reconstructed: 0, segments: 0, gaps: 0, ambiguous_events: 0, clutter_events: 0, phantom_points: 0, points: 0, violations: 0 };
    let withAppr = 0;
    for (const s of A.shots) {
      const pts = s.trail.segments.flatMap((g) => g.points), obs = pts.filter((p) => p.type === "observed");
      pc.observed += obs.length; pc.reconstructed += pts.length - obs.length; pc.segments += s.trail.segments.length; pc.gaps += s.trail.gaps.length; pc.points += pts.length;
      pc.ambiguous_events += s.trail.events.filter((e) => e.reason === "ambiguous").length; pc.clutter_events += s.trail.events.filter((e) => e.reason === "clutter").length;
      if (id === "IMG_4873") { const ph = obs.filter(isOracle).length; pc.phantom_points += ph; (out.A1.shot_max_phantom ??= {})[fk] = Math.max(out.A1.shot_max_phantom?.[fk] ?? 0, ph); }
      const v = verifyTrail(s.trail); pc.violations += v.length; viol[fk === "30fps" ? 30 : 15] += v.length; links[fk === "30fps" ? 30 : 15] += Math.max(0, obs.length - s.trail.segments.length);
      for (const r of s.trail.gaps) out.breaks[fk][r.reason] = (out.breaks[fk][r.reason] ?? 0) + 1;
      // approach portion: observed descending points 50-120 px above the rim in the 20 frames before first zone sighting
      const band = obs.filter((p) => p.f >= s.first - 20 && p.f <= s.first && p.y >= A.rim.y - 120 && p.y <= A.rim.y - 50); let desc = 0; for (let i = 1; i < band.length; i += 1) if (band[i].y > band[i - 1].y) desc += 1;
      if (band.length >= 3 && desc >= 2) withAppr += 1;
      if (thin === 1) for (const seg of s.trail.segments) { const o = seg.points.filter((p) => p.type === "observed"); for (let i = 2; i + 5 < o.length; i += 1) for (const k of [1, 2, 3]) { const before = [o[i - 2], o[i - 1]], hidden = o.slice(i, i + k), after = o.slice(i + k, i + k + 2); if (after.length < 2) continue; const consecutive = [...before, ...hidden, ...after].every((p, j, a) => j === 0 || p.f - a[j - 1].f === 1); if (!consecutive) continue; const rec = reconstruct(before, after, hidden.map((p) => p.f)); hidden.forEach((p, j) => maskErr[k].push(Math.hypot(rec[j].x - p.x, rec[j].y - p.y))); } }
    }
    out.approach[fk].shots += A.shots.length; out.approach[fk].with_approach += withAppr; out.approach[fk].per_clip[id] = `${withAppr}/${A.shots.length}`;
    console.log(fk, id, JSON.stringify(pc));
  }
}
const p4873 = out.per_clip.IMG_4873; for (const fk of ["30fps", "15fps"]) out.A1[fk] = { phantom_points: p4873[fk].phantom_points, trail_points: p4873[fk].points, share: p4873[fk].phantom_points / Math.max(1, p4873[fk].points) };
out.A2 = { violations: viol, observed_links_checked: links };
for (const k of [1, 2, 3]) out.A4[k] = { n: maskErr[k].length, median_px: q(maskErr[k], 0.5), p95_px: q(maskErr[k], 0.95), max_px: q(maskErr[k], 1) };
fs.writeFileSync(path.join(RES, "trails.json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ A1: out.A1, A2: out.A2, A4: out.A4, approach: Object.fromEntries(Object.entries(out.approach).map(([k, v]) => [k, `${v.with_approach}/${v.shots}`])), breaks: out.breaks }));
