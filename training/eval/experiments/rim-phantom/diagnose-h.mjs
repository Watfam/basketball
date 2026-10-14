// POST-HOC: why does H leak phantom boxes? Classify every leaked phantom box on IMG_4873.  Exploratory; changes nothing registered.
import fs from "node:fs";
import path from "node:path";
import { EVAL, loadRegistry, readJSON } from "../../lib/registry.mjs";
import { PARAMS, createTracker } from "./filters.mjs";

const reg = loadRegistry();
const cx = (b) => (b.x1 + b.x2) / 2, cy = (b) => (b.y1 + b.y2) / 2, wd = (b) => b.x2 - b.x1;
const clip = reg.clips.find((c) => c.id === "IMG_4873"), d = readJSON(clip.detections.ball6);
const byF = new Map(); for (const x of d.detections) (byF.get(x.f) ?? byF.set(x.f, []).get(x.f)).push({ ...x });
const isPh = (b) => b.score >= 0.25 && wd(b) < 18 && Math.hypot(cx(b) - 179.7, cy(b) - 194.1) <= 14;
const p = PARAMS.H;
const tracker = createTracker({ gate_px_per_ref_frame: p.gate_px_per_ref_frame, max_gap_ref_frames: p.max_gap_ref_frames, proof_distance_px: p.proof_distance_px });
const frames = []; let first = null;
const why = { phantom_boxes: 0, warmup: 0, proven_track: 0, proven_track_with_real_ball_box_in_same_frame: 0, proven_track_real_ball_missing: 0, spot_share_below_threshold: 0 }; const hopRuns = [];
let prevHop = null;
for (let n = 0; n < d.frames; n += 1) {
  const boxes = byF.get(n) ?? []; if (first === null) first = n;
  while (frames.length && frames[0].f <= n - p.window_ref_frames) frames.shift();
  const proven = tracker.update(n, boxes);
  const realBall = boxes.some((b) => !isPh(b) && wd(b) >= 18 && b.score >= 0.5);
  for (const b of boxes) {
    if (!isPh(b)) continue; why.phantom_boxes += 1;
    let hits = 0; for (const fr of frames) if (fr.pts.some(([x, y]) => Math.hypot(x - cx(b), y - cy(b)) <= p.radius_px)) hits += 1;
    const share = (hits + 1) / (frames.length + 1), mature = n - first >= p.min_history_ref_frames;
    const leaked = !mature || proven.get(b) || share < p.share_threshold;
    if (!leaked) continue;
    if (!mature) why.warmup += 1; else if (proven.get(b)) { why.proven_track += 1; if (realBall) why.proven_track_with_real_ball_box_in_same_frame += 1; else why.proven_track_real_ball_missing += 1; if (prevHop !== null && n - prevHop <= 8) hopRuns[hopRuns.length - 1].push(n); else hopRuns.push([n]); prevHop = n; } else why.spot_share_below_threshold += 1;
  }
  frames.push({ f: n, pts: boxes.map((b) => [cx(b), cy(b)]) });
}
why.leaked_total = why.warmup + why.proven_track + why.spot_share_below_threshold;
why.hop_episodes = hopRuns.length; why.hop_episode_lengths_frames = hopRuns.map((r) => r[r.length - 1] - r[0] + 1).sort((a, b) => b - a).slice(0, 8);
fs.writeFileSync(path.join(EVAL, "experiments/rim-phantom/results/diagnose-h.json"), JSON.stringify(why, null, 1) + "\n");
console.log(JSON.stringify(why, null, 1));
