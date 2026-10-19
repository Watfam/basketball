// What does the shipped counter call when two real attempts merge?  Spliced pairs (S1, gap 25 frames, 30 fps): the merged call's V4 against the two originals.
import fs from "node:fs";
import { CLIPS, loadClip, countFrames } from "./lib.mjs";
import { countClip } from "../../lib/shots.mjs";
import { readJSON } from "../../lib/registry.mjs";
const ref = readJSON("training/eval/experiments/shot-separation/results/diagnostic-all.json").reference;
const covers = (p, t) => p.first - 25 <= t && t <= p.last + 15;
const tab = {}; let merged = 0, n = 0;
for (const id of CLIPS) {
  const c = await loadClip(id);
  const calls = countClip(c.vision, c.clip, c.clip.detections.ball6, { thin: 1 }).calls;
  const T = ref[id].times, single = T.map((t) => { const cv = calls.filter((p) => covers(p, t)); return cv.length === 1 && T.filter((u) => covers(cv[0], u)).length === 1 ? cv[0] : null; });
  for (let i = 0; i + 1 < T.length; i += 1) {
    const A = single[i], B = single[i + 1]; if (!A || !B) continue;
    const g = 25, frames = new Map(), shift = A.last + g - B.first, base = A.first - 60;
    const put = (f, arr) => { if (f < 0) return; (frames.get(f) ?? frames.set(f, []).get(f)).push(...arr); };
    for (let f = base; f <= A.last; f += 1) put(f - base, c.frames.get(f) ?? []);
    for (let f = B.first - 60; f <= B.last + 80; f += 1) { const nf = f + shift - base; if (nf + base <= A.last) continue; put(nf, c.frames.get(f) ?? []); }
    const out = countFrames(c, frames, B.last + 80 + shift - base + 2, 1);
    n += 1;
    if (out.length !== 1) continue;
    merged += 1;
    const key = `${A.v4}+${B.v4} -> ${out[0].v4}`;
    tab[key] = (tab[key] ?? 0) + 1;
  }
}
console.log({ pairs: n, merged }); console.log(tab);
fs.writeFileSync("results/merge-outcomes.json", JSON.stringify({ pairs: n, merged, first_plus_second_to_merged_v4: tab, note: "S1 splice, 25-frame gap, 30 fps, shipped counter; synthetic pairs from real attempts" }, null, 1));
