// Footage inventory for rapid sequences: how close do real attempts sit in the labelled clips, and what do the multi-arrival groups look like?
import fs from "node:fs";
import { CLIPS, loadClip, sightingsOf } from "./lib.mjs";
import { countClip } from "../../lib/shots.mjs";
import { readJSON } from "../../lib/registry.mjs";
import { arrivals } from "./attempts.ts";
const ref = readJSON("training/eval/experiments/shot-separation/results/diagnostic-all.json").reference;
const out = { generated: new Date().toISOString(), clips: {}, all_gaps_frames: [] };
for (const id of CLIPS) {
  const T = ref[id].times, gaps = T.slice(1).map((t, i) => t - T[i]);
  const c = await loadClip(id);
  const calls = countClip(c.vision, c.clip, c.clip.detections.ball6, { thin: 1 }).calls;
  const multi = [];
  for (const p of calls) {
    const a = arrivals(sightingsOf(c, c.frames, p.first - 30, p.last + 30));
    if (a.length >= 2) multi.push({ first: p.first, span: p.last - p.first, arrivals: a.map((x) => x.f1), gaps: a.slice(1).map((x, i) => x.f1 - a[i].f1), references_in_call: T.filter((t) => p.first - 25 <= t && t <= p.last + 15).length });
  }
  out.clips[id] = { references: T.length, written: ref[id].written, min_gap_frames: Math.min(...gaps), gaps_under_90_frames: gaps.filter((g) => g < 90).length, gaps_under_40_frames: gaps.filter((g) => g < 40).length, multi_arrival_calls: multi };
  out.all_gaps_frames.push(...gaps);
  console.log(id.padEnd(9), `refs ${String(T.length).padStart(2)} min gap ${String(Math.min(...gaps)).padStart(3)} fr (${(Math.min(...gaps) / 29.97).toFixed(1)} s)  gaps<90: ${gaps.filter((g) => g < 90).length}  <40: ${gaps.filter((g) => g < 40).length}  multi-arrival calls: ${multi.length} ${multi.map((m) => `[${m.first}: ${m.gaps.join("/")} fr, ${m.references_in_call} ref]`).join(" ")}`);
}
const g = out.all_gaps_frames.sort((a, b) => a - b);
out.summary = { gaps: g.length, shortest_five: g.slice(0, 5), under_40: g.filter((x) => x < 40).length, under_60: g.filter((x) => x < 60).length, under_90: g.filter((x) => x < 90).length };
console.log(out.summary);
fs.writeFileSync("results/inventory.json", JSON.stringify(out, null, 1));
