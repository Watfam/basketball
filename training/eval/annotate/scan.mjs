// Simulates the app's motion gate (src/lib/vision/roi.ts: blockMotion, createMotionGate at the app's threshold and hold) over a clip at
// 15 frames a second, and records for every frame whether the model would have run. Independent of the detector, so it can define
// annotation strata and the "how often does the model run" metric.
//   node training/eval/annotate/scan.mjs <clip id> [...]   -> training/work/eval/activity-<id>.json
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadRegistry } from "../lib/registry.mjs";
import { loadVision } from "../lib/transpile.mjs";
import { windowFrames, SIZE, FPS } from "../lib/frames.mjs";

// The values use-camera-counter.ts runs with (MOTION_THRESHOLD, STILL_HOLD_MS); read from the source so they cannot drift apart.
const hook = fs.readFileSync(path.join(ROOT, "src/lib/vision/use-camera-counter.ts"), "utf8");
const THRESHOLD = Number(/const MOTION_THRESHOLD = (\d+)/.exec(hook)[1]);
const HOLD_MS = Number(/const STILL_HOLD_MS = (\d+)/.exec(hook)[1]);

const { roi } = await loadVision();
const reg = loadRegistry();
const outDir = path.join(ROOT, "training/work/eval");
fs.mkdirSync(outDir, { recursive: true });

for (const id of process.argv.slice(2)) {
  const clip = reg.clips.find((c) => c.id === id || c.id === "IMG_" + id);
  const gate = roi.createMotionGate({ threshold: THRESHOLD, holdMs: HOLD_MS });
  const open = [];
  const motion = [];
  let prev = null, cur = null, last = false, ran = 0, considered = 0;
  const t0 = Date.now();
  for (const { n, rgb } of windowFrames(clip)) {
    if (n % 2 === 0) {
      cur = cur ?? new Uint8Array(SIZE * SIZE);
      for (let i = 0, p = 0; i < cur.length; i += 1, p += 3) cur[i] = (rgb[p] * 77 + rgb[p + 1] * 150 + rgb[p + 2] * 29) >> 8;
      const moved = prev ? roi.blockMotion(prev, cur, SIZE, SIZE) : 255;
      [prev, cur] = [cur, prev];
      last = gate.step(moved, (n * 1000) / FPS);
      motion[n] = Math.round(moved * 10) / 10;
      considered += 1;
      if (last) ran += 1;
    }
    open[n] = last ? 1 : 0;
  }
  const frames = open.length;
  const rle = [];
  for (let i = 0; i < frames; ) { let j = i; while (j < frames && open[j] === open[i]) j += 1; rle.push([open[i], j - i]); i = j; }
  const file = path.join(outDir, `activity-${clip.id}.json`);
  fs.writeFileSync(file, JSON.stringify({ clip: clip.id, frames, threshold: THRESHOLD, hold_ms: HOLD_MS, gate_open_share: ran / considered, processed_15fps: considered, model_runs: ran, rle, motion: motion.map((m) => m ?? null) }));
  console.log(`${clip.id}: ${frames} frames, gate open on ${(100 * ran / considered).toFixed(1)}% of 15 fps frames (${ran} of ${considered}), threshold ${THRESHOLD}, hold ${HOLD_MS} ms, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
