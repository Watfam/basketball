// Applies criteria.json mechanically to results/observation.json (+ precision-labels.json).   node evaluate.mjs -> results/verdict.json
import fs from "node:fs";
import path from "node:path";
import { RES, WORK, readJSON, crit } from "./common.mjs";
import { loadClip } from "./strategies.mjs";
const c = crit(), O = readJSON("training/eval/experiments/visibility/results/observation.json"), clips = O.clips, FPS = ["30fps", "15fps"];
const roleOf = Object.fromEntries([...c.data.roles.development.map((x) => [x, "dev"]), ...c.data.roles.validation.map((x) => [x, "val"]), ...c.data.roles.diagnostic_not_a_benchmark.map((x) => [x, "diag"])]);
const prec = fs.existsSync(path.join(RES, "precision-labels.json")) ? readJSON("training/eval/experiments/visibility/results/precision-labels.json") : null;
const strategies = Object.keys(O.per_clip[clips[0]]["30fps"]);
const pct = (k, n) => (n ? (100 * k) / n : null), f1 = (x) => (x == null ? "n/a" : x.toFixed(1));
const pool = (fps, name, key, sel = clips) => { let k = 0, n = 0; for (const id of sel) { const a = O.per_clip[id][fps][name]; k += a[key]; n += a.shots; } return { k, n, p: pct(k, n) }; };
const out = { generated: new Date().toISOString(), clips, tables: {}, criteria: {}, B: {} };
// ---- X1 parity
let pn = 0, pk = 0; for (const id of clips) { const C = loadClip(id); const base = C.d.dets.base ?? {}; for (const [f, boxes] of Object.entries(base)) { const mine = boxes.map(C.toU), sv = C.s0.get(+f) ?? []; for (const s of sv) { pn += 1; if (mine.some((b) => Math.abs(b.x1 - s.x1) < 1.5 && Math.abs(b.y1 - s.y1) < 1.5 && Math.abs(b.x2 - s.x2) < 1.5)) pk += 1; } } }
out.criteria.X1 = { pass: pn > 0 && pk / pn >= 0.99, detail: `${pk}/${pn} saved detections reproduced (${f1(pct(pk, pn))}%)` };
// ---- tables
for (const fps of FPS) { out.tables[fps] = {}; for (const name of strategies) { const row = { runs: O.per_clip[clips[0]][fps][name].runs }; for (const key of ["chain", "release", "apex", "approach", "continuous", "continuous_strict", "eligible"]) row[key] = pool(fps, name, key); row.per_clip = Object.fromEntries(clips.map((id) => { const a = O.per_clip[id][fps][name]; return [id, { shots: a.shots, release: a.release, apex: a.apex, approach: a.approach, continuous: a.continuous, eligible: a.eligible, gaps: a.gaps.length, gap_mean: a.gaps.length ? a.gaps.reduce((x, y) => x + y, 0) / a.gaps.length : 0, fragments: +a.fragments_mean.toFixed(2) }]; })); row.gaps = clips.flatMap((id) => O.per_clip[id][fps][name].gaps); row.fragments = clips.reduce((s, id) => s + O.per_clip[id][fps][name].fragments_mean, 0) / clips.length; out.tables[fps][name] = row; } }
// ---- B headline: best offset on the development clips (30 fps release share), ties to the earlier name
const dev = clips.filter((id) => roleOf[id] === "dev"), cand = ["B_up", "B_left", "B_right", "B_upleft", "B_upright"];
const devScore = cand.map((n) => [n, pool("30fps", n, "release", dev).k]).sort((a, b) => b[1] - a[1]);
out.B = { development_release_counts: Object.fromEntries(devScore), headline: devScore[0][0] };
// ---- retention and recall pooled
const ret = (fps, name) => { let n = 0, k = 0; for (const id of clips) { const r = O.retention[id][fps][name]; n += r.n; k += r.kept; } return { n, k, p: pct(k, n) }; };
const rec = (fps, name, where) => { let n = 0, k = 0; for (const id of clips) { const r = O.recall[id]?.[fps]?.[name]?.[where]; if (r) { n += r.n; k += r.hit; } } return { n, k, p: pct(k, n) }; };
const precOf = (name) => { if (!prec) return null; const pool_ = name === "A1" || name === "POSTHOC_base+A1" ? "A1" : name === "A2" || name === "POSTHOC_base+A2" ? "A2" : name === "A3_full_frame_reference" ? "A3" : name === "S0_fixed" ? null : "tiles"; return pool_ ? { pool: pool_, ...prec[pool_] } : null; };
const procFrames = {}; for (const fps of FPS) procFrames[fps] = clips.reduce((s, id) => s + (O.frames?.[id]?.[fps] ?? 0), 0);
const _unused = 0;
const crow = {}; for (const name of strategies) {
  if (name === "S0_fixed") continue;
  const per = {};
  for (const fps of FPS) {
    const T = out.tables[fps], S = T.S0_fixed, X = T[name], d = (k) => (X[k].p ?? 0) - (S[k].p ?? 0);
    const rIn = rec(fps, name, "inside"), rOut = rec(fps, name, "outside"), sIn = rec(fps, "S0_fixed", "inside"), sOut = rec(fps, "S0_fixed", "outside");
    const rt = ret(fps, name), costExtra = X.runs - 1, pr = precOf(name);
    per[fps] = {
      X2: { pass: X.release.p >= 50 && d("release") >= 25, detail: `release ${f1(X.release.p)}% vs S0 ${f1(S.release.p)}% (${X.release.k}/${X.release.n})` },
      X3: { pass: d("apex") >= 20, detail: `apex ${f1(X.apex.p)}% vs S0 ${f1(S.apex.p)}%` },
      X4: { pass: d("approach") >= -2, detail: `approach ${f1(X.approach.p)}% vs S0 ${f1(S.approach.p)}%` },
      X5: { pass: rt.p >= 95, detail: `${f1(rt.p)}% of S0 detections kept (${rt.k}/${rt.n})` },
      X6: { pass: rOut.n > 0 && (rOut.p - (sOut.p ?? 0)) >= 15 && (rIn.p ?? 0) >= (sIn.p ?? 0) - 2, detail: `outside window ${f1(rOut.p)}% (${rOut.k}/${rOut.n}) vs S0 ${f1(sOut.p)}%; inside ${f1(rIn.p)}% vs S0 ${f1(sIn.p)}%` },
      X8: { pass: d("continuous") >= 20, detail: `continuous ${f1(X.continuous.p)}% vs S0 ${f1(S.continuous.p)}%` },
      X9: { pass: X.eligible.p >= 70, detail: `eligible ${f1(X.eligible.p)}%` },
      X10: { pass: costExtra <= 1, detail: `${X.runs} runs per processed frame` },
    };
    if (pr) { const tot = pr.ball + pr.not_ball + (pr.unsure ?? 0), badShare = (pr.not_ball + (pr.unsure ?? 0)) / tot, thin = fps === "30fps" ? 1 : 2, fpPerFrame = (badShare * pr.population) / thin / procFrames["30fps"]; per[fps].X7 = { pass: pr.ball / tot >= 0.9 && fpPerFrame <= 0.25, detail: `precision of extra detections (pool ${pr.pool}): ${pr.ball}/${tot} ball (${pr.not_ball} not ball, ${pr.unsure ?? 0} unsure); about ${fpPerFrame.toFixed(2)} non-ball extras per processed frame (population ${pr.population} over ${procFrames["30fps"]} frames)` }; } else per[fps].X7 = { pass: null, detail: "precision labels not yet in" };
  }
  crow[name] = per;
}
out.criteria.strategies = crow;
out.release_timing = {}; for (const fps of FPS) for (const name of strategies) { const pts = clips.flatMap((id) => O.per_clip[id][fps][name].release_timing.map((r) => ({ clip: id, ...r }))); const d = pts.filter((r) => r.E2 != null).map((r) => Math.abs(r.E1 - r.E2)).sort((a, b) => a - b); (out.release_timing[fps] ??= {})[name] = { release_shots: out.tables[fps][name].release.k, with_both_estimators: d.length, median_abs_diff_ref_frames: d.length ? d[d.length >> 1] : null, within_2_ref_frames: d.filter((x) => x <= 2).length, share_within_2: d.length ? d.filter((x) => x <= 2).length / d.length : null, points: pts.length ? pts.map((r) => ({ clip: r.clip, F: r.F, E1: r.E1, E2: r.E2, x: r.point && Math.round(r.point.x), y: r.point && Math.round(r.point.y) })) : [] }; }
const verdict = {}; for (const [name, per] of Object.entries(crow)) { const all = []; for (const fps of FPS) for (const [k, v] of Object.entries(per[fps])) all.push([`${k}@${fps}`, v.pass]); verdict[name] = { fails: all.filter(([, p]) => p === false).map(([k]) => k), unknown: all.filter(([, p]) => p === null).map(([k]) => k), recommended: all.every(([, p]) => p === true) }; }
out.verdict = verdict;
fs.writeFileSync(path.join(RES, "verdict.json"), JSON.stringify(out, null, 1) + "\n");
for (const fps of FPS) { console.log(`\n== ${fps}  (pooled over ${clips.length} clips, ${out.tables[fps].S0_fixed.release.n} shots)`); console.log("strategy".padEnd(26), "runs rel%  apex% appr% cont% elig% chains/shot"); for (const name of strategies) { const r = out.tables[fps][name]; console.log(name.padEnd(26), String(r.runs).padStart(3), f1(r.release.p).padStart(5), f1(r.apex.p).padStart(5), f1(r.approach.p).padStart(5), f1(r.continuous.p).padStart(5), f1(r.eligible.p).padStart(5), r.fragments.toFixed(2)); } }
console.log("\nX1", out.criteria.X1.pass ? "pass" : "FAIL", out.criteria.X1.detail, "| B headline", out.B.headline, JSON.stringify(out.B.development_release_counts));
for (const [name, v] of Object.entries(verdict)) console.log(name.padEnd(26), v.recommended ? "RECOMMENDED" : "no", "fails:", v.fails.join(" ") || "-", v.unknown.length ? `unknown: ${v.unknown.join(" ")}` : "");
