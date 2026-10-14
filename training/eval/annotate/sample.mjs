// Draws the annotation sample: seeded, stratified, locked before anything is annotated.
//   node training/eval/annotate/sample.mjs      (needs training/work/eval/activity-<clip>.json from scan.mjs)
// Strata (reported separately, never pooled into one accuracy figure):
//   motion_high / motion_low  frames at or above the 75th / at or below the 25th percentile of the clip's own window motion.
//                             Independent of the detector. Random within the stratum.
//   detector_gap              (targeted) no ball-6 box in the frame, boxes in at least 2 of the 6 neighbouring frames: where misses cluster.
//   detector_boxed            (random) frames that do have a ball-6 box at score >= 0.25: for precision.
// Then 12 frames are drawn again under new blind ids as repeat annotations, to measure how repeatable the annotator is.
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadRegistry, readJSON } from "../lib/registry.mjs";
import { sample, shuffled } from "../lib/stats.mjs";

const reg = loadRegistry();
const thr = readJSON("training/eval/thresholds.json");
const SEED = thr.seeds.frame_sample;
const hash = (s) => [...s].reduce((a, ch) => (Math.imul(a, 31) + ch.charCodeAt(0)) >>> 0, 7);

const PLAN = {
  IMG_4874: { motion_high: 10, motion_low: 6, detector_gap: 10, detector_boxed: 10 },
  B1689585: { motion_high: 12, motion_low: 8 },
  IMG_4872: { motion_high: 3, motion_low: 1 },
  IMG_4873: { motion_high: 3, motion_low: 1 },
  IMG_4839: { motion_high: 3, motion_low: 1 },
  IMG_4851: { motion_high: 3, motion_low: 1 },
  IMG_4866: { motion_high: 3, motion_low: 1 },
};
const MIN_SPACING = 10; // frames between two chosen frames of one clip
const DUPLICATES = 12;

const chosen = [];
for (const [id, strata] of Object.entries(PLAN)) {
  const clip = reg.clips.find((c) => c.id === id);
  const act = JSON.parse(fs.readFileSync(path.join(ROOT, `training/work/eval/activity-${id}.json`), "utf8"));
  const even = act.motion.map((m, n) => [m, n]).filter(([m, n]) => m !== null && n >= 4 && n < act.frames - 4);
  const sorted = [...even.map(([m]) => m)].sort((a, b) => a - b);
  const p25 = sorted[Math.floor(0.25 * (sorted.length - 1))], p75 = sorted[Math.floor(0.75 * (sorted.length - 1))];
  const pools = { motion_high: even.filter(([m]) => m >= p75).map(([, n]) => n), motion_low: even.filter(([m]) => m <= p25).map(([, n]) => n) };
  if (strata.detector_gap || strata.detector_boxed) {
    const dets = readJSON(clip.detections.ball6).detections.filter((d) => d.score >= 0.25);
    const has = new Set(dets.map((d) => d.f));
    const evenFrames = even.map(([, n]) => n);
    pools.detector_boxed = evenFrames.filter((n) => has.has(n));
    pools.detector_gap = evenFrames.filter((n) => !has.has(n) && [-3, -2, -1, 1, 2, 3].filter((d) => has.has(n + d)).length >= 2);
  }
  const taken = [];
  for (const [stratum, count] of Object.entries(strata)) {
    const pool = shuffled(pools[stratum], SEED + hash(id + stratum));
    let got = 0;
    for (const n of pool) {
      if (got >= count) break;
      if (taken.some((t) => Math.abs(t - n) < MIN_SPACING)) continue;
      taken.push(n); chosen.push({ clip: id, n, stratum, role: clip.role, pool_size: pools[stratum].length }); got += 1;
    }
    if (got < count) console.warn(`${id} ${stratum}: only ${got} of ${count} available`);
  }
}

// Blind ids: a seeded shuffle of everything, so annotation order carries no clip or stratum information.
const order = shuffled(chosen, SEED);
const frames = order.map((f, i) => ({ id: "F" + String(i + 1).padStart(3, "0"), ...f }));
const dups = sample(frames, DUPLICATES, SEED + 99).map((f) => ({ clip: f.clip, n: f.n, stratum: f.stratum, role: f.role, duplicate_of: f.id }));
const all = [...frames, ...shuffled(dups, SEED + 7).map((d, i) => ({ id: "R" + String(i + 1).padStart(2, "0"), ...d }))];
const manifest = {
  schema: "eval-manifest-v1",
  created: new Date().toISOString().slice(0, 10),
  seed: SEED,
  frame_convention: reg.frame_convention,
  window: "416 px model-input window of each clip (registry window), numbered as tools/22-dump-detections.mjs numbers frames",
  strata_note: "motion_* are detector-independent and random; detector_gap is targeted at misses and detector_boxed is random among boxed frames. Report per stratum.",
  counts: chosen.reduce((a, f) => ((a[f.clip] = (a[f.clip] ?? 0) + 1), a), {}),
  frames: all,
};
fs.writeFileSync(path.join(ROOT, "training/eval/annotate/manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`unique ${frames.length}, repeats ${dups.length}, total ${all.length}`, JSON.stringify(manifest.counts));
