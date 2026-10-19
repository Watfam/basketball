import { CLIPS, loadClip, countFrames, sightingsOf } from "./lib.mjs";
import { countClip } from "../../lib/shots.mjs";
import { readJSON } from "../../lib/registry.mjs";
import { attemptsIn, arrivals } from "./attempts.ts";
const ref = readJSON("training/eval/experiments/shot-separation/results/diagnostic-all.json").reference;
const covers = (p, t) => p.first - 25 <= t && t <= p.last + 15;
const g = 25; let shown = 0; const why = {};
for (const id of CLIPS) {
  const c = await loadClip(id);
  const calls = countClip(c.vision, c.clip, c.clip.detections.ball6, { thin: 1 }).calls;
  const T = ref[id].times, single = T.map((t) => { const cv = calls.filter((p) => covers(p, t)); return cv.length === 1 && T.filter((u) => covers(cv[0], u)).length === 1 ? cv[0] : null; });
  for (let i = 0; i + 1 < T.length; i += 1) {
    const A = single[i], B = single[i + 1]; if (!A || !B) continue;
    const frames = new Map(), shift = A.last + g - B.first, base = A.first - 60;
    const put = (f, arr) => { if (f < 0) return; (frames.get(f) ?? frames.set(f, []).get(f)).push(...arr); };
    for (let f = base; f <= A.last; f += 1) put(f - base, c.frames.get(f) ?? []);
    for (let f = B.first - 60; f <= B.last + 80; f += 1) { const nf = f + shift - base; if (nf + base <= A.last) continue; put(nf, c.frames.get(f) ?? []); }
    const calls2 = countFrames(c, frames, B.last + 80 + shift - base + 2, 1);
    if (calls2.length !== 1) continue;
    const s = sightingsOf(c, frames, calls2[0].first - 30, calls2[0].last + 30);
    const rep = attemptsIn(s);
    if (!rep.possiblyTwo) {
      const arr = arrivals(s); const k = arr.length === 0 ? "no arrivals" : arr.length === 1 ? "one arrival" : links(rep);
      why[k] = (why[k] ?? 0) + 1;
      if (shown++ < 6) console.log(id, A.first, B.first, "arrivals", JSON.stringify(arr), "links", JSON.stringify(rep.links.map((l) => ({ gap: l.gap, cont: l.continuous, rms: l.rms?.toFixed(1), accel: l.accel?.toFixed(2), n: l.followed }))));
    }
  }
}
function links(rep) { return "two+ arrivals, link judged " + (rep.links.map((l) => (l.gap < 12 ? "too close" : l.continuous ? "continuous" : "?")).join(",")); }
console.log(why);
