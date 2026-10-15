// Runs a named pipeline over one clip's saved detections at 30 or 15 fps and returns the counted calls. Controls and the candidate share this runner.
import { loadRegistry, readJSON } from "../../lib/registry.mjs";
import { loadVision } from "../../lib/transpile.mjs";
import { legacyCounter } from "../tracker/decide.mjs";
import { createTracker } from "../tracker/tracker.mjs";
import { createShotMachine } from "../tracker/shotmachine.mjs";
import { createShotMachine as createSeparator } from "./separator.mjs";
import { CONFIGS as H_FILTERS } from "../rim-phantom/filters.mjs";
const reg = loadRegistry(), sel = readJSON("training/eval/experiments/tracker/results/selection.json");
let V = null; const vision = async () => (V ??= await loadVision());
const rimOf = (clip, V_) => { const [rx, ry] = clip.window.rim_native; return V_.counting.createCountingCore({ frameW: 1920, frameH: 1080, rim: { x: rx / 1920, y: ry / 1080 }, scale: clip.window.scale, autoSize: false }).window.rim; };
export const PIPELINES = ["baseline_legacy", "tracks_kalman_round2", "tracks", "separator_round2_check", "candidate_arrival"];
export function loadDets(clip) { const d = readJSON(clip.detections.ball6), byF = new Map(); for (const x of d.detections) (byF.get(x.f) ?? byF.set(x.f, []).get(x.f)).push({ ...x }); return { frames: d.frames, byF }; }
export async function run(clipId, thin, name, dets = null) {
  const V_ = await vision(), R = V_.shotRules, clip = reg.clips.find((c) => c.id === clipId), rim = rimOf(clip, V_), { frames, byF } = dets ?? loadDets(clip), calls = [], times = [];
  if (name === "baseline_legacy") {
    const lc = legacyCounter(rim, R);
    for (let f = 0; f < frames; f += 1) { if (thin > 1 && f % thin) continue; calls.push(...lc.push((f * 1000) / R.REFERENCE_FPS, byF.get(f) ?? [])); }
    calls.push(...lc.flush());
  } else {
    const opts = name === "tracks_kalman_round2" ? { associator: "kalman", model: sel.selected.model, modelParams: sel.selected.params, interpW: sel.selected.interpolation_W, gate: { maneuver: 0, ballFraction: 0, lastObs: false } } : { associator: "cv_nearest" };
    const tr = createTracker({ ...opts, retainFrames: Infinity }), mk = name === "candidate_arrival" || name === "separator_round2_check" ? createSeparator : createShotMachine;
    const M = mk({ rim, scene: tr.scene, rules: R, keepAllViews: true, params: name === "candidate_arrival" ? { arrival: true } : {} });
    let last = 0;
    for (let f = 0; f < frames; f += 1) { if (thin > 1 && f % thin) continue; const t0 = performance.now(); calls.push(...M.push(tr.push(f, byF.get(f) ?? []))); times.push(performance.now() - t0); last = f; }
    calls.push(...M.flush(last));
  }
  return { counted: calls.filter((c) => c.counted).map((c) => ({ first: c.first, last: c.last, v4: c.v4, v2: c.v2, zoneSightings: c.zoneSightings, tracks: c.tracks })), times, rim };
}
