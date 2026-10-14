// Statistics of GENUINE ball boxes on the DEVELOPMENT clips only (4839, 4840, 4851, 4866, 4867): these bound how aggressive a filter may be.
// Genuine = a box inside the frame window [first-45, last+45] of a shot the baseline counted and paired with a written shot.
// Nothing here looks at IMG_4872, 4873 or 4874.      node devstats.mjs  -> results/devstats.json
import fs from "node:fs";
import path from "node:path";
import { EVAL, loadRegistry, readJSON } from "../../lib/registry.mjs";
import { loadVision } from "../../lib/transpile.mjs";
import { align } from "../../lib/shots.mjs";
import { quantile } from "../../lib/stats.mjs";

const DEV = ["IMG_4839", "IMG_4840", "IMG_4851", "IMG_4866", "IMG_4867"];
const reg = loadRegistry(), vision = await loadVision();
const cx = (d) => (d.x1 + d.x2) / 2, cy = (d) => (d.y1 + d.y2) / 2, wd = (d) => d.x2 - d.x1;
const res = { clips: {}, pooled: {} };
const allW = [], allScore = [], stall = [], slide = [];
for (const id of DEV) {
  const clip = reg.clips.find((c) => c.id === id), d = readJSON(clip.detections.ball6), truth = readJSON(clip.truth.file).results;
  const [rx, ry] = clip.window.rim_native;
  const core = vision.counting.createCountingCore({ frameW: 1920, frameH: 1080, rim: { x: rx / 1920, y: ry / 1080 }, scale: clip.window.scale, autoSize: false });
  const byF = new Map(); for (const x of d.detections) (byF.get(x.f) ?? byF.set(x.f, []).get(x.f)).push(x);
  const calls = []; for (let f = 0; f < d.frames; f += 1) calls.push(...core.push((f * 1000) / vision.shotRules.REFERENCE_FPS, byF.get(f) ?? []).calls);
  calls.push(...core.flush());
  const counted = calls.filter((c) => c.counted), a = align(counted, truth);
  const genuineFrames = a.pairs.map((p) => [p.s.first - 45, p.s.last + 45]);
  const g = d.detections.filter((x) => x.score >= 0.25 && genuineFrames.some(([lo, hi]) => x.f >= lo && x.f <= hi));
  const inZone = g.filter((x) => Math.abs(cx(x) - core.window.rim.x) <= 55 && cy(x) >= core.window.rim.y - 50 && cy(x) <= core.window.rim.y + 45);
  // longest stretch a genuine ball stays within R px of where the stretch began (consecutive boxes, gaps up to 2 frames), in the zone
  const sorted = [...inZone].sort((p, q) => p.f - q.f);
  const longestStill = (R) => { let best = 0; for (let i = 0; i < sorted.length; i += 1) { let j = i; while (j + 1 < sorted.length && sorted[j + 1].f - sorted[j].f <= 2 && Math.hypot(cx(sorted[j + 1]) - cx(sorted[i]), cy(sorted[j + 1]) - cy(sorted[i])) <= R) j += 1; best = Math.max(best, sorted[j].f - sorted[i].f + 1); } return best; };
  const still3 = longestStill(3), still6 = longestStill(6);
  // busiest 12 px cell over any 600-frame sliding window: how much of 20 s a real ball occupies one rim spot
  const cellFrames = new Map(); for (const x of g) { const k = `${Math.round(cx(x) / 12)},${Math.round(cy(x) / 12)}`; (cellFrames.get(k) ?? cellFrames.set(k, []).get(k)).push(x.f); }
  let maxShare = 0; for (const fr of cellFrames.values()) { const s = [...new Set(fr)].sort((p, q) => p - q); let j = 0; for (let i = 0; i < s.length; i += 1) { while (s[i] - s[j] >= 600) j += 1; maxShare = Math.max(maxShare, (i - j + 1) / 600); } }
  // the same over ALL boxes of the clip (genuine or not), the figure a filter actually sees
  const cellAll = new Map(); for (const x of d.detections.filter((y) => y.score >= 0.25)) { const k = `${Math.round(cx(x) / 12)},${Math.round(cy(x) / 12)}`; (cellAll.get(k) ?? cellAll.set(k, []).get(k)).push(x.f); }
  let maxShareAll = 0; for (const fr of cellAll.values()) { const s = [...new Set(fr)].sort((p, q) => p - q); let j = 0; for (let i = 0; i < s.length; i += 1) { while (s[i] - s[j] >= 600) j += 1; maxShareAll = Math.max(maxShareAll, (i - j + 1) / 600); } }
  const w = g.map(wd), widthInZone = inZone.map(wd);
  allW.push(...widthInZone); allScore.push(...inZone.map((x) => x.score)); stall.push(still3); slide.push(maxShareAll);
  res.clips[id] = { genuine_boxes: g.length, in_zone: inZone.length, width_in_zone: { min: Math.min(...widthInZone), p1: quantile(widthInZone, 0.01), p5: quantile(widthInZone, 0.05), median: quantile(widthInZone, 0.5) }, score_in_zone: { p5: quantile(inZone.map((x) => x.score), 0.05), median: quantile(inZone.map((x) => x.score), 0.5) }, longest_still_frames_within_3px: still3, longest_still_frames_within_6px: still6, busiest_cell_share_of_any_20s_genuine: maxShare, busiest_cell_share_of_any_20s_all_boxes: maxShareAll };
}
res.pooled = { genuine_zone_boxes: allW.length, width: { min: Math.min(...allW), p1: quantile(allW, 0.01), p5: quantile(allW, 0.05), median: quantile(allW, 0.5) }, score: { p5: quantile(allScore, 0.05), p1: quantile(allScore, 0.01) }, longest_still_within_3px_any_clip: Math.max(...stall), busiest_cell_share_any_20s_any_clip: Math.max(...slide) };
fs.writeFileSync(path.join(EVAL, "experiments/rim-phantom/results/devstats.json"), JSON.stringify(res, null, 1) + "\n");
for (const [k, v] of Object.entries(res.clips)) console.log(k, `zone boxes ${v.in_zone} | width min ${v.width_in_zone.min.toFixed(1)} p1 ${v.width_in_zone.p1.toFixed(1)} p5 ${v.width_in_zone.p5.toFixed(1)} med ${v.width_in_zone.median.toFixed(1)} | score p5 ${v.score_in_zone.p5.toFixed(2)} | still<=3px ${v.longest_still_frames_within_3px}f, <=6px ${v.longest_still_frames_within_6px}f | busiest cell, any 20 s: genuine ${(100 * v.busiest_cell_share_of_any_20s_genuine).toFixed(1)}%, all boxes ${(100 * v.busiest_cell_share_of_any_20s_all_boxes).toFixed(1)}%`);
console.log("POOLED", JSON.stringify(res.pooled));
