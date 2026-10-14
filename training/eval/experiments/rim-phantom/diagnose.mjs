// POST-HOC diagnostics of why candidates failed their registered criteria. Exploratory: nothing here changes criteria.json or the verdict.
//   node diagnose.mjs -> results/diagnose.json
import fs from "node:fs";
import path from "node:path";
import { EVAL, loadRegistry, readJSON } from "../../lib/registry.mjs";
import { loadVision } from "../../lib/transpile.mjs";
import { align } from "../../lib/shots.mjs";
import { quantile } from "../../lib/stats.mjs";
import { CONFIGS } from "./filters.mjs";

const reg = loadRegistry(), vision = await loadVision(), REF = vision.shotRules.REFERENCE_FPS;
const cx = (b) => (b.x1 + b.x2) / 2, cy = (b) => (b.y1 + b.y2) / 2, wd = (b) => b.x2 - b.x1;
const out = {};
const load = (file) => { const d = readJSON(file), byF = new Map(); for (const x of d.detections) (byF.get(x.f) ?? byF.set(x.f, []).get(x.f)).push({ ...x }); return { frames: d.frames, byF }; };
const oracleSpot = { x: 179.7, y: 194.1 }, isOracle = (b) => b.score >= 0.25 && wd(b) < 18 && Math.hypot(cx(b) - oracleSpot.x, cy(b) - oracleSpot.y) <= 14;

// ---- A on IMG_4873: when does the leak happen?
{
  const clip = reg.clips.find((c) => c.id === "IMG_4873"), { frames, byF } = load(clip.detections.ball6);
  const f = CONFIGS.A(); const leaks = []; let total = 0;
  for (let n = 0; n < frames; n += 1) { const boxes = byF.get(n) ?? []; const kept = new Set(f.push(n, boxes)); for (const b of boxes) if (isOracle(b)) { total += 1; if (kept.has(b)) leaks.push(n); } }
  const early = leaks.filter((n) => n < 300).length;
  out.A_on_4873 = { phantom_boxes: total, passed: leaks.length, passed_in_first_10s: early, passed_after_10s: leaks.length - early, first_suppressed_after_frames: null, by_20s_bucket: Array.from({ length: 8 }, (_, i) => leaks.filter((n) => n >= i * 600 && n < (i + 1) * 600).length) };
}

// ---- B on the five development clips: which genuine boxes are lost, and where
{
  const DEV = ["IMG_4839", "IMG_4840", "IMG_4851", "IMG_4866", "IMG_4867"];
  const rows = { zone: { genuine: 0, dropped: 0 }, outside: { genuine: 0, dropped: 0 }, in_hand_region: { genuine: 0, dropped: 0 } };
  const startLoss = []; let firstBoxOfRun = 0, afterGap = 0, neverProven = 0;
  for (const id of DEV) {
    const clip = reg.clips.find((c) => c.id === id), truth = readJSON(clip.truth.file).results;
    const { frames, byF } = load(clip.detections.ball6);
    const [rx, ry] = clip.window.rim_native;
    const core = vision.counting.createCountingCore({ frameW: 1920, frameH: 1080, rim: { x: rx / 1920, y: ry / 1080 }, scale: clip.window.scale, autoSize: false });
    const rim = core.window.rim;
    const calls = []; for (let n = 0; n < frames; n += 1) calls.push(...core.push((n * 1000) / REF, byF.get(n) ?? []).calls); calls.push(...core.flush());
    const a = align(calls.filter((c) => c.counted), truth), wins = a.pairs.map((p) => [p.s.first - 45, p.s.last + 45]);
    const filter = CONFIGS.B(); const kept = new Set(); const lastSeenF = [];
    for (let n = 0; n < frames; n += 1) for (const b of filter.push(n, byF.get(n) ?? [])) kept.add(b);
    for (const [n, boxes] of byF) { if (!wins.some(([lo, hi]) => n >= lo && n <= hi)) continue; for (const b of boxes) {
      const inZone = Math.abs(cx(b) - rim.x) <= 55 && cy(b) >= rim.y - 50 && cy(b) <= rim.y + 45;
      const region = inZone ? "zone" : cy(b) > rim.y + 120 ? "in_hand_region" : "outside";
      rows[region].genuine += 1; if (!kept.has(b)) rows[region].dropped += 1;
    } }
  }
  out.B_genuine_loss_by_region = Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, { ...v, share: +(v.dropped / v.genuine).toFixed(3) }]));
  out.B_note = "in_hand_region = more than 120 px below the rim (shooter's hands, dribble); zone = the rule's rim zone; outside = the rest (flight)";
}

// ---- B and stalls: how often is a shot's FIRST detection already inside the zone (no earlier flight for the track to prove itself on)?
{
  const DEV = ["IMG_4839", "IMG_4840", "IMG_4851", "IMG_4866", "IMG_4867"]; let shots = 0, firstDetInZone = 0, priorBoxes = [];
  for (const id of DEV) {
    const clip = reg.clips.find((c) => c.id === id), truth = readJSON(clip.truth.file).results;
    const { frames, byF } = load(clip.detections.ball6);
    const [rx, ry] = clip.window.rim_native;
    const core = vision.counting.createCountingCore({ frameW: 1920, frameH: 1080, rim: { x: rx / 1920, y: ry / 1080 }, scale: clip.window.scale, autoSize: false });
    const rim = core.window.rim; const calls = []; for (let n = 0; n < frames; n += 1) calls.push(...core.push((n * 1000) / REF, byF.get(n) ?? []).calls); calls.push(...core.flush());
    for (const p of align(calls.filter((c) => c.counted), truth).pairs) { shots += 1; let prior = 0; for (let n = p.s.first - 12; n < p.s.first; n += 1) prior += (byF.get(n) ?? []).filter((b) => !(Math.abs(cx(b) - rim.x) <= 55 && cy(b) >= rim.y - 50 && cy(b) <= rim.y + 45) && Math.hypot(cx(b) - rim.x, cy(b) - rim.y) < 160).length; priorBoxes.push(prior); if (prior === 0) firstDetInZone += 1; }
  }
  out.shots_with_no_ball_box_outside_the_zone_in_the_12_frames_before_the_zone = { shots, count: firstDetInZone, share: +(firstDetInZone / shots).toFixed(3), median_boxes_in_those_12_frames: quantile(priorBoxes, 0.5) };
}

// ---- C60: which genuine boxes does it remove?
{
  const DEV = ["IMG_4839", "IMG_4840", "IMG_4851", "IMG_4866", "IMG_4867"]; const w = [];
  for (const id of DEV) { const clip = reg.clips.find((c) => c.id === id), { byF } = load(clip.detections.ball6); for (const boxes of byF.values()) for (const b of boxes) if (wd(b) < 14.22 && b.score >= 0.25) w.push({ id, w: wd(b), s: b.score }); }
  const per = {}; for (const x of w) per[x.id] = (per[x.id] ?? 0) + 1;
  out.C60_narrow_boxes_on_dev_clips = { count: w.length, per_clip: per, width_median: quantile(w.map((x) => x.w), 0.5), score_median: quantile(w.map((x) => x.s), 0.5) };
}

// ---- sensitivity of C to the detector's box convention: ball-5 boxes on the same clips
{
  const rows = {};
  for (const id of ["IMG_4872", "IMG_4874", "IMG_4839"]) { const clip = reg.clips.find((c) => c.id === id); for (const [m, f] of [["ball-5", clip.detections.ball5], ["ball-6", clip.detections.ball6]]) { const { byF } = load(f); const real = []; for (const boxes of byF.values()) for (const b of boxes) if (b.score >= 0.6) real.push(wd(b)); rows[`${id} ${m}`] = { confident_boxes: real.length, median_width: +quantile(real, 0.5).toFixed(1), share_under_14_22: +(real.filter((x) => x < 14.22).length / real.length).toFixed(3), share_under_11_85: +(real.filter((x) => x < 11.85).length / real.length).toFixed(3) }; } }
  out.size_gate_vs_detector_box_convention = rows;
}
fs.writeFileSync(path.join(EVAL, "experiments/rim-phantom/results/diagnose.json"), JSON.stringify(out, null, 1) + "\n");
console.log(JSON.stringify(out, null, 1));
