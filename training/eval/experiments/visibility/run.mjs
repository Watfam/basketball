// Computes every registered metric from the per-tile detections that exist so far.   node run.mjs [clip ...]   -> results/observation.json
import fs from "node:fs";
import path from "node:path";
import { RES, WORK, FRAME, readJSON, crit } from "./common.mjs";
import { loadVision } from "../../lib/transpile.mjs";
import { loadClip, buildStrategies } from "./strategies.mjs";
import { chainFor, observe } from "./metrics.mjs";
const V = await loadVision(), inZone = V.shotRules.inZone, c = crit();
const clips = (process.argv.length > 2 ? process.argv.slice(2) : c.data.clips).filter((id) => fs.existsSync(path.join(WORK, "dets", `${id}.json`)));
const ann = readJSON("training/eval/experiments/visibility/recall-annotations.json").frames;
const out = { generated: new Date().toISOString(), clips, per_clip: {}, retention: {}, recall: {}, cost: {}, fov: {}, frames: {} };
const quant = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
for (const id of clips) {
  const C = loadClip(id), shots = C.d.shots;
  for (const [fk, thin] of [["30fps", 1], ["15fps", 2]]) {
    const S = buildStrategies(C, thin); (out.frames[id] ??= {})[fk] = C.frames.filter((f) => f % thin === 0).length;
    for (const [name, st] of Object.entries(S)) {
      const rows = shots.map((shot) => { const { chain, fragments } = chainFor(st, shot, thin, C.rimU, inZone); const o = observe(chain, shot, thin, C.rimU); return { F: shot.F, fragments, ...o, chain: undefined, releaseInfo: o.releaseInfo }; });
      const a = ((out.per_clip[id] ??= {})[fk] ??= {});
      a[name] = { runs: st.runs, shots: rows.length, chain: rows.filter((r) => r.chain !== false).length, release: rows.filter((r) => r.release).length, apex: rows.filter((r) => r.apex).length, approach: rows.filter((r) => r.approach).length, continuous: rows.filter((r) => r.continuous).length, continuous_strict: rows.filter((r) => r.continuous_strict).length, eligible: rows.filter((r) => r.eligible).length,
        gaps: rows.flatMap((r) => r.gaps.map((g) => g.frames)), fragments_mean: rows.reduce((s, r) => s + r.fragments, 0) / rows.length, tiles: st.tiles ?? null,
        release_timing: rows.filter((r) => r.release && r.E1 != null && r.E2 != null).map((r) => ({ F: r.F, E1: r.E1, E2: r.E2, point: r.releasePoint })), per_shot: rows.map((r) => ({ F: r.F, release: r.release, apex: r.apex, approach: r.approach, continuous: r.continuous, eligible: r.eligible, flight_points: r.flightPoints })) };
    }
    // retention (X5): S0 detections >= 0.4 reproduced within 0.5 ball widths, same frame
    const ret = {}; for (const [name, st] of Object.entries(S)) { let n = 0, k = 0; for (const f of C.frames.filter((f) => f % thin === 0)) for (const b of (S.S0_fixed.byF.get(f) ?? []).filter((b) => b.score >= 0.4)) { n += 1; if ((st.byF.get(f) ?? []).some((x) => Math.hypot((x.x1 + x.x2) / 2 - (b.x1 + b.x2) / 2, (x.y1 + x.y2) / 2 - (b.y1 + b.y2) / 2) <= 12)) k += 1; } ret[name] = { n, kept: k }; }
    ((out.retention[id] ??= {})[fk] = ret);
    // recall (X6): annotated frames of this clip
    const rec = {}; for (const f of ann.filter((a) => a.clip === id && a.ball && a.frame % thin === 0)) {
      const u = { x: (f.ball.cx - C.g.cropX) * C.k, y: (f.ball.cy - C.g.cropY) * C.k }, inside = u.x >= 0 && u.x <= 416 && u.y >= 0 && u.y <= 416;
      for (const [name, st] of Object.entries(S)) { const hit = (st.byF.get(f.frame) ?? []).some((b) => b.score >= 0.25 && Math.hypot((b.x1 + b.x2) / 2 - u.x, (b.y1 + b.y2) / 2 - u.y) <= 18); const r = (rec[name] ??= { inside: { n: 0, hit: 0 }, outside: { n: 0, hit: 0 } })[inside ? "inside" : "outside"]; r.n += 1; r.hit += hit ? 1 : 0; }
    }
    (out.recall[id] ??= {})[fk] = rec;
  }
  // field of view and ball size from the all-tiles chains (30 fps)
  const D = buildStrategies(C, 1).D_all_tiles, fov = { shots: 0, chain_points: 0, near_edge_points: 0, first_obs_outside_window: 0, first_obs_total: 0, min_y: [], widths_release: [], widths_apex: [], widths_rim: [] };
  for (const shot of shots) {
    const { chain } = chainFor(D, shot, 1, C.rimU, inZone); if (!chain) continue; fov.shots += 1;
    const obs = chain.obs.filter((o) => o.f <= shot.F), nat = (o) => ({ x: C.g.cropX + o.x / C.k, y: C.g.cropY + o.y / C.k });
    for (const o of obs) { const p = nat(o); fov.chain_points += 1; if (p.x < 15 || p.y < 15 || p.x > FRAME.w - 15 || p.y > FRAME.h - 15) fov.near_edge_points += 1; }
    if (obs.length) { fov.first_obs_total += 1; const f0 = obs[0]; if (f0.x < 0 || f0.x > 416 || f0.y < 0 || f0.y > 416) fov.first_obs_outside_window += 1; fov.min_y.push(Math.min(...obs.map((o) => nat(o).y))); }
    const o = observe(chain, shot, 1, C.rimU); if (o.release && o.releaseInfo) { const held = obs.find((x) => x.f === o.releaseInfo.heldTo); if (held) fov.widths_release.push(held.w); }
    if (o.apex) { const m = obs.reduce((p, q) => (q.y < p.y ? q : p)); fov.widths_apex.push(m.w); }
    const rimPts = obs.filter((x) => Math.abs(x.y - C.rimU.y) < 60 && Math.abs(x.x - C.rimU.x) < 80); if (rimPts.length) fov.widths_rim.push(rimPts[0].w);
  }
  out.fov[id] = { ...fov, min_y_native: { min: fov.min_y.length ? Math.min(...fov.min_y) : null, median: quant(fov.min_y, 0.5) }, width_u: { release: quant(fov.widths_release, 0.5), apex: quant(fov.widths_apex, 0.5), rim: quant(fov.widths_rim, 0.5), n: [fov.widths_release.length, fov.widths_apex.length, fov.widths_rim.length] }, min_y: undefined, widths_release: undefined, widths_apex: undefined, widths_rim: undefined };
  const ms = {}; for (const [n, a] of Object.entries(C.d.ms)) ms[n] = { median: quant(a, 0.5), n: a.length }; out.cost[id] = ms;
  console.log("done", id);
}
fs.writeFileSync(path.join(RES, "observation.json"), JSON.stringify(out));
