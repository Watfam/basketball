// Prints a clip's saved detections around a frame range as positions relative to the rim (window pixels): dx sideways, dy down (+ is below the rim), w width.
// usage: node timeline.mjs IMG_4851 440 500
import { loadVision } from "../../lib/transpile.mjs";
import { loadRegistry, readJSON } from "../../lib/registry.mjs";
const [id, a, b] = process.argv.slice(2);
const reg = loadRegistry(), clip = reg.clips.find((c) => c.id === id);
const vision = await loadVision();
const w = clip.window, [rx, ry] = w.rim_native;
const core = vision.counting.createCountingCore({ frameW: 1920, frameH: 1080, rim: { x: rx / 1920, y: ry / 1080 }, scale: w.scale, autoSize: false });
const rim = core.window.rim;
const d = readJSON(clip.detections.ball6);
const by = new Map(); for (const x of d.detections) (by.get(x.f) ?? by.set(x.f, []).get(x.f)).push(x);
console.log(`${id} rim in window (${rim.x.toFixed(0)}, ${rim.y.toFixed(0)}); frames ${a}..${b}`);
for (let f = Number(a); f <= Number(b); f += 1) {
  const bs = (by.get(f) ?? []).map((x) => { const cx = (x.x1 + x.x2) / 2, cy = (x.y1 + x.y2) / 2; return `[dx ${(cx - rim.x).toFixed(0)} dy ${(cy - rim.y).toFixed(0)} w ${(x.x2 - x.x1).toFixed(0)} s ${x.score.toFixed(2)}${vision.shotRules.inZone(x, rim) ? " Z" : ""}]`; });
  console.log(String(f).padStart(5), bs.join(" ") || "-");
}
