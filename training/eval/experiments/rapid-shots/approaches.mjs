// Exploration (no thresholds claimed): find every "approach" in a clip's saved detections, a ball coming down toward the rim from above,
// independent of the shipped grouping, and report which counted calls contain more than one.
// usage: node approaches.mjs IMG_4851 [thin]
import { loadVision } from "../../lib/transpile.mjs";
import { loadRegistry, readJSON } from "../../lib/registry.mjs";
import { countClip } from "../../lib/shots.mjs";
const [id, thinArg] = process.argv.slice(2);
const thin = Number(thinArg ?? 1);
const reg = loadRegistry(), clip = reg.clips.find((c) => c.id === id);
const vision = await loadVision();
const w = clip.window, [rx, ry] = w.rim_native;
const core = vision.counting.createCountingCore({ frameW: 1920, frameH: 1080, rim: { x: rx / 1920, y: ry / 1080 }, scale: w.scale, autoSize: false });
const rim = core.window.rim;
const d = readJSON(clip.detections.ball6);
const by = new Map(); for (const x of d.detections) (by.get(x.f) ?? by.set(x.f, []).get(x.f)).push(x);
const pts = [];
for (let f = 0; f < d.frames; f += 1) if (!(thin > 1 && f % thin)) for (const x of by.get(f) ?? []) pts.push({ f, dx: (x.x1 + x.x2) / 2 - rim.x, dy: (x.y1 + x.y2) / 2 - rim.y, w: x.x2 - x.x1, s: x.score });
// approach: sightings within 60 px sideways, y rising from <= -35 above the rim to >= -12 (nearly at the rim line), moving down on every step, gaps of at most 6 frames
const appr = [];
const used = new Set();
for (let i = 0; i < pts.length; i += 1) {
  const p = pts[i];
  if (used.has(i) || p.dy > -35 || p.dy < -140 || Math.abs(p.dx) > 90) continue;
  let last = p, chain = [i];
  for (let j = i + 1; j < pts.length; j += 1) {
    const q = pts[j];
    if (q.f - last.f > 6 * thin) break;
    if (q.f === last.f) continue;
    if (Math.hypot(q.dx - last.dx, q.dy - last.dy) > 45 * (q.f - last.f) / thin + 12) continue;
    if (q.dy < last.dy - 2) continue;       // moving up: not an approach
    chain.push(j); last = q;
    if (q.dy >= -12) { appr.push({ f0: p.f, f1: q.f, dx1: q.dx, speed: (q.dy - p.dy) / (q.f - p.f) }); for (const c of chain) used.add(c); break; }
  }
}
const { calls } = countClip(vision, clip, clip.detections.ball6, { thin });
console.log(`${id}: ${appr.length} approaches, ${calls.length} counted calls`);
for (const c of calls) {
  const inside = appr.filter((a) => a.f1 >= c.first - 2 && a.f1 <= c.last + 2);
  if (inside.length !== 1) console.log(`  call first ${c.first} last ${c.last} span ${c.last - c.first}: approaches ${inside.length} ${JSON.stringify(inside.map((a) => [a.f0, a.f1]))}`);
}
const orphan = appr.filter((a) => !calls.some((c) => a.f1 >= c.first - 2 && a.f1 <= c.last + 2));
if (orphan.length) console.log("  approaches in no counted call:", JSON.stringify(orphan.map((a) => [a.f0, a.f1])));
