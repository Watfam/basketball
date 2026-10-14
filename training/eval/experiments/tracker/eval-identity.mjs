// EXPLORATORY real-footage identity check (NOT pre-registered; replaces the labelled-by-eye runs of criteria.json T6b, which were not done).
// Truth: IMG_4873's rim phantom is identified by the rim-phantom experiment's oracle (small static box at the rim hardware, score >= 0.25).
// Every other box with score >= 0.25 is taken as the ball. Question: does a track ever contain both, and does the ball's track keep its id through frames where both are present?
//   node eval-identity.mjs -> results/identity-4873.json
import fs from "node:fs";
import path from "node:path";
import { EVAL, loadRegistry, readJSON } from "../../lib/registry.mjs";
import { createTracker } from "./tracker.mjs";
const sel = readJSON("training/eval/experiments/tracker/results/selection.json"), reg = loadRegistry(), clip = reg.clips.find((c) => c.id === "IMG_4873");
const d = readJSON(clip.detections.ball6), byF = new Map(); for (const x of d.detections) if (x.score >= 0.25) (byF.get(x.f) ?? byF.set(x.f, []).get(x.f)).push({ ...x });
const cx = (b) => (b.x1 + b.x2) / 2, cy = (b) => (b.y1 + b.y2) / 2, wd = (b) => b.x2 - b.x1, spot = { x: 179.7, y: 194.1 };
const isPhantom = (b) => wd(b) < 18 && Math.hypot(cx(b) - spot.x, cy(b) - spot.y) <= 14;
const CFG = { nearest_last: { associator: "nearest_last" }, cv_nearest: { associator: "cv_nearest" },
  kalman_cv_round2_gate: { associator: "kalman", model: sel.selected.model, modelParams: sel.selected.params, gate: { maneuver: 0, ballFraction: 0, lastObs: false } },
  kalman_cv_round3_gate: { associator: "kalman", model: sel.selected.model, modelParams: sel.selected.params } };
const out = {};
for (const [fk, step] of [["30fps", 1], ["15fps", 2]]) for (const [name, opts] of Object.entries(CFG)) {
  const t = createTracker({ ...opts, retainFrames: Infinity }); const kind = new Map(); // track id -> {ball, phantom}
  let competing = 0, ballSwitchOnCompeting = 0, prevBallTrack = null, prevF = null, ballBoxes = 0;
  for (let f = 0; f < d.frames; f += step) {
    const boxes = byF.get(f) ?? [], snap = t.push(f, boxes);
    const both = boxes.some(isPhantom) && boxes.some((b) => !isPhantom(b) && wd(b) >= 18);
    for (const b of boxes) { const v = snap.tracks.find((x) => { const o = x.obs[x.obs.length - 1]; return o.f === f && Math.abs(o.x - cx(b)) < 1e-6 && Math.abs(o.y - cy(b)) < 1e-6; }); if (!v) continue; const k = kind.get(v.id) ?? kind.set(v.id, { ball: 0, phantom: 0 }).get(v.id); if (isPhantom(b)) k.phantom += 1; else { k.ball += 1; ballBoxes += 1; } }
    if (both) { competing += 1; const ballBox = boxes.filter((b) => !isPhantom(b) && wd(b) >= 18).sort((a, b) => b.score - a.score)[0]; const v = snap.tracks.find((x) => { const o = x.obs[x.obs.length - 1]; return o.f === f && Math.abs(o.x - cx(ballBox)) < 1e-6; }); const id = v ? v.id : null; if (prevBallTrack !== null && prevF !== null && f - prevF <= 4 * step && id !== prevBallTrack) ballSwitchOnCompeting += 1; prevBallTrack = id; prevF = f; }
  }
  const mixed = [...kind.entries()].filter(([, k]) => k.ball > 0 && k.phantom > 0);
  out[`${fk}|${name}`] = { frames_with_ball_and_phantom: competing, tracks_mixing_ball_and_phantom: mixed.length, ball_boxes_in_mixed_tracks: mixed.reduce((a, [, k]) => a + k.ball, 0), phantom_boxes_in_mixed_tracks: mixed.reduce((a, [, k]) => a + k.phantom, 0), ball_boxes_total: ballBoxes, ball_track_id_changes_across_competing_frames: ballSwitchOnCompeting };
  console.log(fk, name.padEnd(22), JSON.stringify(out[`${fk}|${name}`]));
}
fs.writeFileSync(path.join(EVAL, "experiments/tracker/results/identity-4873.json"), JSON.stringify(out, null, 1) + "\n");
