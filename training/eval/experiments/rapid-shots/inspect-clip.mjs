// Root-cause inspection: what the shipped counter does with one clip's saved detections, shot by shot, and where two attempts could hide inside one call.
// usage: node inspect-clip.mjs IMG_4851 [thin]
import { loadVision } from "../../lib/transpile.mjs";
import { loadRegistry, readJSON } from "../../lib/registry.mjs";
import { countClip, align } from "../../lib/shots.mjs";
const [id, thinArg] = process.argv.slice(2);
const thin = Number(thinArg ?? 1);
const reg = loadRegistry(), clip = reg.clips.find((c) => c.id === id);
const vision = await loadVision();
const { calls } = countClip(vision, clip, clip.detections.ball6, { thin });
const truth = readJSON(clip.truth.file).results;
const a = align(calls, truth);
console.log(`${id} thin=${thin}: written ${truth.length}, counted ${calls.length}, pairing: ${a.how}, unseen written ${a.unseen}, extra counted ${a.extra}`);
const paired = new Map(a.pairs.map((p) => [p.s.first, p]));
calls.forEach((c, i) => {
  const p = paired.get(c.first);
  const span = c.last - c.first;
  console.log(`#${String(i + 1).padStart(2)} first ${String(c.first).padStart(5)} last ${String(c.last).padStart(5)} span ${String(span).padStart(3)} sightings ${String(c.zoneSightings).padStart(3)} v4 ${c.v4} written ${p ? p.t + " (idx " + (p.ti + 1) + ")" : "-"}${span > 25 ? "   <-- long (could hold two attempts)" : ""}`);
});
const un = [];
let ti = 0; for (const p of a.pairs) { while (ti < p.ti) { un.push(ti + 1); ti += 1; } ti = p.ti + 1; } while (ti < truth.length) { un.push(ti + 1); ti += 1; }
console.log("written shots with no counted shot paired:", un.join(", ") || "none");
