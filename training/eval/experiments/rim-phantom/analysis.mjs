// Root-cause analysis of the static false box on the rim (ball-6, IMG_4873). Diagnosis only: it reads every clip, tunes nothing.
//   node training/eval/experiments/rim-phantom/analysis.mjs   -> results/analysis.json
import fs from "node:fs";
import path from "node:path";
import { ROOT, EVAL, loadRegistry, readJSON } from "../../lib/registry.mjs";
import { loadVision } from "../../lib/transpile.mjs";
import { describe, quantile } from "../../lib/stats.mjs";
import { align, RULES } from "../../lib/shots.mjs";

const reg = loadRegistry();
const vision = await loadVision();
const cx = (d) => (d.x1 + d.x2) / 2, cy = (d) => (d.y1 + d.y2) / 2, wd = (d) => d.x2 - d.x1;
const out = { generated: new Date().toISOString() };

/** The most repeated 12 px cell, widened to a 14 px disc around the mean of its boxes: the candidate phantom. */
function phantom(dets, minScore = 0.25) {
  const hi = dets.filter((d) => d.score >= minScore);
  const cells = new Map();
  for (const d of hi) { const k = `${Math.round(cx(d) / 12)},${Math.round(cy(d) / 12)}`; (cells.get(k) ?? cells.set(k, []).get(k)).push(d); }
  const top = [...cells.values()].sort((a, b) => b.length - a.length)[0];
  if (!top) return null;
  const mx = top.reduce((a, d) => a + cx(d), 0) / top.length, my = top.reduce((a, d) => a + cy(d), 0) / top.length;
  const members = hi.filter((d) => Math.hypot(cx(d) - mx, cy(d) - my) <= 14);
  return { x: mx, y: my, members };
}

// ---- 1-3. the phantom in each of the four IMG_4873 files, and the same diagnosis on every saved detection file
const sd = (a) => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
function runsOf(frames, maxGap = 2) {
  const f = [...new Set(frames)].sort((a, b) => a - b);
  const runs = []; let start = f[0], prev = f[0];
  for (let i = 1; i <= f.length; i += 1) { if (i === f.length || f[i] - prev > maxGap) { runs.push({ from: start, to: prev, frames: prev - start + 1 }); start = f[i]; } prev = f[i]; }
  return runs;
}
function describePhantom(file, total) {
  const d = readJSON(file);
  const p = phantom(d.detections);
  if (!p) return null;
  const m = p.members;
  const runs = runsOf(m.map((x) => x.f));
  const durations = runs.map((r) => r.frames);
  // appearance over the clip in 10 s bins
  const bins = new Map(); for (const x of m) bins.set(Math.floor(x.f / 300), (bins.get(Math.floor(x.f / 300)) ?? new Set()).add(x.f));
  const nBins = Math.ceil(d.frames / 300);
  return {
    file: path.basename(file), frames_in_clip: d.frames, window: { cropX: d.cropX, cropY: d.cropY, cropSize: d.cropSize ?? 416 },
    centre: { x: +p.x.toFixed(1), y: +p.y.toFixed(1) },
    frames_with_box: new Set(m.map((x) => x.f)).size, share_of_clip: new Set(m.map((x) => x.f)).size / d.frames,
    position_spread_px: { sd_x: +sd(m.map(cx)).toFixed(2), sd_y: +sd(m.map(cy)).toFixed(2) },
    width: { median: quantile(m.map(wd), 0.5), p10: quantile(m.map(wd), 0.1), p90: quantile(m.map(wd), 0.9) },
    aspect_w_over_h_median: quantile(m.map((x) => wd(x) / (x.y2 - x.y1)), 0.5),
    score: { median: quantile(m.map((x) => x.score), 0.5), p10: quantile(m.map((x) => x.score), 0.1), p90: quantile(m.map((x) => x.score), 0.9) },
    runs: { count: runs.length, longest_frames: Math.max(...durations), longest_seconds: Math.max(...durations) / 29.97, median_frames: quantile(durations, 0.5), runs_over_1s: durations.filter((n) => n >= 30).length, runs_over_10s: durations.filter((n) => n >= 300).length, frames_in_runs_over_10s: durations.filter((n) => n >= 300).reduce((a, b) => a + b, 0) },
    present_in_ten_second_bins: `${bins.size} of ${nBins}`,
  };
}
out.ibmg4873 = ["dets6-4873.json", "dets6-4873-s1.json", "dets5-4873-found.json", "dets5-4873-s1.json"].map((f) => describePhantom("training/fixtures/" + f));
// ... and what a real ball looks like in the same file, for comparison
{
  const d = readJSON("training/fixtures/dets6-4873.json");
  const p = phantom(d.detections);
  const real = d.detections.filter((x) => x.score >= 0.6 && Math.hypot(cx(x) - p.x, cy(x) - p.y) > 30 && wd(x) >= 18);
  out.real_ball_in_4873_for_comparison = { boxes: real.length, width_median: quantile(real.map(wd), 0.5), score_median: quantile(real.map((x) => x.score), 0.5) };
}

// every saved file, same diagnosis: is there a static box anywhere else?
out.every_detection_file = fs.readdirSync(path.join(ROOT, "training/fixtures")).filter((f) => /^dets[56]-.*\.json$/.test(f)).map((f) => {
  const d = readJSON("training/fixtures/" + f);
  if (!Array.isArray(d.detections)) return { file: f, skipped: "no detections list" };
  const p = phantom(d.detections);
  if (!p) return { file: f };
  const frames = new Set(p.members.map((x) => x.f)).size;
  return { file: f, frames: d.frames, spot: `(${p.x.toFixed(0)}, ${p.y.toFixed(0)})`, frames_at_spot: frames, share: +(frames / d.frames).toFixed(4), width_median: +quantile(p.members.map(wd), 0.5).toFixed(1), score_median: +quantile(p.members.map((x) => x.score), 0.5).toFixed(2), longest_run_frames: Math.max(...runsOf(p.members.map((x) => x.f)).map((r) => r.frames)) };
}).sort((a, b) => (b.share ?? 0) - (a.share ?? 0));

// ---- 7. where does the merging come from? the phantom removed (oracle) vs left in, through the app's own counting core
const clip = reg.clips.find((c) => c.id === "IMG_4873");
const truth = readJSON(clip.truth.file).results;
function countWith(detsFile, window, transform, thin = 1) {
  const d = readJSON(detsFile);
  const [rx, ry] = [window.rim[0], window.rim[1]];
  const core = vision.counting.createCountingCore({ frameW: 1920, frameH: 1080, rim: { x: rx / 1920, y: ry / 1080 }, scale: window.scale, autoSize: false });
  const dets = transform(d.detections);
  const byF = new Map(); for (const x of dets) (byF.get(x.f) ?? byF.set(x.f, []).get(x.f)).push(x);
  const calls = [];
  for (let f = 0; f < d.frames; f += 1) { if (thin > 1 && f % thin) continue; calls.push(...core.push((f * 1000) / vision.shotRules.REFERENCE_FPS, byF.get(f) ?? []).calls); }
  calls.push(...core.flush());
  const counted = calls.filter((c) => c.counted);
  const a = align(counted, truth);
  return { counted: counted.length, matched: a.pairs.length, v4_right_of_22: a.pairs.filter((p) => p.s.v4 === p.t).length, longest_shot_zone_sightings: Math.max(...counted.map((c) => c.zoneSightings)), median_zone_sightings: quantile(counted.map((c) => c.zoneSightings), 0.5) };
}
const win = { rim: clip.window.rim_native, scale: clip.window.scale };
const ph = phantom(readJSON("training/fixtures/dets6-4873.json").detections);
const isPhantom = (d) => d.score >= 0.25 && Math.hypot(cx(d) - ph.x, cy(d) - ph.y) <= 14 && wd(d) < 18;
out.merge_origin = {
  note: "all through the app's own counting core, ball-6, IMG_4873 sizer window, 22 written shots",
  as_it_is: countWith(clip.detections.ball6, win, (x) => x),
  phantom_removed_oracle: countWith(clip.detections.ball6, win, (x) => x.filter((d) => !isPhantom(d))),
  as_it_is_15fps: countWith(clip.detections.ball6, win, (x) => x, 2),
  phantom_removed_oracle_15fps: countWith(clip.detections.ball6, win, (x) => x.filter((d) => !isPhantom(d)), 2),
};

// interaction curve: put a synthetic phantom of growing duty cycle into a CLEAN clip (IMG_4840, no phantom) and watch the count
{
  const c = reg.clips.find((x) => x.id === "IMG_4840");
  const t = readJSON(c.truth.file).results;
  const d = readJSON(c.detections.ball6);
  const [rx, ry] = c.window.rim_native;
  const frames = d.frames;
  const curve = [];
  for (const duty of [0, 0.05, 0.1, 0.2, 0.3, 0.42, 0.6]) {
    // phantom appears in runs of random length (mean 60 frames) so that its duty cycle is `duty`; seeded
    let seed = 7919; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const extra = []; let f = 0;
    while (f < frames) {
      const on = rnd() < duty;
      const len = Math.max(5, Math.round(-Math.log(1 - rnd()) * 60));
      if (on) for (let g = f; g < Math.min(frames, f + len); g += 1) extra.push({ f: g, x1: 180 - 5.5, y1: 192 - 5.5, x2: 180 + 5.5, y2: 192 + 5.5, score: 0.5 });
      f += len;
    }
    const core = vision.counting.createCountingCore({ frameW: 1920, frameH: 1080, rim: { x: rx / 1920, y: ry / 1080 }, scale: c.window.scale, autoSize: false });
    const byF = new Map(); for (const x of [...d.detections, ...extra]) (byF.get(x.f) ?? byF.set(x.f, []).get(x.f)).push(x);
    const calls = [];
    for (let g = 0; g < frames; g += 1) calls.push(...core.push((g * 1000) / vision.shotRules.REFERENCE_FPS, byF.get(g) ?? []).calls);
    calls.push(...core.flush());
    const counted = calls.filter((x) => x.counted);
    const a = align(counted, t);
    curve.push({ phantom_frames_share: +(new Set(extra.map((x) => x.f)).size / frames).toFixed(3), counted: counted.length, of_written: t.length, matched: a.pairs.length, v4_right: a.pairs.filter((p) => p.s.v4 === p.t).length });
  }
  out.interaction_curve = { what: "synthetic 11 px, score 0.5 box at (180, 192) added to IMG_4840 (a clean clip) in random runs of mean 60 frames", clip: "IMG_4840", points: curve };
}
fs.writeFileSync(path.join(EVAL, "experiments/rim-phantom/results/analysis.json"), JSON.stringify(out, null, 1) + "\n");
const f = (x) => (typeof x === "number" ? +x.toFixed(2) : x);
console.log("PHANTOM IN THE FOUR IMG_4873 FILES");
for (const p of out.ibmg4873) console.log(p ? `${p.file}: window ${p.window.cropSize}px spot (${p.centre.x}, ${p.centre.y}) frames ${p.frames_with_box} (${(100 * p.share_of_clip).toFixed(1)}%) sd (${p.position_spread_px.sd_x}, ${p.position_spread_px.sd_y}) width ${f(p.width.median)} [${f(p.width.p10)}-${f(p.width.p90)}] score ${f(p.score.median)} [${f(p.score.p10)}-${f(p.score.p90)}] runs ${p.runs.count} longest ${p.runs.longest_frames}f (${p.runs.longest_seconds.toFixed(0)}s) >10s runs ${p.runs.runs_over_10s} (${p.runs.frames_in_runs_over_10s} frames), in ${p.present_in_ten_second_bins} ten-second bins` : "none");
console.log("real ball in the same file:", JSON.stringify(out.real_ball_in_4873_for_comparison));
console.log("EVERY FILE, most repeated spot (top 12):"); for (const e of out.every_detection_file.slice(0, 12)) console.log(" ", JSON.stringify(e));
console.log("MERGE ORIGIN:", JSON.stringify(out.merge_origin, null, 0));
console.log("INTERACTION CURVE:"); for (const c of out.interaction_curve.points) console.log(" ", JSON.stringify(c));
