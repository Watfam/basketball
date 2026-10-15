// Runs the experimental association layer (cv_nearest tracker + the Experiment-1 round-2 shot machine) over one clip's saved detections.
// Nothing here is imported by the app. The production counter is not touched; this pipeline runs beside it on the same saved detections.
import path from "node:path";
import { EVAL, loadRegistry, readJSON } from "../../lib/registry.mjs";
import { loadVision } from "../../lib/transpile.mjs";
import { createTracker } from "../tracker/tracker.mjs";
import { createShotMachine } from "../tracker/shotmachine.mjs";

let V = null;
export async function vision() { return (V ??= await loadVision()); }
export const rimOf = (clip, V_) => { const [rx, ry] = clip.window.rim_native; return V_.counting.createCountingCore({ frameW: 1920, frameH: 1080, rim: { x: rx / 1920, y: ry / 1080 }, scale: clip.window.scale, autoSize: false }).window.rim; };
export function loadDetections(clip) { const d = readJSON(clip.detections.ball6), byF = new Map(); for (const x of d.detections) (byF.get(x.f) ?? byF.set(x.f, []).get(x.f)).push({ ...x }); return { frames: d.frames, byF }; }

/** stream: Map frame -> boxes (window units). thin: 1 = 30 fps, 2 = 15 fps (even frames). Returns decided shots, the tracker and the machine. */
export async function runStream(clip, { frames, byF }, { thin = 1, associator = "cv_nearest", timing = false } = {}) {
  const V_ = await vision(), R = V_.shotRules, rim = rimOf(clip, V_);
  const tr = createTracker({ associator, retainFrames: Infinity }), M = createShotMachine({ rim, scene: tr.scene, rules: R, keepAllViews: true }), calls = [], times = [];
  let lastF = 0;
  for (let f = 0; f < frames; f += 1) {
    if (thin > 1 && f % thin) continue;
    const boxes = byF.get(f) ?? [], t0 = timing ? performance.now() : 0;
    calls.push(...M.push(tr.push(f, boxes)));
    if (timing) times.push(performance.now() - t0);
    lastF = f;
  }
  calls.push(...M.flush(lastF));
  return { calls, counted: calls.filter((c) => c.counted), tracker: tr, machine: M, rim, R, times, lastF };
}
export function boxesAt(byF, f) { return byF.get(f) ?? []; }
