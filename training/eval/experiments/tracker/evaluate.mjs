// Applies criteria.json (T1-T13, with addendum 1 and the v2/v3 design rounds) mechanically to the result files. Nothing here is a judgement call.
//   node evaluate.mjs [shots.json] [assoc.json] [verdict-out.json]
import fs from "node:fs";
import path from "node:path";
import { EVAL, readJSON } from "../../lib/registry.mjs";
const RES = path.join(EVAL, "experiments/tracker/results");
const shotsFile = process.argv[2] ?? "shots.json", assocFile = process.argv[3] ?? "assoc-m2-f0.5.json", outFile = process.argv[4] ?? "verdict.json";
const crit = readJSON("training/eval/experiments/tracker/criteria.json"), th = readJSON("training/eval/thresholds.json");
const S = readJSON(`training/eval/experiments/tracker/results/${shotsFile}`), M = readJSON("training/eval/experiments/tracker/results/motion.json"), A = readJSON(`training/eval/experiments/tracker/results/${assocFile}`);
const sel = M.selection.model, KEY = `kalman_${sel}`, FIT = `fit_${sel}`;
const DEV = crit.data.development_tuning, OTHER7 = crit.protocol.clips.filter((c) => c !== "IMG_4873");
const FPS = ["30fps", "15fps"];
const rows = [];
const add = (fps, id, name, pass, detail) => rows.push({ fps, id, name, status: pass === null ? "not_run" : pass ? "pass" : "FAIL", detail });

for (const fps of FPS) {
  // T1
  let pooledTracks = 0, pooledBase = 0; const losers = [];
  for (const id of OTHER7) { const c = S.clips[id][fps], d = c.tracks.correct - c.baseline_legacy.correct; pooledTracks += c.tracks.correct; pooledBase += c.baseline_legacy.correct; if (d <= -2) losers.push(`${id} ${d}`); }
  add(fps, "T1", "no harm on the seven other clips", losers.length === 0 && pooledTracks - pooledBase > -3, `pooled ${pooledTracks - pooledBase >= 0 ? "+" : ""}${pooledTracks - pooledBase}; clips at -2 or worse: ${losers.join(", ") || "none"}; per clip ${OTHER7.map((id) => `${id.slice(4)}:${S.clips[id][fps].tracks.correct - S.clips[id][fps].baseline_legacy.correct}`).join(" ")}`);
  // T2
  const c73 = S.clips.IMG_4873[fps].tracks, need = fps === "30fps" ? 15 : 16;
  add(fps, "T2", "regression case IMG_4873", c73.matched >= 20 && c73.correct >= need && c73.longest_zone <= 100, `matched ${c73.matched}/22, V4 right ${c73.correct} (need ${need}), longest shot ${c73.longest_zone} sightings`);
  // T3
  const ph = S.phantom_4873[fps].tracks.share_of_phantom_boxes, injs = Object.entries(S.injection[fps]).map(([k, v]) => [k, v.tracks.share_in_evidence]);
  const inj4v4 = Object.values(S.injection[fps]).map((v) => v.tracks.v4_right), meanInj = inj4v4.reduce((a, b) => a + b, 0) / inj4v4.length, clean = S.injection_clean_baseline_dev_v4_right[fps];
  let notBase = 0; for (const id of DEV) for (const f of S.clips[id][fps].tracks.firsts) if (!S.clips[id][fps].baseline_legacy.firsts.some((g) => Math.abs(g - f) <= 15)) notBase += 1;
  add(fps, "T3", "false-positive suppression", ph <= 0.1 && injs.every(([, s]) => s <= 0.1) && clean - meanInj <= 3 && notBase === 0, `4873 phantom in evidence ${(ph * 100).toFixed(1)}%; injected max ${(Math.max(...injs.map((x) => x[1])) * 100).toFixed(1)}%; injected pooled V4 mean ${meanInj.toFixed(1)} vs clean ${clean} (gap ${(clean - meanInj).toFixed(1)}); counted shots absent from baseline on clean dev clips: ${notBase}`);
  // T4
  const g = S.genuine[fps].tracks, an = S.annotated[fps], st = S.stall["15"][fps].tracks.survival;
  const clutterPct = (100 * g.clutter) / g.genuine, covPct = (100 * g.zone_boxes_in_new_evidence) / g.zone_boxes_baseline, inHand = an.in_hand ? an.in_hand_retained / an.in_hand : 1;
  add(fps, "T4", "genuine-ball retention", clutterPct <= 0.5 && an.clutter === 0 && covPct >= 95 && st.p >= 0.95 && inHand >= 0.9, `clutter ${g.clutter}/${g.genuine} (${clutterPct.toFixed(2)}%); annotated clutter ${an.clutter}/${an.true_positives}; zone boxes kept ${covPct.toFixed(1)}%; stall survival at 15 frames ${S.stall["15"][fps].tracks.survived}/${S.stall["15"][fps].tracks.shots} (${(st.p * 100).toFixed(1)}%, nearest_last ${S.stall["15"][fps].tracks_nearest_last.survived}); in-hand retained ${an.in_hand_retained}/${an.in_hand}`);
  // T5
  add(fps, "T5", "continuity", g.shots_checked > 0 && g.single_track_shots / g.shots_checked >= 0.9, `${g.single_track_shots}/${g.shots_checked} shots single-track (${((100 * g.single_track_shots) / g.shots_checked).toFixed(1)}%)`);
  // T6
  const at = A.association_synthetic[fps].types, t6 = [];
  for (const [type, r] of Object.entries(at)) {
    if (type === "static_ball_sized") continue;
    const k = r[KEY], n = r.nearest_last, cov = k.in_dominant_track / k.ball_boxes, covN = n.in_dominant_track / n.ball_boxes;
    let ok = cov >= 0.95 && k.switches <= n.switches; if (type === "adjacent_blob" || type === "near_duplicate") ok = ok && cov - covN >= 0.10;
    t6.push(`${type} ${(cov * 100).toFixed(1)}% (nearest_last ${(covN * 100).toFixed(1)}%) sw ${k.switches}/${n.switches}${ok ? "" : " X"}`);
    if (!ok) t6.push("");
  }
  add(fps, "T6", "association, synthetic scenes", !t6.some((x) => x === ""), t6.filter(Boolean).join("; "));
  add(fps, "T6b", "association, real labelled runs", null, "not run: see report");
  // T7
  const mg = A.masked_gap[fps], lim = fps === "30fps" ? 6 : 6, parts = []; let t7ok = true;
  for (const [span, byA] of Object.entries(mg)) { if (+span > lim) continue; const tot = Object.values(byA[KEY]).reduce((a, r) => a + r.tests, 0), same = Object.values(byA[KEY]).reduce((a, r) => a + r.same_id, 0); parts.push(`${span}:${((100 * same) / tot).toFixed(0)}%`); if (same / tot < 0.95) t7ok = false; }
  add(fps, "T7", "occlusion recovery (spans up to 6 reference frames)", t7ok, `same-id reacquisition by hidden span (reference frames): ${parts.join(" ")}`);
  // T8, T9
  const cell = (tbl, base) => { const out = []; for (const reg of ["free_flight", "near_rim"]) for (let k = 1; k <= 6; k += 1) { const r = tbl[fps].all[reg]?.[String(k)]; if (!r) continue; const sel_ = r[base.sel]; if (!sel_ || sel_.unavailable) continue; const bs = base.names.map((b) => r[b]).filter((x) => x && !x.unavailable); if (!bs.length) continue; const bm = Math.min(...bs.map((x) => x.median)), bp = Math.min(...bs.map((x) => x.p95)); out.push({ reg, k, med: sel_.median / bm, p95: sel_.p95 / bp, better: sel_.median <= 0.8 * bm && sel_.p95 <= 1.1 * bp }); } return out; };
  for (const [id, name, tbl, base] of [["T8", "reconstruction (interpolation)", M.interpolation, { sel: FIT, names: ["linear", "constant_velocity", "constant_acceleration"] }], ["T9", "causal prediction", M.prediction, { sel: KEY, names: ["last_value", "constant_velocity", "constant_acceleration"] }]]) {
    const c = cell(tbl, base), bad = c.filter((x) => x.med > 1.1 || x.p95 > 1.2), better = c.filter((x) => x.better).length;
    add(fps, id, name, bad.length === 0, `${c.length} cells; ${bad.length} worse than 1.10x median / 1.20x p95 (worst median ${Math.max(...c.map((x) => x.med)).toFixed(2)}x, worst p95 ${Math.max(...c.map((x) => x.p95)).toFixed(2)}x); improvement in ${better}/${c.length} cells (claimed only if >= 75%): ${better / c.length >= 0.75 ? "CLAIMED" : "not claimed"}`);
  }
  // T10
  let medMax = 0, p999Max = 0, maxMs = 0; for (const id of crit.protocol.clips) { const t = S.clips[id][fps].tracks.timing_ms; medMax = Math.max(medMax, t.median); p999Max = Math.max(p999Max, t.p999); maxMs = Math.max(maxMs, t.max); }
  add(fps, "T10", "overhead (desktop Mac, not a phone)", medMax <= 0.1 && p999Max <= 2, `median <= ${medMax.toFixed(3)} ms, worst-clip p99.9 ${p999Max.toFixed(2)} ms (limit 2), worst frame ${maxMs.toFixed(1)} ms`);
  add(fps, "T13", "legacy equivalence", S.T13_legacy_equivalence.all_identical, `${S.T13_legacy_equivalence.rows.length} clip x rate checks identical`);
}
const out = { generated: new Date().toISOString(), shots_file: shotsFile, assoc_file: assocFile, selected_model: sel, rows };
const failed = rows.filter((r) => r.status === "FAIL"), notRun = rows.filter((r) => r.status === "not_run");
out.verdict = failed.length === 0 && notRun.length === 0 ? "READY FOR INTEGRATION REVIEW" : "NOT READY";
out.failed = failed.map((r) => `${r.id}@${r.fps}`); out.not_run = notRun.map((r) => `${r.id}@${r.fps}`);
fs.writeFileSync(path.join(RES, outFile), JSON.stringify(out, null, 1) + "\n");
for (const r of rows) console.log(`${r.fps} ${r.id.padEnd(4)} ${r.status.padEnd(7)} ${r.name}: ${r.detail}`);
console.log("\nVERDICT:", out.verdict, "| failed:", out.failed.join(" ") || "none", "| not run:", out.not_run.join(" ") || "none");
