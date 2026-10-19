import { CLIPS, loadClip, sightingsOf } from "./lib.mjs";
import { countClip } from "../../lib/shots.mjs";
import { readJSON } from "../../lib/registry.mjs";
import { arrivals } from "./attempts.ts";
const ref = readJSON("training/eval/experiments/shot-separation/results/diagnostic-all.json").reference;
let tot = 0, hit = 0; const miss = [];
for (const id of CLIPS) {
  const c = await loadClip(id);
  const calls = countClip(c.vision, c.clip, c.clip.detections.ball6, { thin: 1 }).calls;
  for (const p of calls) {
    const cov = ref[id].times.filter((t) => p.first - 25 <= t && t <= p.last + 15);
    if (cov.length !== 1) continue;
    tot += 1;
    const a = arrivals(sightingsOf(c, c.frames, p.first - 30, p.last + 30));
    if (a.length) hit += 1; else miss.push(`${id}:${p.first}`);
  }
}
console.log(`arrival found for ${hit}/${tot}`, miss.join(" "));
