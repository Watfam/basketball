// Shot-level evaluation of the tracker + shot machine against baseline-v0, plus injection, stall, genuine retention, continuity, overhead.
//   node eval-shots.mjs -> results/accuracy.json     (needs results/selection.json from `eval-motion.mjs tune`)
// Pipeline: ball-6 detections (score >= 0.2, as the app) -> [tracker -> shot machine -> V4 decision] or [legacy zone grouping] -> scored exactly as baseline-v0.
import fs from "node:fs";
import path from "node:path";
import { EVAL, loadRegistry, readJSON, sha256 } from "../../lib/registry.mjs";
import { loadVision } from "../../lib/transpile.mjs";
import { align } from "../../lib/shots.mjs";
import { rng, quantile, wilson } from "../../lib/stats.mjs";
import { legacyCounter } from "../tracker/decide.mjs";
import { createTracker } from "../tracker/tracker.mjs";
import { createShotMachine } from "../tracker/shotmachine.mjs";
import { CONFIGS as H_FILTERS } from "../rim-phantom/filters.mjs";

const DIR = path.join(EVAL, "experiments/tracker"), RES = path.join(EVAL, "experiments/shot-intelligence/results");
const crit = readJSON("training/eval/experiments/tracker/criteria.json"), sel = readJSON("training/eval/experiments/tracker/results/selection.json");

const reg = loadRegistry(), V = await loadVision(), R = V.shotRules, REF = R.REFERENCE_FPS;
const BASE = readJSON("training/eval/reports/baseline-v0.json");
const CLIPS = crit.protocol.clips, DEV = crit.data.development_tuning;
const FPS = [{ key: "30fps", thin: 1 }, { key: "15fps", thin: 2 }];
const cx = (b) => (b.x1 + b.x2) / 2, cy = (b) => (b.y1 + b.y2) / 2, wd = (b) => b.x2 - b.x1;
const annotations = readJSON("training/eval/annotate/annotations.json"), manifest = readJSON("training/eval/annotate/manifest.json");
const phantomEvents = {}; for (const e of annotations.events ?? []) if (e.type === "no_shot") (phantomEvents[e.clip] ??= []).push(e.frame);
const oracleSpot = { x: 179.7, y: 194.1 }, isOracle = (b, min = 0.25) => b.score >= min && wd(b) < 18 && Math.hypot(cx(b) - oracleSpot.x, cy(b) - oracleSpot.y) <= 14;

// ---- configurations
const trackCfg = (associator, model, params, W) => ({ kind: "tracks", opts: { associator, model, modelParams: params, interpW: W } });
const SELM = sel.selected.model;
const CONFIG = {
  baseline_legacy: { kind: "legacy" },
  H2_legacy: { kind: "legacy", filter: "H2" },
  tracks: { kind: "tracks", opts: { associator: "cv_nearest" } },
  tracks_kalman_round2: trackCfg("kalman", SELM, sel.selected.params, sel.selected.interpolation_W),
};
Object.assign(CONFIG.tracks_kalman_round2.opts, { gate: { maneuver: 0, ballFraction: 0, lastObs: false } });
const CORE = ["baseline_legacy", "H2_legacy", "tracks", "tracks_kalman_round2"];

const rimOf = (clip) => { const [rx, ry] = clip.window.rim_native; return V.counting.createCountingCore({ frameW: 1920, frameH: 1080, rim: { x: rx / 1920, y: ry / 1080 }, scale: clip.window.scale, autoSize: false }).window.rim; };
const load = (clip, file = clip.detections.ball6) => { const d = readJSON(file), byF = new Map(); for (const x of d.detections) (byF.get(x.f) ?? byF.set(x.f, []).get(x.f)).push({ ...x }); return { frames: d.frames, byF }; };

/** One pass. Returns the counted calls, and for tracker configs the tracker and machine for later queries. */
function runPipeline(clip, frames, byF, thin, cfgName, { timing = false } = {}) {
  const cfg = CONFIG[cfgName], rim = rimOf(clip), calls = [], times = [];
  if (cfg.kind === "legacy") {
    const filter = cfg.filter ? H_FILTERS[cfg.filter]() : null, lc = legacyCounter(rim, R), kept = new Set();
    for (let f = 0; f < frames; f += 1) {
      if (thin > 1 && f % thin) continue;
      let boxes = byF.get(f) ?? [];
      const t0 = timing ? performance.now() : 0;
      if (filter) boxes = filter.push(f, boxes);
      for (const b of boxes) kept.add(b);
      calls.push(...lc.push((f * 1000) / REF, boxes));
      if (timing) times.push(performance.now() - t0);
    }
    calls.push(...lc.flush());
    return { calls, counted: calls.filter((c) => c.counted), times, kept, rim };
  }
  const tr = createTracker(timing ? cfg.opts : { ...cfg.opts, retainFrames: Infinity }), M = createShotMachine({ rim, scene: tr.scene, rules: R, keepAllViews: !timing });
  let lastF = 0;
  for (let f = 0; f < frames; f += 1) {
    if (thin > 1 && f % thin) continue;
    const boxes = byF.get(f) ?? [];
    const t0 = timing ? performance.now() : 0;
    const snap = tr.push(f, boxes);
    calls.push(...M.push(snap));
    if (timing) times.push(performance.now() - t0);
    lastF = f;
  }
  calls.push(...M.flush(lastF));
  return { calls, counted: calls.filter((c) => c.counted), times, tracker: tr, machine: M, rim };
}

function score(clip, counted, truth) {
  const ph = phantomEvents[clip.id] ?? [];
  const cs = counted.filter((c) => !ph.some((f) => Math.abs(c.first - f) <= 3));
  const a = align(cs, truth);
  const correct = a.pairs.filter((p) => p.s.v4 === p.t).length;
  return { counted: cs.length, matched: a.pairs.length, correct, how: a.how, extra: a.extra, longest_zone: cs.length ? Math.max(...cs.map((c) => c.zoneSightings)) : 0,
    per_shot: truth.map((t, ti) => { const p = a.pairs.find((x) => x.ti === ti); return p ? { ti, truth: t, seen: true, v4: p.s.v4, first: p.s.first } : { ti, truth: t, seen: false }; }), firsts: cs.map((c) => c.first) };
}

const out = { generated: new Date().toISOString(), criteria_sha256: sha256(path.join(EVAL, "experiments/shot-intelligence/criteria.json")), selection: sel.selected, configs: Object.fromEntries(Object.entries(CONFIG).map(([k, v]) => [k, v.kind === "legacy" ? v : v.opts])) };

// ---------------------------------------------------------------- T13: the decision replica reproduces baseline-v0
const repro = [];
for (const fps of FPS) {
  const rows = BASE.sections.shot_classification[fps.key === "30fps" ? "current_ball6_30fps" : "current_ball6_15fps"].clips;
  for (const row of rows) {
    const clip = reg.clips.find((c) => c.id === row.clip), { frames, byF } = load(clip);
    const r = runPipeline(clip, frames, byF, fps.thin, "baseline_legacy"), s = score(clip, r.counted, readJSON(clip.truth.file).results);
    repro.push({ clip: row.clip, fps: fps.key, baseline_v0: { counted: row.counted, v4: row.correct.v4 }, here: { counted: s.counted, v4: s.correct }, identical: row.counted === s.counted && row.correct.v4 === s.correct });
  }
}
out.T13_legacy_equivalence = { all_identical: repro.every((r) => r.identical), rows: repro };
console.log("T13 legacy equivalence:", out.T13_legacy_equivalence.all_identical ? "IDENTICAL on every clip and frame rate" : "MISMATCH");
if (!out.T13_legacy_equivalence.all_identical) { console.log(JSON.stringify(repro.filter((r) => !r.identical))); process.exit(2); }

// ---------------------------------------------------------------- all clips, every config, both frame rates
out.clips = {}; const baselineByKey = {};
for (const fps of FPS) for (const id of CLIPS) {
  const clip = reg.clips.find((c) => c.id === id), truth = readJSON(clip.truth.file).results;
  const row = ((out.clips[id] ??= {})[fps.key] ??= {});
  for (const name of Object.keys(CONFIG)) {
    const { frames, byF } = load(clip), r = runPipeline(clip, frames, byF, fps.thin, name, { timing: true }), s = score(clip, r.counted, truth);
    row[name] = { ...s, timing_ms: { median: quantile(r.times, 0.5), p99: quantile(r.times, 0.99), p999: quantile(r.times, 0.999), max: Math.max(...r.times), frames: r.times.length },
      ...(r.tracker ? { tracks: r.tracker.all().length, counted_flags: r.counted.map((c) => ({ first: c.first, startedInWindow: c.flags.startedInWindow, ballFirstSeenInZone: c.flags.ballFirstSeenInZone, heldObserved: c.flags.heldObserved, release: !!c.flags.release, apex: !!c.flags.apex, reacquired: c.flags.reacquired, uncertain: c.flags.uncertain })) } : {}) };
    if (name === "baseline_legacy") baselineByKey[`${id}|${fps.key}`] = { calls: r.calls, counted: r.counted, byF, frames };
  }
  console.log(`${fps.key} ${id}: ` + CORE.map((n) => `${n} ${row[n].correct}/${truth.length}(${row[n].counted})`).join("  "));
}

// ---------------------------------------------------------------- phantom evidence on IMG_4873, and spurious shots
out.phantom_4873 = {};
for (const fps of FPS) {
  const clip = reg.clips.find((c) => c.id === "IMG_4873"), { frames, byF } = load(clip);
  const keyOf = (f, x, y) => `${f}|${x.toFixed(2)}|${y.toFixed(2)}`;
  const ph = new Set(); let total = 0;
  for (const [f, boxes] of byF) { if (fps.thin > 1 && f % fps.thin) continue; for (const b of boxes) if (isOracle(b)) { ph.add(keyOf(f, cx(b), cy(b))); total += 1; } }
  const row = (out.phantom_4873[fps.key] = { phantom_boxes: total });
  for (const name of ["baseline_legacy", "H2_legacy", "tracks", "tracks_kalman_round2"]) {
    const r = runPipeline(clip, frames, byF, fps.thin, name);
    let inEv = 0;
    for (const c of r.counted) { const seen = c.evidence ?? []; if (seen.length) { for (const e of seen) if (ph.has(keyOf(e.f, e.x, e.y))) inEv += 1; } else { for (const [f, boxes] of byF) { if (f < c.first - 45 || f >= c.first + 70) continue; for (const b of boxes) if (ph.has(keyOf(f, cx(b), cy(b))) && (!r.kept || r.kept.has(b))) inEv += 1; } } }
    row[name] = { phantom_in_evidence: inEv, share_of_phantom_boxes: total ? inEv / total : null, note: name.endsWith("legacy") ? "legacy counts every box in a shot's windows as evidence; counted over the windows of counted shots, so a merged shot's 1000+ frames count" : "boxes of the shot's tracks that are not clutter at the call" };
  }
}

// ---------------------------------------------------------------- genuine retention (T4) on the development clips
out.genuine = {};
for (const fps of FPS) {
  const per = Object.fromEntries(["H2_legacy", "tracks"].map((n) => [n, { genuine: 0, clutter: 0, zone_boxes_baseline: 0, zone_boxes_in_new_evidence: 0, shots: 0, single_track_shots: 0, shots_checked: 0 }]));
  for (const id of DEV) {
    const clip = reg.clips.find((c) => c.id === id), truth = readJSON(clip.truth.file).results, b = baselineByKey[`${id}|${fps.key}`];
    const pairs = align(b.counted.filter((c) => !(phantomEvents[id] ?? []).some((f) => Math.abs(c.first - f) <= 3)), truth).pairs;
    const windows = pairs.map((p) => [p.s.first - 45, p.s.last + 45]);
    const { frames, byF } = load(clip), r = runPipeline(clip, frames, byF, fps.thin, "tracks");
    const index = new Map(); for (const t of r.tracker.all()) for (const o of t.obs) index.set(`${o.f}|${o.x.toFixed(3)}|${o.y.toFixed(3)}`, { id: t.id, o });
    const p = per.tracks;
    for (const [f, boxes] of byF) { if (fps.thin > 1 && f % fps.thin) continue; const w = windows.find(([lo, hi]) => f >= lo && f <= hi); if (!w) continue; for (const bx of boxes) { p.genuine += 1; const hit = index.get(`${f}|${cx(bx).toFixed(3)}|${cy(bx).toFixed(3)}`); if (hit && r.machine.clutterAt(hit.id, f, w[1] - 45 + 70)) p.clutter += 1; } }
    for (const pr of pairs) {
      const match = r.counted.find((c) => Math.abs(c.first - pr.s.first) <= 15);
      p.shots += 1;
      const zoneBoxes = [];
      for (const [f, boxes] of byF) { if (fps.thin > 1 && f % fps.thin) continue; if (f < pr.s.first || f > pr.s.last) continue; for (const bx of boxes) if (R.inZone(bx, r.rim)) zoneBoxes.push({ f, x: cx(bx), y: cy(bx) }); }
      p.zone_boxes_baseline += zoneBoxes.length;
      if (match) {
        const ev = new Set(match.evidence.map((e) => `${e.f}|${e.x.toFixed(3)}|${e.y.toFixed(3)}`));
        p.zone_boxes_in_new_evidence += zoneBoxes.filter((z) => ev.has(`${z.f}|${z.x.toFixed(3)}|${z.y.toFixed(3)}`)).length;
        // continuity: the genuine zone-window boxes (score >= 0.6) and the tracks they belong to
        const g = []; for (const [f, boxes] of byF) { if (fps.thin > 1 && f % fps.thin) continue; if (f < match.first - 12 || f > match.last + 30) continue; for (const bx of boxes) if (bx.score >= 0.6 && Math.hypot(cx(bx) - r.rim.x, cy(bx) - r.rim.y) <= 80) { const h = index.get(`${f}|${cx(bx).toFixed(3)}|${cy(bx).toFixed(3)}`); if (h) g.push(h.id); } }
        if (g.length >= 3) { p.shots_checked += 1; const inShot = g.filter((i) => match.tracks.includes(i)).length / g.length; const counts = {}; for (const i of g) counts[i] = (counts[i] ?? 0) + 1; const dominantTracks = Math.max(...Object.values(counts)) / g.length; if (inShot >= 0.9 && (dominantTracks >= 0.9 || Object.keys(counts).every((i) => match.tracks.includes(Number(i))))) p.single_track_shots += 1; }
      }
    }
    // the H2 + legacy reference for the box-level rate
    const h = per.H2_legacy, hf = H_FILTERS.H2(), hk = new Set();
    for (let f = 0; f < frames; f += 1) { if (fps.thin > 1 && f % fps.thin) continue; for (const bx of hf.push(f, byF.get(f) ?? [])) hk.add(bx); }
    for (const [f, boxes] of byF) { if (fps.thin > 1 && f % fps.thin) continue; if (!windows.some(([lo, hi]) => f >= lo && f <= hi)) continue; for (const bx of boxes) { h.genuine += 1; if (!hk.has(bx)) h.clutter += 1; } }
  }
  out.genuine[fps.key] = per;
}
// annotated genuine balls (medium/high confidence): are they clutter at decision time? and held balls retained as tracks
const annFiles = { IMG_4874: "training/fixtures/dets6-4874.json", IMG_4872: "training/fixtures/dets6-4872.json", IMG_4839: "training/fixtures/dets6-4839.json", IMG_4851: "training/fixtures/dets6-4851.json", IMG_4866: "training/fixtures/dets6-4866.json", IMG_4873: "training/fixtures/dets6-4873-s1.json" };
out.annotated = {};
for (const fps of FPS) {
  const rows = [];
  for (const [id, file] of Object.entries(annFiles)) {
    const clip = reg.clips.find((c) => c.id === id), win = id === "IMG_4873" ? { ...clip, window: { ...clip.window, cropX: 848, cropY: 318, cropSize: 416, scale: 1 } } : clip;
    const targets = annotations.frames.filter((f) => f.id.startsWith("F") && manifest.frames.find((m) => m.id === f.id).clip === id).flatMap((f) => f.balls.filter((b) => b.confidence !== "low").map((b) => ({ id: f.id, n: manifest.frames.find((m) => m.id === f.id).n, ball: b, inHand: (f.tags ?? []).includes("in_hand") }))).filter((t) => fps.thin === 1 || t.n % fps.thin === 0);
    if (!targets.length) continue;
    const { frames, byF } = load(win, file), r = runPipeline(win, frames, byF, fps.thin, "tracks");
    const index = new Map(); for (const t of r.tracker.all()) for (const o of t.obs) index.set(`${o.f}|${o.x.toFixed(3)}|${o.y.toFixed(3)}`, { id: t.id, o });
    for (const t of targets) {
      const box = (byF.get(t.n) ?? []).filter((b) => Math.hypot(cx(b) - t.ball.cx, cy(b) - t.ball.cy) <= 0.5 * t.ball.diameter).sort((a, b) => b.score - a.score)[0];
      if (!box) continue;
      const h = index.get(`${t.n}|${cx(box).toFixed(3)}|${cy(box).toFixed(3)}`);
      rows.push({ id: t.id, clip: id, in_hand: t.inHand, clutter: h ? !!r.machine.clutterAt(h.id, t.n, t.n + 70) : null, track_motion: h ? "known" : null, in_a_track: !!h });
    }
  }
  out.annotated[fps.key] = { true_positives: rows.length, clutter: rows.filter((x) => x.clutter).length, clutter_ids: rows.filter((x) => x.clutter).map((x) => x.id), in_hand: rows.filter((x) => x.in_hand).length, in_hand_retained: rows.filter((x) => x.in_hand && x.in_a_track && !x.clutter).length };
}

// ---------------------------------------------------------------- injection (S2 of the rim-phantom experiment, unchanged generator and seeds) and stall
const inj = readJSON("training/eval/experiments/rim-phantom/criteria.json").protocol.synthetic_injection;
const SIM = ["baseline_legacy", "H2_legacy", "tracks", "tracks_kalman_round2"];
out.injection = {};
for (const fps of FPS) {
  const res = {};
  for (const duty of inj.duty_cycles) for (const [si, [ox, oy]] of inj.spots_relative_to_the_window_rim.entries()) {
    const key = `duty${duty}_spot${si}`, rows = Object.fromEntries(SIM.map((n) => [n, { injected: 0, in_evidence: 0, v4_right: 0, spurious_shots: 0 }]));
    for (const [ci, id] of DEV.entries()) {
      const clip = reg.clips.find((c) => c.id === id), truth = readJSON(clip.truth.file).results, rim = rimOf(clip), baseCounted = baselineByKey[`${id}|${fps.key}`].counted;
      for (const name of SIM) {
        const { frames, byF } = load(clip), rnd = rng(inj.seed_base + 1000 * ci + 100 * si + Math.round(duty * 100)), injected = new Set(); let f = 0;
        while (f < frames) { const on = rnd() < duty, len = Math.max(5, Math.round(-Math.log(1 - rnd()) * 60)); if (on) for (let g = f; g < Math.min(frames, f + len); g += 1) { const b = { f: g, x1: rim.x + ox - 5.5, y1: rim.y + oy - 5.5, x2: rim.x + ox + 5.5, y2: rim.y + oy + 5.5, score: 0.5 }; (byF.get(g) ?? byF.set(g, []).get(g)).push(b); injected.add(b); } f += len; }
        const keys = new Set([...injected].filter((b) => !(fps.thin > 1 && b.f % fps.thin)).map((b) => `${b.f}|${cx(b).toFixed(2)}|${cy(b).toFixed(2)}`));
        const r = runPipeline(clip, frames, byF, fps.thin, name), s = score(clip, r.counted, truth), row = rows[name];
        row.injected += keys.size; row.v4_right += s.correct;
        for (const c of r.counted) { if (c.evidence) for (const e of c.evidence) { if (keys.has(`${e.f}|${e.x.toFixed(2)}|${e.y.toFixed(2)}`)) row.in_evidence += 1; } else { for (const [g, boxes] of byF) { if (g < c.first - 45 || g >= c.first + 70) continue; for (const b of boxes) if (injected.has(b) && (!r.kept || r.kept.has(b))) row.in_evidence += 1; } } }
        row.spurious_shots += r.counted.filter((c) => !baseCounted.some((b) => Math.abs(b.first - c.first) <= 15)).length;
      }
    }
    res[key] = Object.fromEntries(Object.entries(rows).map(([n, v]) => [n, { ...v, share_in_evidence: v.injected ? v.in_evidence / v.injected : null }]));
  }
  out.injection[fps.key] = res;
}
out.injection_clean_baseline_dev_v4_right = Object.fromEntries(FPS.map((fps) => [fps.key, DEV.reduce((a, id) => a + out.clips[id][fps.key].baseline_legacy.correct, 0)]));
console.log("injection done");

const stallCfg = crit.protocol.stall_simulation ?? readJSON("training/eval/experiments/rim-phantom/criteria.json").protocol.stall_simulation;
out.stall = {};
for (const S of stallCfg.S_frames) {
  out.stall[S] = {};
  for (const fps of FPS) {
    const per = Object.fromEntries(SIM.map((n) => [n, { shots: 0, survived: 0, failures: [] }]));
    for (const [ci, id] of DEV.entries()) {
      const clip = reg.clips.find((c) => c.id === id), truth = readJSON(clip.truth.file).results, rim = rimOf(clip);
      const clean = score(clip, runPipeline(clip, load(clip).frames, load(clip).byF, 1, "baseline_legacy").counted, truth);
      const matched = clean.per_shot.filter((p) => p.seen && p.v4 === p.truth);
      for (let group = 0; group < 3; group += 1) {
        const chosen = matched.filter((_, i) => i % 3 === group), rnd = rng(stallCfg.seed_base + 100 * ci + 10 * S + group);
        const { frames, byF } = load(clip), insertAt = chosen.map((p) => p.first).sort((a, b) => a - b), shiftOf = (f) => insertAt.filter((x) => x <= f).length * S, shifted = new Map();
        for (const [f, boxes] of byF) shifted.set(f + shiftOf(f), boxes);
        for (const at of insertAt) {
          const anchor = (byF.get(at) ?? []).filter((b) => R.inZone(b, rim)).sort((a, b) => b.score - a.score)[0]; if (!anchor) continue;
          const base = shiftOf(at - 1);
          for (let k = 0; k < S; k += 1) shifted.set(at + base + k, [{ ...anchor, x1: anchor.x1 + (rnd() - 0.5) * 2, x2: anchor.x2 + (rnd() - 0.5) * 2, y1: anchor.y1 + (rnd() - 0.5) * 2, y2: anchor.y2 + (rnd() - 0.5) * 2 }]);
        }
        const total = frames + insertAt.length * S;
        for (const name of SIM) {
          const r = runPipeline(clip, total, shifted, fps.thin, name);
          for (const p of chosen) { const expected = p.first + shiftOf(p.first - 1); per[name].shots += 1; const hit = r.counted.find((c) => Math.abs(c.first - expected) <= 15); const ok = hit && hit.v4 === p.v4; if (ok) per[name].survived += 1; else if (per[name].failures.length < 4) per[name].failures.push(`${id} shot #${p.ti + 1} (${hit ? `call ${hit.v4} instead of ${p.v4}` : "not counted"})`); }
        }
      }
    }
    for (const v of Object.values(per)) v.survival = wilson(v.survived, v.shots);
    out.stall[S][fps.key] = per;
  }
}
console.log("stall done");
fs.writeFileSync(path.join(RES, "accuracy.json"), JSON.stringify(out) + "\n");
console.log("wrote results/accuracy.json");
