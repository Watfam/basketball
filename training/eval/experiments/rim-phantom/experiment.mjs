// The controlled experiment. Runs every candidate filter (filters.mjs, parameters from criteria.json) through the app's own counting core at
// 30 and 15 fps on the eight clips, plus seeded injection, stall and overhead tests, and writes results/experiment.json.
// It evaluates; it never decides: the verdict against criteria.json is in evaluate.mjs and reads these numbers.
//   node experiment.mjs
import fs from "node:fs";
import path from "node:path";
import { ROOT, EVAL, loadRegistry, readJSON, sha256 } from "../../lib/registry.mjs";
import { loadVision } from "../../lib/transpile.mjs";
import { align, RULES } from "../../lib/shots.mjs";
import { rng, quantile, wilson } from "../../lib/stats.mjs";
import { CONFIGS } from "./filters.mjs";

const DIR = path.join(EVAL, "experiments/rim-phantom");
const reg = loadRegistry(), vision = await loadVision(), crit = readJSON("training/eval/experiments/rim-phantom/criteria.json");
const BASE = readJSON("training/eval/reports/baseline-v0.json");
const REF = vision.shotRules.REFERENCE_FPS;
const CLIPS = crit.protocol.clips, DEV = crit.data_use.tuning_and_parameter_derivation;
const FPS = [{ key: "30fps", thin: 1 }, { key: "15fps", thin: 2 }];
const cx = (b) => (b.x1 + b.x2) / 2, cy = (b) => (b.y1 + b.y2) / 2, wd = (b) => b.x2 - b.x1;
const annotations = readJSON("training/eval/annotate/annotations.json");
const phantomEvents = {};
for (const e of annotations.events ?? []) if (e.type === "no_shot") (phantomEvents[e.clip] ??= []).push(e.frame);

/** One pass of the counting core over per-frame boxes, through a filter. `byF`: Map(frame -> boxes[]). Returns calls and filter output. */
function runCore(clip, frames, byF, thin, filter, { timing = false } = {}) {
  const [rx, ry] = clip.window.rim_native;
  const core = vision.counting.createCountingCore({ frameW: 1920, frameH: 1080, rim: { x: rx / 1920, y: ry / 1080 }, scale: clip.window.scale, autoSize: false });
  const calls = [], kept = new Set(), times = [];
  for (let f = 0; f < frames; f += 1) {
    if (thin > 1 && f % thin !== 0) continue;
    const boxes = byF.get(f) ?? [];
    let out;
    if (timing) { const t0 = performance.now(); out = filter.push(f, boxes); times.push(performance.now() - t0); } else out = filter.push(f, boxes);
    for (const b of out) kept.add(b);
    calls.push(...core.push((f * 1000) / REF, out).calls);
  }
  calls.push(...core.flush());
  return { calls: calls.filter((c) => c.counted), kept, times, window: core.window };
}

function score(clip, counted, truth) {
  const phantoms = phantomEvents[clip.id] ?? [];
  const calls = counted.filter((c) => !phantoms.some((f) => Math.abs(c.first - f) <= 3));
  const a = align(calls, truth);
  const correct = a.pairs.filter((p) => p.s.v4 === p.t).length;
  return { counted: calls.length, matched: a.pairs.length, correct, how: a.how, per_shot: truth.map((t, ti) => { const p = a.pairs.find((x) => x.ti === ti); return p ? { ti, truth: t, seen: true, v4: p.s.v4, first: p.s.first } : { ti, truth: t, seen: false }; }), extra: a.extra, longest_zone: counted.length ? Math.max(...counted.map((c) => c.zoneSightings)) : 0 };
}

function load(clip, file = clip.detections.ball6) {
  const d = readJSON(file), byF = new Map();
  for (const x of d.detections) (byF.get(x.f) ?? byF.set(x.f, []).get(x.f)).push({ ...x });
  return { frames: d.frames, byF };
}

const out = { generated: new Date().toISOString(), criteria_sha256: sha256(path.join(DIR, "criteria.json")), criteria_v2_sha256: sha256(path.join(DIR, "criteria-v2.json")), criteria_v3_sha256: sha256(path.join(DIR, "criteria-v3.json")), thresholds_sha256: sha256(path.join(EVAL, "thresholds.json")), baseline_report: "baseline-v0", seeds: { injection: crit.protocol.synthetic_injection.seed_base, stall: crit.protocol.stall_simulation.seed_base } };

// ---------------------------------------------------------------- 0. the baseline must be reproduced exactly
const repro = [];
for (const fps of FPS) {
  const rows = BASE.sections.shot_classification[fps.key === "30fps" ? "current_ball6_30fps" : "current_ball6_15fps"].clips;
  for (const row of rows) {
    const clip = reg.clips.find((c) => c.id === row.clip);
    const { frames, byF } = load(clip);
    const r = runCore(clip, frames, byF, fps.thin, CONFIGS.baseline());
    const s = score(clip, r.calls, readJSON(clip.truth.file).results);
    repro.push({ clip: row.clip, fps: fps.key, baseline_v0: { counted: row.counted, v4: row.correct.v4 }, here: { counted: s.counted, v4: s.correct }, identical: row.counted === s.counted && row.correct.v4 === s.correct });
  }
}
out.baseline_reproduction = { all_identical: repro.every((r) => r.identical), rows: repro };
console.log("baseline reproduction:", out.baseline_reproduction.all_identical ? "IDENTICAL to baseline-v0 on every clip and frame rate" : "MISMATCH");
if (!out.baseline_reproduction.all_identical) { console.log(JSON.stringify(repro.filter((r) => !r.identical))); process.exit(2); }

// ---------------------------------------------------------------- 1. all eight clips, every config, both frame rates
const configNames = Object.keys(CONFIGS);
const oracleSpot = { x: 179.7, y: 194.1 };
const isOracle = (b, minScore = 0.25) => b.score >= minScore && wd(b) < 18 && Math.hypot(cx(b) - oracleSpot.x, cy(b) - oracleSpot.y) <= 14;
const oracleFilter = (minScore) => ({ name: "oracle", push: (f, boxes) => boxes.filter((b) => !isOracle(b, minScore)), stats: () => ({}) });
out.clips = {};
const baselineRuns = {}; // for genuine boxes
for (const fps of FPS) {
  for (const id of CLIPS) {
    const clip = reg.clips.find((c) => c.id === id), truth = readJSON(clip.truth.file).results;
    const configs = { ...Object.fromEntries(configNames.map((n) => [n, CONFIGS[n]])), ...(id === "IMG_4873" ? { oracle: () => oracleFilter(0.25), oracle_all_scores: () => oracleFilter(0) } : {}) };
    for (const [name, make] of Object.entries(configs)) {
      const { frames, byF } = load(clip);
      const filter = make();
      const r = runCore(clip, frames, byF, fps.thin, filter, { timing: true });
      const s = score(clip, r.calls, truth);
      let total = 0, kept = 0, phantomTotal = 0, phantomKept = 0, phantomAllTotal = 0, phantomAllKept = 0;
      for (const [f, boxes] of byF) { if (fps.thin > 1 && f % fps.thin) continue; for (const b of boxes) { total += 1; if (r.kept.has(b)) kept += 1; if (id === "IMG_4873") { if (isOracle(b, 0.25)) { phantomTotal += 1; if (r.kept.has(b)) phantomKept += 1; } if (isOracle(b, 0)) { phantomAllTotal += 1; if (r.kept.has(b)) phantomAllKept += 1; } } } }
      ((out.clips[id] ??= {})[fps.key] ??= {})[name] = { ...s, boxes_in: total, boxes_out: kept, boxes_dropped: total - kept, ...(id === "IMG_4873" ? { phantom_boxes: phantomTotal, phantom_passed: phantomKept, phantom_all_scores: phantomAllTotal, phantom_all_passed: phantomAllKept } : {}), filter_stats: filter.stats(), per_frame_ms: { median: quantile(r.times, 0.5), p95: quantile(r.times, 0.95), max: Math.max(...r.times), mean: r.times.reduce((a, b) => a + b, 0) / r.times.length, frames: r.times.length } };
      if (name === "baseline") baselineRuns[`${id}|${fps.key}`] = { calls: r.calls, byF, frames, thin: fps.thin, score: s };
    }
    console.log(`${fps.key} ${id}: ` + Object.entries(out.clips[id][fps.key]).map(([n, v]) => `${n} ${v.correct}/${truth.length}`).join("  "));
  }
}

// ---------------------------------------------------------------- 2. genuine boxes on the development clips (G1) and annotated genuine balls (G2)
out.genuine = { dev_boxes: {}, annotated: {} };
for (const fps of FPS) {
  const perConfig = Object.fromEntries(configNames.map((n) => [n, { genuine: 0, dropped: 0 }]));
  for (const id of DEV) {
    const clip = reg.clips.find((c) => c.id === id), truth = readJSON(clip.truth.file).results;
    const base = baselineRuns[`${id}|${fps.key}`];
    const a = align(base.calls, truth);
    const windows = a.pairs.map((p) => [p.s.first - 45, p.s.last + 45]);
    for (const name of configNames) {
      const { frames, byF } = load(clip);
      const r = runCore(clip, frames, byF, fps.thin, CONFIGS[name]());
      for (const [f, boxes] of byF) { if (fps.thin > 1 && f % fps.thin) continue; if (!windows.some(([lo, hi]) => f >= lo && f <= hi)) continue; for (const b of boxes) { perConfig[name].genuine += 1; if (!r.kept.has(b)) perConfig[name].dropped += 1; } }
    }
  }
  out.genuine.dev_boxes[fps.key] = Object.fromEntries(Object.entries(perConfig).map(([n, v]) => [n, { ...v, share_dropped: v.dropped / v.genuine, interval: wilson(v.dropped, v.genuine) }]));
}
// annotated genuine balls: the ball-6 true positives in the annotation set, on clips with a saved detection file
const man = readJSON("training/eval/annotate/manifest.json");
const annFiles = { IMG_4874: "training/fixtures/dets6-4874.json", IMG_4872: "training/fixtures/dets6-4872.json", IMG_4839: "training/fixtures/dets6-4839.json", IMG_4851: "training/fixtures/dets6-4851.json", IMG_4866: "training/fixtures/dets6-4866.json", IMG_4873: "training/fixtures/dets6-4873-s1.json" };
for (const fps of FPS) {
  const rows = [];
  for (const [id, file] of Object.entries(annFiles)) {
    const clip = reg.clips.find((c) => c.id === id);
    const targets = annotations.frames.filter((f) => f.id.startsWith("F") && man.frames.find((m) => m.id === f.id).clip === id).flatMap((f) => f.balls.filter((b) => b.confidence !== "low").map((b) => ({ id: f.id, n: man.frames.find((m) => m.id === f.id).n, ball: b }))).filter((t) => fps.thin === 1 || t.n % fps.thin === 0);
    if (!targets.length) continue;
    const win = id === "IMG_4873" ? { ...clip, window: { ...clip.window, ...{ cropX: 848, cropY: 318, cropSize: 416, scale: 1 } } } : clip;
    for (const name of configNames) {
      const { frames, byF } = load(win, file);
      const r = runCore(win, frames, byF, fps.thin, CONFIGS[name]());
      for (const t of targets) {
        const box = (byF.get(t.n) ?? []).filter((b) => Math.hypot(cx(b) - t.ball.cx, cy(b) - t.ball.cy) <= 0.5 * t.ball.diameter).sort((p, q) => q.score - p.score)[0];
        if (box) rows.push({ config: name, id: t.id, clip: id, kept: r.kept.has(box), width: wd(box), score: box.score });
      }
    }
  }
  const byCfg = {};
  for (const r of rows) { const c = (byCfg[r.config] ??= { true_positives: 0, removed: 0, removed_ids: [] }); c.true_positives += 1; if (!r.kept) { c.removed += 1; c.removed_ids.push(`${r.id} (${r.clip}, ${r.width.toFixed(0)} px, score ${r.score.toFixed(2)})`); } }
  for (const c of Object.values(byCfg)) c.interval = wilson(c.removed, c.true_positives);
  out.genuine.annotated[fps.key] = byCfg;
}

// ---------------------------------------------------------------- 3. seeded synthetic phantom injection into the development clips (S2, S2b)
out.injection = {};
const inj = crit.protocol.synthetic_injection;
for (const fps of FPS) {
  const res = {};
  for (const duty of inj.duty_cycles) for (const [si, [ox, oy]] of inj.spots_relative_to_the_window_rim.entries()) {
    const key = `duty${duty}_spot${si}`;
    const rowsByConfig = Object.fromEntries(configNames.map((n) => [n, { injected: 0, injected_passed: 0, v4_right: 0, per_clip: {} }]));
    for (const [ci, id] of DEV.entries()) {
      const clip = reg.clips.find((c) => c.id === id), truth = readJSON(clip.truth.file).results;
      for (const name of configNames) {
        const { frames, byF } = load(clip);
        const [rx, ry] = clip.window.rim_native;
        const probe = vision.counting.createCountingCore({ frameW: 1920, frameH: 1080, rim: { x: rx / 1920, y: ry / 1080 }, scale: clip.window.scale, autoSize: false }).window.rim;
        const rnd = rng(inj.seed_base + 1000 * ci + 100 * si + Math.round(duty * 100));
        const injected = new Set();
        let f = 0;
        while (f < frames) {
          const on = rnd() < duty, len = Math.max(5, Math.round(-Math.log(1 - rnd()) * 60));
          if (on) for (let g = f; g < Math.min(frames, f + len); g += 1) { const b = { f: g, x1: probe.x + ox - 5.5, y1: probe.y + oy - 5.5, x2: probe.x + ox + 5.5, y2: probe.y + oy + 5.5, score: 0.5, _inj: true }; (byF.get(g) ?? byF.set(g, []).get(g)).push(b); injected.add(b); }
          f += len;
        }
        const r = runCore(clip, frames, byF, fps.thin, CONFIGS[name]());
        const s = score(clip, r.calls, truth);
        const row = rowsByConfig[name];
        for (const b of injected) { const g = b.f; if (fps.thin > 1 && g % fps.thin) continue; row.injected += 1; if (r.kept.has(b)) row.injected_passed += 1; }
        row.v4_right += s.correct; row.per_clip[id] = { right: s.correct, counted: s.counted, written: truth.length };
      }
    }
    res[key] = Object.fromEntries(Object.entries(rowsByConfig).map(([n, v]) => [n, { ...v, share_suppressed: v.injected ? 1 - v.injected_passed / v.injected : null }]));
  }
  out.injection[fps.key] = res;
}
out.injection_clean_baseline_dev_v4_right = Object.fromEntries(FPS.map((fps) => [fps.key, DEV.reduce((a, id) => a + out.clips[id][fps.key].baseline.correct, 0)]));
console.log("injection done");

// ---------------------------------------------------------------- 4. stall simulation: a real ball that rests on the rim for S frames
out.stall = {};
for (const S of crit.protocol.stall_simulation.S_frames) {
  out.stall[S] = {};
  for (const fps of FPS) {
    const per = Object.fromEntries([...configNames].map((n) => [n, { shots: 0, survived: 0, failures: [] }]));
    for (const [ci, id] of DEV.entries()) {
      const clip = reg.clips.find((c) => c.id === id), truth = readJSON(clip.truth.file).results;
      const clean = baselineRuns[`${id}|30fps`];
      const cleanScore = score(clip, runCore(clip, clean.frames, load(clip).byF, 1, CONFIGS.baseline()).calls, truth);
      const matched = cleanScore.per_shot.filter((p) => p.seen && p.v4 === p.truth);
      for (let group = 0; group < 3; group += 1) {
        const chosen = matched.filter((_, i) => i % 3 === group);
        const rnd = rng(crit.protocol.stall_simulation.seed_base + 100 * ci + 10 * S + group);
        const { frames, byF } = load(clip);
        const [rx, ry] = clip.window.rim_native;
        const rim = vision.counting.createCountingCore({ frameW: 1920, frameH: 1080, rim: { x: rx / 1920, y: ry / 1080 }, scale: clip.window.scale, autoSize: false }).window.rim;
        // insert S frames of a stationary ball at each chosen shot's first zone sighting; later frames move S later
        const insertAt = chosen.map((p) => p.first).sort((a, b) => a - b);
        const shiftOf = (f) => insertAt.filter((x) => x <= f).length * S;
        const shifted = new Map();
        for (const [f, boxes] of byF) shifted.set(f + shiftOf(f), boxes);
        for (const at of insertAt) {
          const anchor = (byF.get(at) ?? []).filter((b) => Math.abs(cx(b) - rim.x) <= 55 && cy(b) >= rim.y - 50 && cy(b) <= rim.y + 45).sort((a, b) => b.score - a.score)[0];
          if (!anchor) continue;
          const base = shiftOf(at - 1);
          for (let k = 0; k < S; k += 1) shifted.set(at + base + k, [{ ...anchor, x1: anchor.x1 + (rnd() - 0.5) * 2, x2: anchor.x2 + (rnd() - 0.5) * 2, y1: anchor.y1 + (rnd() - 0.5) * 2, y2: anchor.y2 + (rnd() - 0.5) * 2 }]);
        }
        const total = frames + insertAt.length * S;
        for (const name of configNames) {
          // fresh box objects per run are not needed: filters do not mutate boxes
          const r = runCore(clip, total, shifted, fps.thin, CONFIGS[name]());
          const calls = r.calls;
          for (const p of chosen) {
            const expected = p.first + shiftOf(p.first - 1);
            per[name].shots += 1;
            const hit = calls.find((c) => Math.abs(c.first - expected) <= 15 || (fps.thin > 1 && Math.abs(c.first - expected) <= 15));
            const ok = hit && hit.v4 === p.v4;
            if (ok) per[name].survived += 1; else if (per[name].failures.length < 4) per[name].failures.push(`${id} shot #${p.ti + 1} (${hit ? `call ${hit.v4} instead of ${p.v4}` : "not counted"})`);
          }
        }
      }
    }
    for (const v of Object.values(per)) v.survival = wilson(v.survived, v.shots);
    out.stall[S][fps.key] = per;
  }
}
console.log("stall done");

// ---------------------------------------------------------------- 5. overhead
const times = Object.fromEntries(configNames.map((n) => [n, []]));
for (const id of CLIPS) for (const name of configNames) { const e = out.clips[id]["30fps"][name]; times[name].push(e.per_frame_ms); }
out.overhead = Object.fromEntries(configNames.map((n) => [n, { median_ms_per_processed_frame_across_clips: quantile(times[n].map((t) => t.median), 0.5), worst_clip_mean_ms: Math.max(...times[n].map((t) => t.mean)), worst_single_frame_ms: Math.max(...times[n].map((t) => t.max)), note: "filter only; inference on this Mac is about 119 ms a frame" }]));

fs.writeFileSync(path.join(DIR, "results/experiment.json"), JSON.stringify(out, null, 1) + "\n");
console.log("wrote results/experiment.json");
