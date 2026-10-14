// Motion-model comparison. Three SEPARATE evaluations (interpolation, causal prediction, identity association) plus masked-gap reacquisition.
//   node eval-motion.mjs tune       development clips only -> results/selection.json (the registered rule; nothing else is tuned)
//   node eval-motion.mjs evaluate   the frozen selection on every clip, by role, against the baselines -> results/motion.json
import fs from "node:fs";
import path from "node:path";
import { EVAL, loadRegistry, readJSON, sha256 } from "../../lib/registry.mjs";
import { rng, describe, quantile } from "../../lib/stats.mjs";
import { buildRuns, evaluateInterpolation, evaluatePrediction, summarizeCells, MAX_K, GATE_PX_PER_FRAME } from "../../lib/gapeval.mjs";
import { createMotion, interpolate, MODEL_NAMES } from "./motion.mjs";
import { createTracker } from "./tracker.mjs";

const DIR = path.join(EVAL, "experiments/tracker"), RES = path.join(DIR, "results");
const crit = readJSON("training/eval/experiments/tracker/criteria.json");
const reg = loadRegistry();
const DEV = crit.data.development_tuning, VAL = crit.data.validation, DIAG = crit.data.diagnostic_regression_not_a_benchmark;
const ROLE = Object.fromEntries([...DEV.map((c) => [c, "dev"]), ...VAL.map((c) => [c, "validation"]), ...DIAG.map((c) => [c, "diagnostic"])]);
const ALL = [...DEV, ...VAL, ...DIAG];
const FPS = [{ key: "30fps", step: 1 }, { key: "15fps", step: 2 }];
const GRID = crit.tuning_protocol.grid;
const mode = process.argv[2];

const dets = (id) => readJSON(reg.clips.find((c) => c.id === id).detections.ball6).detections;
const region = (pts) => (pts.every((p) => p.y < 150) ? "free_flight" : "near_rim");
const err = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

/** Runs of consecutive single-box frames, keeping the box (width, score) for the scene tests. Same linking rule as gapeval.buildRuns. */
function buildRunsFull(dd, step) {
  const byF = new Map();
  for (const d of dd) if (d.score >= 0.25) (byF.get(d.f) ?? byF.set(d.f, []).get(d.f)).push(d);
  const pt = (f) => { const l = byF.get(f); if (!l || l.length !== 1) return null; const d = l[0]; return { f, x: (d.x1 + d.x2) / 2, y: (d.y1 + d.y2) / 2, w: d.x2 - d.x1, h: d.y2 - d.y1, score: d.score }; };
  const frames = [...byF.keys()].filter((f) => f % step === 0).sort((a, b) => a - b);
  const runs = []; let cur = [];
  for (const f of frames) { const p = pt(f), last = cur[cur.length - 1]; if (p && last && f - last.f === step && Math.hypot(p.x - last.x, p.y - last.y) <= GATE_PX_PER_FRAME * step) cur.push(p); else { if (cur.length) runs.push(cur); cur = p ? [p] : []; } }
  if (cur.length) runs.push(cur);
  return runs;
}
const runsFor = (clips, step) => Object.fromEntries(clips.map((id) => [id, buildRuns(dets(id), { step, minScore: 0.25 })]));

// ---------------------------------------------------------------- causal prediction errors of a Kalman model over a run's whole history
function addCell(cells, reg_, h, name, e, label, group) { const c = (((cells[reg_] ??= {})[h] ??= {})[name] ??= { errors: [], labels: [], groups: [] }); c.errors.push(e); c.labels.push(label); c.groups.push(group); }
function predictionCells(runsByClip, specs, cells = {}) {
  for (const [clip, runs] of Object.entries(runsByClip)) runs.forEach((run, ri) => {
    for (const [name, spec] of Object.entries(specs)) {
      const m = createMotion(spec.model, spec.params);
      for (let j = 0; j < run.length; j += 1) {
        if (j === 0) m.init(run[0], run[0].f); else m.update(run[j], run[j].f);
        if (j + 1 < 3) continue;
        for (let h = 1; h <= MAX_K && j + h < run.length; h += 1) {
          const truth = run[j + h], p = m.predict(truth.f);
          addCell(cells, region([run[j - 2], run[j - 1], run[j], truth]), h, name, err(p, truth), `${clip} f${truth.f}`, `${clip}#${ri}`);
        }
      }
    }
  });
  return cells;
}
function interpolationCells(runsByClip, specs, cells = {}) {
  for (const [clip, runs] of Object.entries(runsByClip)) runs.forEach((run, ri) => {
    for (let k = 1; k <= MAX_K; k += 1) for (let i = 2; i + k + 1 < run.length; i += 1) {
      const hidden = run.slice(i, i + k), reg_ = region([run[i - 2], run[i - 1], ...hidden, run[i + k], run[i + k + 1]]);
      for (const [name, spec] of Object.entries(specs)) {
        const before = run.slice(Math.max(0, i - spec.W), i), after = run.slice(i + k, i + k + spec.W);
        for (const h of hidden) { const p = interpolate(spec.model, spec.W, before, after, h.f); if (p) addCell(cells, reg_, k, name, err(p, h), `${clip} f${h.f}`, `${clip}#${ri}`); }
      }
    }
  });
  return cells;
}
/** Registered score: mean over summarised cells of (median + p95) / 2; cells that are unavailable are skipped. */
function score(summaryByFps, name) {
  const v = [];
  for (const fps of Object.values(summaryByFps)) for (const reg_ of Object.values(fps)) for (const byM of Object.values(reg_)) { const c = byM[name]; if (c && !c.unavailable) v.push((c.median + c.p95) / 2); }
  return v.length ? { score: v.reduce((a, b) => a + b, 0) / v.length, cells: v.length } : { score: Infinity, cells: 0 };
}
const summarize = (cells) => summarizeCells(cells, { minN: 30, minFlights: 10, seed: 20261102 });
/** Tuning needs only median and p95 (the registered score); no bootstrap, same availability rules. */
function quick(cells) {
  const out = {};
  for (const [reg_, byK] of Object.entries(cells)) for (const [k, byM] of Object.entries(byK)) for (const [m, c] of Object.entries(byM)) {
    const flights = new Set(c.groups).size;
    ((out[reg_] ??= {})[k] ??= {})[m] = c.errors.length < 30 || flights < 10 ? { n: c.errors.length, unavailable: true } : { n: c.errors.length, median: quantile(c.errors, 0.5), p95: quantile(c.errors, 0.95) };
  }
  return out;
}

// ---------------------------------------------------------------- stage 1: tuning on the development clips
if (mode === "tune") {
  const specsFor = (model) => {
    const out = {};
    const q2s = GRID.q2_accel_density_for_order2_axes, q3s = GRID.q3_jerk_density_for_order3_axes, Rs = GRID.R_measurement_variance_px2;
    for (const R of Rs) {
      if (model === "cv") for (const q2 of q2s) out[`cv|${q2}|-|${R}`] = { model, params: { q2, R } };
      if (model === "ca") for (const q3 of q3s) out[`ca|-|${q3}|${R}`] = { model, params: { q3, R } };
      if (model === "bal" || model === "hyb") for (const q2 of q2s) for (const q3 of q3s) out[`${model}|${q2}|${q3}|${R}`] = { model, params: { q2, q3, R } };
    }
    return out;
  };
  const result = { registered_rule: crit.tuning_protocol.prediction_rule, grid: GRID, models: {} };
  const runs = Object.fromEntries(FPS.map((f) => [f.key, runsFor(DEV, f.step)]));
  for (const model of MODEL_NAMES) {
    const specs = specsFor(model), summaries = {};
    for (const f of FPS) summaries[f.key] = quick(predictionCells(runs[f.key], specs));
    const scored = Object.keys(specs).map((n) => ({ config: n, params: specs[n].params, ...score(summaries, n) })).sort((a, b) => a.score - b.score);
    // interpolation window per model, at that model's best prediction params (the interpolation fits have no noise parameters)
    const interp = {};
    for (const W of GRID.interpolation_window_points_each_side_W) { const sp = { [`${model}|W${W}`]: { model, W } }; const s = {}; for (const f of FPS) s[f.key] = quick(interpolationCells(runs[f.key], sp)); interp[W] = score(s, `${model}|W${W}`); }
    const bestW = Number(Object.entries(interp).sort((a, b) => a[1].score - b[1].score)[0][0]);
    result.models[model] = { best: scored[0], runner_up: scored[1], all_configs_scored: scored.length, interpolation_score_by_W: interp, interpolation_W: bestW };
    console.log(`${model}: best ${scored[0].config} score ${scored[0].score.toFixed(3)} over ${scored[0].cells} cells | W ${bestW} (${JSON.stringify(Object.fromEntries(Object.entries(interp).map(([w, v]) => [w, +v.score.toFixed(3)])))})`);
  }
  // select the model: lowest prediction score, within 2% prefer fewer parameters (cv, bal, ca, hyb)
  const order = ["cv", "bal", "ca", "hyb"], lowest = Math.min(...MODEL_NAMES.map((m) => result.models[m].best.score));
  const selected = order.find((m) => result.models[m].best.score <= lowest * 1.02);
  result.selected = { model: selected, params: result.models[selected].best.params, interpolation_W: result.models[selected].interpolation_W, why: `lowest dev score ${lowest.toFixed(3)}; first in parameter-count order within 2%` };
  result.per_model_frozen = Object.fromEntries(MODEL_NAMES.map((m) => [m, { params: result.models[m].best.params, W: result.models[m].interpolation_W }]));
  result.criteria_sha256 = sha256(path.join(DIR, "criteria.json"));
  fs.writeFileSync(path.join(RES, "selection.json"), JSON.stringify(result, null, 1) + "\n");
  console.log("SELECTED", JSON.stringify(result.selected));
}

// ---------------------------------------------------------------- stage 2: the frozen selection against the baselines, every clip
if (mode === "evaluate") {
  const sel = readJSON("training/eval/experiments/tracker/results/selection.json");
  if (sel.criteria_sha256 !== sha256(path.join(DIR, "criteria.json"))) { console.error("criteria changed since tuning"); process.exit(2); }
  const out = { selection: sel.selected, per_model_frozen: sel.per_model_frozen, prediction: {}, interpolation: {}, association_synthetic: {}, masked_gap: {} };
  const predSpecs = Object.fromEntries(MODEL_NAMES.map((m) => [`kalman_${m}`, { model: m, params: sel.per_model_frozen[m].params }]));
  const interpSpecs = Object.fromEntries(MODEL_NAMES.map((m) => [`fit_${m}`, { model: m, W: sel.per_model_frozen[m].W }]));
  for (const f of FPS) {
    out.prediction[f.key] = {}; out.interpolation[f.key] = {};
    const groups = { all: ALL, dev: DEV, validation: VAL, diagnostic: DIAG };
    for (const [g, clips] of Object.entries(groups)) {
      const runs = runsFor(clips, f.step);
      const pc = evaluatePrediction(runs); predictionCells(runs, predSpecs, pc);
      out.prediction[f.key][g] = summarize(pc);
      const ic = evaluateInterpolation(runs, { step: f.step }); interpolationCells(runs, interpSpecs, ic);
      out.interpolation[f.key][g] = summarize(ic);
    }
    console.log(`${f.key}: prediction and interpolation done`);
  }

  // ---- synthetic association scenes: real ball runs plus a distractor that persists through the run
  const SC = crit.protocol.synthetic_association_scenes, TYPES = SC.types;
  const box = (x, y, w, score) => ({ x1: x - w / 2, y1: y - w / 2, x2: x + w / 2, y2: y + w / 2, score });
  function scene(type, run, others, r) {
    const frames = run.map((p) => ({ f: p.f, ball: box(p.x, p.y, p.w, p.score), extra: [] }));
    const mid = run[run.length >> 1], ang = r() * 2 * Math.PI;
    frames.forEach((fr, i) => {
      const p = run[i];
      if (type === "static_blob") fr.extra.push(box(mid.x + Math.cos(ang) * (15 + r() * 40), mid.y + Math.sin(ang) * (15 + r() * 40), 16, 0.6));
      if (type === "adjacent_blob") { const q = run[Math.max(0, i - 1)]; fr.extra.push(box(q.x - 6, q.y - 8, 20, 0.6)); }
      if (type === "near_duplicate") fr.extra.push(box(p.x + 6 + r() * 6, p.y - 6 - r() * 6, p.w, 0.55));
      if (type === "slow_mover") fr.extra.push(box(run[0].x + 25 + 4 * i, run[0].y + 25 + 3 * i, 20, 0.6));
      if (type === "static_ball_sized") fr.extra.push(box(mid.x + 18 * Math.cos(ang) + 14, mid.y + 18 * Math.sin(ang) + 14, 24, 0.7));
      if (type === "phantom_capture") fr.extra.push(box(mid.x, mid.y, 11, 0.5));
      if (type === "second_ball" && others.length) { const o = others[0], j = Math.min(i, o.length - 1); fr.extra.push(box(o[j].x + (mid.x - o[Math.min(o.length - 1, run.length >> 1)].x) + 30, o[j].y + (mid.y - o[Math.min(o.length - 1, run.length >> 1)].y), o[j].w, o[j].score)); }
    });
    return frames;
  }
  const ASSOC = [{ key: "nearest_last", opts: { associator: "nearest_last" } }, { key: "cv_nearest", opts: { associator: "cv_nearest" } }, ...MODEL_NAMES.map((m) => ({ key: `kalman_${m}`, opts: { associator: "kalman", model: m, modelParams: sel.per_model_frozen[m].params } }))];
  for (const f of FPS) {
    const rows = {};
    const rnd = rng(SC.seed_base + f.step);
    let nRuns = 0;
    for (const id of ALL) {
      const runs = buildRunsFull(dets(id), f.step).filter((r) => r.length >= (f.step === 1 ? 12 : 8));
      runs.forEach((run, ri) => {
        nRuns += 1;
        for (const type of TYPES) {
          const frames = scene(type, run, runs.filter((_, j) => j !== ri).slice(0, 1), rnd);
          for (const a of ASSOC) {
            const t = createTracker(a.opts); const ballKey = new Map(frames.map((fr) => [fr.f, `${((fr.ball.x1 + fr.ball.x2) / 2).toFixed(4)},${((fr.ball.y1 + fr.ball.y2) / 2).toFixed(4)}`]));
            const ballTrack = []; const extraByTrack = new Map();
            for (const fr of frames) {
              const snap = t.push(fr.f, [fr.ball, ...fr.extra]);
              const key = ballKey.get(fr.f);
              let id_ = null;
              for (const tr of snap.tracks) { const o = tr.obs[tr.obs.length - 1]; if (o.f === fr.f && `${o.x.toFixed(4)},${o.y.toFixed(4)}` === key) { id_ = tr.id; } }
              ballTrack.push(id_);
              for (const e of fr.extra) for (const tr of snap.tracks) { const o = tr.obs[tr.obs.length - 1]; if (o.f === fr.f && Math.abs(o.x - (e.x1 + e.x2) / 2) < 1e-6 && Math.abs(o.y - (e.y1 + e.y2) / 2) < 1e-6) extraByTrack.set(tr.id, (extraByTrack.get(tr.id) ?? 0) + 1); }
            }
            const counts = new Map(); for (const i of ballTrack) if (i !== null) counts.set(i, (counts.get(i) ?? 0) + 1);
            const dom = [...counts.entries()].sort((x, y) => y[1] - x[1])[0];
            let switches = 0; for (let i = 1; i < ballTrack.length; i += 1) if (ballTrack[i] !== ballTrack[i - 1]) switches += 1;
            const row = ((rows[type] ??= {})[a.key] ??= { runs: 0, ball_boxes: 0, in_dominant_track: 0, switches: 0, contaminated_boxes: 0, runs_fully_in_one_track: 0, per_role: {} });
            row.runs += 1; row.ball_boxes += frames.length; row.in_dominant_track += dom ? dom[1] : 0; row.switches += switches; row.contaminated_boxes += dom ? (extraByTrack.get(dom[0]) ?? 0) : 0; row.runs_fully_in_one_track += dom && dom[1] === frames.length ? 1 : 0;
            const pr = (row.per_role[ROLE[id]] ??= { runs: 0, ball_boxes: 0, in_dominant_track: 0, switches: 0 }); pr.runs += 1; pr.ball_boxes += frames.length; pr.in_dominant_track += dom ? dom[1] : 0; pr.switches += switches;
          }
        }
      });
    }
    out.association_synthetic[f.key] = { scene_runs: nRuns, note: "SYNTHETIC distractors on real ball runs; not real-footage identity", types: rows };
    console.log(`${f.key}: association scenes done (${nRuns} runs)`);
  }

  // ---- masked-gap reacquisition: hide a span of observations in a real single-ball run; does the tracker carry the same id across it?
  for (const f of FPS) {
    const res = {};
    for (const id of ALL) {
      for (const run of buildRunsFull(dets(id), f.step).filter((r) => r.length >= (f.step === 1 ? 14 : 9))) {
        for (const span of [1, 2, 3, 4, 5, 6, 7, 8]) {
          if (span % f.step) continue; // a 15 fps stream can only hide whole processed frames
          const hiddenN = span / f.step;
          for (const startIdx of [Math.floor(run.length * 0.3), Math.floor(run.length * 0.55)]) {
            if (startIdx < 4 || startIdx + hiddenN + 2 >= run.length) continue;
            for (const a of ASSOC) {
              const t = createTracker(a.opts); const ids = [];
              run.forEach((p, i) => { if (i >= startIdx && i < startIdx + hiddenN) { t.push(p.f, []); return; } const b = { x1: p.x - p.w / 2, y1: p.y - p.w / 2, x2: p.x + p.w / 2, y2: p.y + p.w / 2, score: p.score }; const snap = t.push(p.f, [b]); const tr = snap.tracks.find((x) => x.obs[x.obs.length - 1].f === p.f); ids.push(tr ? tr.id : null); });
              const before = ids[startIdx - 1], after = ids[startIdx];
              const c = (((res[span] ??= {})[a.key] ??= {})[ROLE[id]] ??= { tests: 0, same_id: 0 });
              c.tests += 1; if (before !== null && before === after) c.same_id += 1;
            }
          }
        }
      }
    }
    out.masked_gap[f.key] = res;
    console.log(`${f.key}: masked gap done`);
  }
  fs.writeFileSync(path.join(RES, "motion.json"), JSON.stringify(out) + "\n");
  console.log("wrote results/motion.json");
}
