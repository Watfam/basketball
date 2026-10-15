// Per-clip analysis: pipeline run, shots matched to baseline-v0, trails. source "production" = the saved production-window detections;
// source "context" = production window plus the Experiment-2 2x rim-centred window on the sampled shot segments (NMS 0.4), the rest of the clip production-only.
import fs from "node:fs";
import path from "node:path";
import { loadRegistry, readJSON, WORK as _W } from "../visibility/common.mjs";
import { loadClip, nms } from "../visibility/strategies.mjs";
import { align } from "../../lib/shots.mjs";
import { runStream, loadDetections, rimOf, vision } from "./pipeline.mjs";
import { buildTrail } from "./trail.mjs";

const S = readJSON("training/eval/experiments/tracker/results/shots-round3.json");
export const CLIPS = ["IMG_4839", "IMG_4840", "IMG_4851", "IMG_4866", "IMG_4867", "IMG_4872", "IMG_4873", "IMG_4874"];
const reg = loadRegistry();
export const clipInfo = (id) => reg.clips.find((c) => c.id === id);

/** baseline-v0 pairing: the written outcome of the counted shot that starts within 15 frames of `first`, if any. */
export function baselineLabel(id, fps, first) {
  const per = S.clips[id][fps].baseline_legacy.per_shot.find((p) => p.seen && Math.abs(p.first - first) <= 15);
  return per ? { written_outcome: per.truth, v4_call_baseline: per.v4, pairing: "baseline-v0 V2-agreement alignment" } : { written_outcome: null, v4_call_baseline: null, pairing: "unmatched" };
}

const annotations = readJSON("training/eval/annotate/annotations.json");
const phantomEvents = {}; for (const e of annotations.events ?? []) if (e.type === "no_shot") (phantomEvents[e.clip] ??= []).push(e.frame);
/** Pairs THIS pipeline's counted shots with the written list exactly as baseline-v0 does (annotated phantom candidates removed, V2-agreement alignment). The alignment can slide by one shot after a lost shot. */
export function pairWithWritten(id, counted) {
  const truth = readJSON(clipInfo(id).truth.file).results, ph = phantomEvents[id] ?? [], kept = counted.filter((c) => !ph.some((f) => Math.abs(c.first - f) <= 3)), a = align(kept, truth), by = new Map(a.pairs.map((p) => [p.s.first, p]));
  return { by, how: a.how };
}

export function contextStream(id) {
  const C = loadClip(id), { frames, byF } = loadDetections(clipInfo(id)), out = new Map(byF), inSeg = new Set(C.frames);
  for (const f of C.frames) out.set(f, nms([...(byF.get(f) ?? []), ...C.tileDets("A2", f)]));
  return { frames, byF: out, segmentFrames: inSeg, sampled: C.d.shots };
}

export async function analyseClip(id, { thin = 1, source = "production", associator = "cv_nearest", timing = false } = {}) {
  const clip = clipInfo(id), fps = thin === 1 ? "30fps" : "15fps";
  const det = source === "context" ? contextStream(id) : loadDetections(clip);
  const run = await runStream(clip, det, { thin, associator, timing });
  const pairing = pairWithWritten(id, run.counted);
  const shots = run.counted.map((call) => {
    const tracks = call.tracks.map((tid) => run.tracker.track(tid)).filter(Boolean);
    const trail = buildTrail({ tracks, isClutter: (tid, f) => !!run.machine.clutterAt(tid, f, call.decidedAt), boxesAt: (f) => det.byF.get(f) ?? [], rim: run.rim, f0: call.first - 75, f1: call.first + 40, thin });
    return { id: `${id}:${call.first}`, clip: id, first: call.first, last: call.last, call, trail, label: (() => { const p = pairing.by.get(call.first); return p ? { written_outcome: p.t, v4_call: call.v4, pairing: `V2-agreement alignment of this pipeline's counted shots (${pairing.how})` } : { written_outcome: null, v4_call: call.v4, pairing: "unmatched" }; })() };
  });
  return { clip, id, thin, fps, source, run, shots, byF: det.byF, rim: run.rim };
}
