// Applies workstream_D_accuracy criteria D1-D7 of criteria.json mechanically to results/accuracy.json.   node evaluate-accuracy.mjs [config=tracks] -> results/verdict-accuracy.json
import fs from "node:fs";
import path from "node:path";
import { EVAL, readJSON } from "../../lib/registry.mjs";
const RES = path.join(EVAL, "experiments/shot-intelligence/results"), cfg = process.argv[2] ?? "tracks";
const S = readJSON("training/eval/experiments/shot-intelligence/results/accuracy.json"), crit = readJSON("training/eval/experiments/tracker/criteria.json");
const DEV = crit.data.development_tuning, OTHER7 = crit.protocol.clips.filter((c) => c !== "IMG_4873"), FPS = ["30fps", "15fps"], rows = [];
const add = (fps, id, name, pass, detail) => rows.push({ fps, id, name, status: pass ? "pass" : "FAIL", detail });
for (const fps of FPS) {
  let pt = 0, pb = 0; const lose = [];
  for (const id of OTHER7) { const c = S.clips[id][fps], d = c[cfg].correct - c.baseline_legacy.correct; pt += c[cfg].correct; pb += c.baseline_legacy.correct; if (d <= -2) lose.push(`${id} ${d}`); }
  add(fps, "D1", "no harm on the seven other clips", lose.length === 0 && pt - pb > -3, `pooled ${pt - pb >= 0 ? "+" : ""}${pt - pb}; at -2 or worse: ${lose.join(", ") || "none"}; per clip ${OTHER7.map((id) => `${id.slice(4)}:${S.clips[id][fps][cfg].correct - S.clips[id][fps].baseline_legacy.correct}`).join(" ")}`);
  const c73 = S.clips.IMG_4873[fps][cfg];
  add(fps, "D2", "regression case IMG_4873", c73.matched >= 20 && c73.correct >= 17 && c73.longest_zone <= 100, `matched ${c73.matched}/22, V4 right ${c73.correct} (need 17), longest merged ${c73.longest_zone} (baseline ${S.clips.IMG_4873[fps].baseline_legacy.longest_zone})`);
  const ph = S.phantom_4873[fps][cfg].share_of_phantom_boxes, injs = Object.entries(S.injection[fps]).map(([k, v]) => [k, v[cfg].share_in_evidence]), v4 = Object.values(S.injection[fps]).map((v) => v[cfg].v4_right), mean = v4.reduce((a, b) => a + b, 0) / v4.length, clean = S.injection_clean_baseline_dev_v4_right[fps];
  let notBase = 0; for (const id of DEV) for (const f of S.clips[id][fps][cfg].firsts) if (!S.clips[id][fps].baseline_legacy.firsts.some((g) => Math.abs(g - f) <= 15)) notBase += 1;
  add(fps, "D3", "false-positive suppression", ph <= 0.1 && injs.every(([, s]) => s <= 0.1) && clean - mean <= 3 && notBase === 0, `4873 phantom in evidence ${(ph * 100).toFixed(1)}% (baseline ${(S.phantom_4873[fps].baseline_legacy.share_of_phantom_boxes * 100).toFixed(1)}%); injected max ${(Math.max(...injs.map((x) => x[1])) * 100).toFixed(1)}%; injected pooled V4 ${mean.toFixed(1)} vs clean ${clean}; extra counted shots on clean dev clips ${notBase}`);
  const g = S.genuine[fps][cfg], an = S.annotated[fps], st = S.stall["15"][fps][cfg];
  const clutterPct = (100 * g.clutter) / g.genuine, cov = (100 * g.zone_boxes_in_new_evidence) / g.zone_boxes_baseline, hand = an.in_hand ? an.in_hand_retained / an.in_hand : 1;
  add(fps, "D4", "genuine-ball retention", clutterPct <= 0.5 && an.clutter === 0 && cov >= 95 && st.survival.p >= 0.95 && hand >= 0.9, `clutter ${g.clutter}/${g.genuine} (${clutterPct.toFixed(2)}%); annotated clutter ${an.clutter}/${an.true_positives}; zone boxes kept ${cov.toFixed(1)}%; stall survival at 15 frames ${st.survived}/${st.shots} (${(st.survival.p * 100).toFixed(1)}%); in-hand retained ${an.in_hand_retained}/${an.in_hand}`);
  add(fps, "D5", "continuity", g.shots_checked > 0 && g.single_track_shots / g.shots_checked >= 0.9, `${g.single_track_shots}/${g.shots_checked} (${((100 * g.single_track_shots) / g.shots_checked).toFixed(1)}%)`);
  let med = 0, p999 = 0, mx = 0; for (const id of crit.protocol.clips) { const t = S.clips[id][fps][cfg].timing_ms; med = Math.max(med, t.median); p999 = Math.max(p999, t.p999); mx = Math.max(mx, t.max); }
  add(fps, "D6", "overhead (desktop Mac, not a phone)", med <= 0.1 && p999 <= 2, `median <= ${med.toFixed(3)} ms, worst-clip p99.9 ${p999.toFixed(2)} ms (limit 2), worst frame ${mx.toFixed(1)} ms`);
  add(fps, "D7", "legacy equivalence", S.T13_legacy_equivalence.all_identical, `${S.T13_legacy_equivalence.rows.length} checks identical`);
}
const failed = rows.filter((r) => r.status === "FAIL");
const out = { generated: new Date().toISOString(), config: cfg, rows, verdict: failed.length ? "NOT RECOMMENDED" : "RECOMMENDED FOR A LATER INTEGRATION EXPERIMENT", failed: failed.map((r) => `${r.id}@${r.fps}`) };
fs.writeFileSync(path.join(RES, cfg === "tracks" ? "verdict-accuracy.json" : `verdict-accuracy-${cfg}.json`), JSON.stringify(out, null, 1) + "\n");
for (const r of rows) console.log(`${r.fps} ${r.id} ${r.status.padEnd(4)} ${r.name}: ${r.detail}`);
console.log("\nVERDICT:", out.verdict, "| failed:", out.failed.join(" ") || "none");
