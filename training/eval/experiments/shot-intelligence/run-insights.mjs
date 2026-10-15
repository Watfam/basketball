// Runs the coaching engine on the real fingerprints (30 fps), the placebo test (outcome labels shuffled), and replication halves.   node run-insights.mjs -> results/insights.json
import fs from "node:fs";
import path from "node:path";
import { EVAL, readJSON } from "../../lib/registry.mjs";
import { generateInsights } from "./insights.mjs";
import { rng } from "../../lib/stats.mjs";
const RES = path.join(EVAL, "experiments/shot-intelligence/results"), P = readJSON("training/eval/experiments/shot-intelligence/results/fingerprints.json").prints["30fps"], L = readJSON("training/eval/experiments/shot-intelligence/results/labels.json")["30fps"], AN = readJSON("training/eval/experiments/shot-intelligence/results/fingerprint-analysis.json");
const stable = { rim_level_x_bw: AN.repeatability.measures.rim_level_x_bw.STABLE };
const lv = ["4", "3", "2", "1", "0"], dist = (a, b) => { let s = 0, n = 0; for (const l of lv) if (a[l] !== null && b[l] !== null) { s += (a[l] - b[l]) ** 2; n += 1; } return n >= 3 ? Math.sqrt(s / n) : null; };
function clusterIds(items) { let cl = items.map((x) => [x]); const d = (A, B) => { const v = []; for (const a of A) for (const b of B) { const q = dist(a.path, b.path); if (q !== null) v.push(q); } return v.length ? v.reduce((s, x) => s + x, 0) / v.length : Infinity; }; for (;;) { let best = [Infinity, -1, -1]; for (let i = 0; i < cl.length; i += 1) for (let j = i + 1; j < cl.length; j += 1) { const q = d(cl[i], cl[j]); if (q < best[0]) best[0] = q, best[1] = i, best[2] = j; } if (best[0] > 1.0 || best[1] < 0) break; cl[best[1]] = [...cl[best[1]], ...cl[best[2]]]; cl.splice(best[2], 1); } const m = new Map(); cl.forEach((c, i) => c.forEach((x) => m.set(x.id, c.length >= 3 ? i : "u"))); return m; }
function shotsOf(clips) {
  const items = [];
  for (const id of clips) P[id].forEach((fp, i) => items.push({ id: fp.id, clip: id, first: fp.first_zone_frame, outcome: L[id][i].written_outcome, x: fp.measurements.rim_level_x_bw.value, usable: fp.quality.usable_for_comparison, path: fp.rim_level_path_bw, pathN: lv.filter((l) => fp.rim_level_path_bw[l] !== null).length }));
  const m = clusterIds(items.filter((s) => s.pathN >= 3)); return items.filter((s) => s.outcome).map((s) => ({ ...s, cluster: m.has(s.id) ? m.get(s.id) : null }));
}
const SETS = [...Object.keys(P).map((id) => ({ name: id, clips: [id] })), { name: "S4 session (IMG_4839 + IMG_4840)", clips: ["IMG_4839", "IMG_4840"] }];
const out = { generated: new Date().toISOString(), sets: {}, placebo: {}, replication: [] }, seed = 20261117;
for (const S of SETS) {
  const shots = shotsOf(S.clips), rep = S.clips.length === 1 ? !!AN.clustering[S.clips[0]]?.repeatable : false, set = { ...S, shots, stable, clusteringRepeatable: rep };
  const res = generateInsights(set, { seed }); out.sets[S.name] = { matched: shots.length, makes: shots.filter((s) => s.outcome === "make").length, usable_with_measure: shots.filter((s) => s.x !== null && s.usable).length, statements: res.statements };
  for (const st of res.statements.filter((s) => s.status === "supported")) {
    const ord = shots.filter((s) => s.x !== null && s.usable).sort((a, b) => a.first - b.first), half = [ord.slice(0, ord.length >> 1), ord.slice(ord.length >> 1)], dir = [];
    for (const h of half) { const m = h.filter((s) => s.outcome === "make").map((s) => s.x), x = h.filter((s) => s.outcome === "miss").map((s) => s.x), med = (a) => { const q = [...a].sort((p, r) => p - r); return q.length ? q[q.length >> 1] : null; }; let e = null; if (m.length >= 3 && x.length >= 3) e = st.id === "S1" ? med(x.map(Math.abs)) - med(m.map(Math.abs)) : st.id === "S2" ? med(x) - med(m) : null; dir.push(e); }
    out.replication.push({ set: S.name, id: st.id, halves: dir, agree: dir[0] !== null && dir[1] !== null ? Math.sign(dir[0]) === Math.sign(dir[1]) : null, note: "S1/S2 only; halves need 3 of each outcome" });
  }
  // placebo: shuffle labels among matched shots, 400 shuffles
  const r = rng(seed + 7), counts = { shuffles: 400, with_supported: 0, by_statement: {} };
  for (let k = 0; k < 400; k += 1) { const labs = shots.map((s) => s.outcome); for (let i = labs.length - 1; i > 0; i -= 1) { const j = Math.floor(r() * (i + 1)); [labs[i], labs[j]] = [labs[j], labs[i]]; } const sh = shots.map((s, i) => ({ ...s, outcome: labs[i] })); const g = generateInsights({ ...set, shots: sh }, { seed: seed + k }); const sup = g.statements.filter((s) => s.status === "supported" && s.id !== "S4"); if (sup.length) { counts.with_supported += 1; for (const s of sup) counts.by_statement[s.id] = (counts.by_statement[s.id] ?? 0) + 1; } }
  counts.false_claim_rate = counts.with_supported / counts.shuffles; out.placebo[S.name] = counts;
  console.log(S.name.padEnd(34), `matched ${shots.length} usable ${out.sets[S.name].usable_with_measure}`, res.statements.map((s) => `${s.id}:${s.status === "supported" ? "SUPPORTED" : s.reason}`).join(" "), `| placebo ${(counts.false_claim_rate * 100).toFixed(1)}% ${JSON.stringify(counts.by_statement)}`);
}
fs.writeFileSync(path.join(RES, "insights.json"), JSON.stringify(out, null, 1));
console.log("supported statements:", Object.values(out.sets).flatMap((s) => s.statements).filter((s) => s.status === "supported").length, "| replication", JSON.stringify(out.replication.map((r) => [r.set, r.id, r.agree])));
