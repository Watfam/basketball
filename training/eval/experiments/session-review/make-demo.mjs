// Builds the offline demo for the session-review screen from EXISTING recordings: review records cut by the app's own recorder from saved detections,
// replay frames cut from the footage, and four demo sessions covering the six validation cases.   node make-demo.mjs
// Output: public/_review-demo/ (TEMPORARY, excluded from git via .git/info/exclude; footage of children never gets committed) and results/demo-cases.json.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, videoFile } from "../visibility/common.mjs";
import { EVAL } from "../../lib/registry.mjs";
import { loadReview } from "./lib.mjs";
import { analyseClip } from "../shot-intelligence/shots.mjs";
const R = await loadReview(), OUT = path.join(ROOT, "public/_review-demo");
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const fsMs = (f) => (f * 1001) / 30, round = (v) => (typeof v === "number" ? +v.toFixed(2) : v);
async function records(id) {
  const A = await analyseClip(id, { thin: 2 }), rec = R.recorder.createReviewRecorder(), out = [], cut = new Map(A.shots.map((s) => [Math.round(s.first + 2 * 29.97) + 1, s]));
  for (let f = 0; f <= Math.max(...A.byF.keys()); f += 2) { rec.push(fsMs(f), true, (A.byF.get(f) ?? []).filter((b) => b.score >= 0.2)); for (const [cf, s] of cut) if (cf <= f + 1 && cf >= f) { const r = rec.cut(fsMs(s.first), `shot-${id}-${s.first}`, A.rim, A.clip.window.scale); const trail = R.trail.buildTrail(r), fp = trail.hasTrail ? R.fingerprint.fingerprint(trail) : null; out.push({ s, r, trail, fp, q: R.quality.assessTrail(trail, fp) }); } }
  return { A, items: out };
}
function frames(id, first, clip, dir) {
  const w = clip.window, f0 = Math.max(0, first - 30 - ((first - 30) % 2)), n = 46, tmp = path.join(dir);
  fs.mkdirSync(tmp, { recursive: true });
  const r = spawnSync("ffmpeg", ["-nostdin", "-loglevel", "error", "-y", "-ss", String(fsMs(f0) / 1000), "-i", videoFile(id), "-vf", `fps=30000/1001,select='not(mod(n,2))',crop=${w.cropSize}:${w.cropSize}:${w.cropX}:${w.cropY},scale=288:288`, "-vsync", "0", "-frames:v", String(n), "-q:v", "5", path.join(tmp, "%03d.jpg")]);
  if (r.status !== 0) throw new Error(r.stderr.toString());
  return Array.from({ length: n }, (_, i) => ({ t: Math.round(fsMs(f0 + 2 * i) - fsMs(first)), file: `${path.relative(OUT, dir)}/${String(i + 1).padStart(3, "0")}.jpg` }));
}
const pick = (items, pred, skip = 0) => items.filter(pred)[skip];
const toShot = (it, seq, withFrames, clip, dirName) => ({ seq, made: it.s.label.written_outcome === "make", detectedMade: it.s.call.v4 === "make", flagged: false, tMs: Math.round(fsMs(it.s.first)), replayId: it.r.shotId, record: it.r, frames: withFrames ? frames(clip.id, it.s.first, clip.clip ?? clip, path.join(OUT, dirName, it.r.shotId)) : null, _caseOf: it.q.level });
const manifest = { note: "Demo only. Built from existing recordings; not part of the app.", sessions: [] }, cases = {};
// Session A: IMG_4839, with video
{
  const { A, items } = await records("IMG_4839"), clip = { id: "IMG_4839", clip: A.clip };
  const withOutcome = items.filter((x) => x.s.label.written_outcome);
  const make = pick(withOutcome, (x) => x.q.level === "tracked" && x.s.label.written_outcome === "make"), miss = pick(withOutcome, (x) => x.q.level === "tracked" && x.s.label.written_outcome === "miss");
  const gap = pick(withOutcome, (x) => x.trail.segments.flat().filter((p) => p.type === "reconstructed").length === 1 && x.fp && x.fp.measurements.rim_level_x_bw.value !== null);
  const incomplete = pick(withOutcome, (x) => x.q.level === "none" || (x.fp && x.fp.measurements.rim_level_x_bw.value === null));
  const chosen = [make, miss, gap, incomplete].filter(Boolean), rest = withOutcome.filter((x) => !chosen.includes(x)).slice(0, 8);
  const shots = [...chosen, ...rest].sort((a, b) => a.s.first - b.s.first).map((it, i) => toShot(it, i + 1, chosen.includes(it), clip, "A"));
  manifest.sessions.push({ name: "Set A: IMG_4839 (video and tracking kept)", shots });
  cases.make = shots.find((s) => s.replayId === make.r.shotId).seq; cases.miss = shots.find((s) => s.replayId === miss.r.shotId).seq; cases.short_gap = shots.find((s) => s.replayId === gap.r.shotId).seq; cases.incomplete = incomplete ? shots.find((s) => s.replayId === incomplete.r.shotId).seq : null;
}
// Session B: IMG_4873, rim-hardware phantom clip
{
  const { A, items } = await records("IMG_4873"), clip = { id: "IMG_4873", clip: A.clip };
  const withOutcome = items.filter((x) => x.s.label.written_outcome);
  const contaminated = pick(withOutcome, (x) => x.trail.rimHardwareBoxes > 0) ?? pick(withOutcome, (x) => x.trail.rimHardwareNearby > 0 && x.q.level !== "tracked") ?? pick(withOutcome, (x) => x.q.level === "unreliable");
  const clean = pick(withOutcome, (x) => x.q.level === "tracked" && x !== contaminated), unreliable = pick(withOutcome, (x) => x.q.level === "unreliable" && x !== contaminated), more = withOutcome.filter((x) => x !== contaminated && x !== clean && x !== unreliable).slice(0, 4);
  const chosen = [contaminated, clean, unreliable].filter(Boolean), shots = [...chosen, ...more].sort((a, b) => a.s.first - b.s.first).map((it, i) => toShot(it, i + 1, chosen.includes(it), clip, "B"));
  manifest.sessions.push({ name: "Set B: IMG_4873 (rim hardware often mistaken for the ball)", shots });
  cases.unreliable_in_set_b = unreliable ? { seq: shots.find((s) => s.replayId === unreliable.r.shotId).seq, reasons: unreliable.q.reasons } : null;
  cases.phantom = contaminated ? { seq: shots.find((s) => s.replayId === contaminated.r.shotId).seq, level: contaminated.q.level, rimHardwareBoxes: contaminated.trail.rimHardwareBoxes, rimHardwareNearby: contaminated.trail.rimHardwareNearby, reasons: contaminated.q.reasons } : null;
}
// Session C: IMG_4874, tracking kept but the phone no longer has the video
{
  const { items } = await records("IMG_4874"), shots = items.filter((x) => x.s.label.written_outcome).slice(0, 8).map((it, i) => toShot(it, i + 1, false, null, "C"));
  manifest.sessions.push({ name: "Set C: IMG_4874 (tracking kept, video not kept)", shots: shots.map((s) => ({ ...s, frames: null })) });
}
// Session D: a saved set with outcomes only: no replay, no tracking
{
  const A = await analyseClip("IMG_4851", { thin: 2 });
  manifest.sessions.push({ name: "Set D: IMG_4851 (saved set: outcomes only)", shots: A.shots.slice(0, 8).map((s, i) => ({ seq: i + 1, made: s.label.written_outcome === "make", detectedMade: s.call.v4 === "make", flagged: false, tMs: Math.round(fsMs(s.first)), replayId: null, record: null, frames: null })) });
}
for (const s of manifest.sessions) for (const sh of s.shots) delete sh._caseOf;
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest));
fs.writeFileSync(path.join(EVAL, "experiments/session-review/results/demo-cases.json"), JSON.stringify({ cases, sessions: manifest.sessions.map((s) => ({ name: s.name, shots: s.shots.length, with_video: s.shots.filter((x) => x.frames).length, with_record: s.shots.filter((x) => x.record).length })) }, null, 1));
console.log(JSON.stringify(cases), manifest.sessions.map((s) => `${s.name}: ${s.shots.length} shots, ${s.shots.filter((x) => x.frames).length} with video`));
