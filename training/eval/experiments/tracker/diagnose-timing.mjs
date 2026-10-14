// Worst-case timing attribution (registered in criteria-v2.json): every frame slower than 2 ms is checked against Node's garbage-collection events and the work in that frame.
//   node diagnose-timing.mjs -> results/diagnose-timing.json
import fs from "node:fs";
import path from "node:path";
import { PerformanceObserver, performance } from "node:perf_hooks";
import { EVAL, loadRegistry, readJSON } from "../../lib/registry.mjs";
import { loadVision } from "../../lib/transpile.mjs";
import { createTracker } from "./tracker.mjs";
import { createShotMachine } from "./shotmachine.mjs";
import { legacyCounter } from "./decide.mjs";
import { CONFIGS as H_FILTERS } from "../rim-phantom/filters.mjs";
const sel = readJSON("training/eval/experiments/tracker/results/selection.json"), reg = loadRegistry(), V = await loadVision(), R = V.shotRules;
const rimOf = (clip) => { const [rx, ry] = clip.window.rim_native; return V.counting.createCountingCore({ frameW: 1920, frameH: 1080, rim: { x: rx / 1920, y: ry / 1080 }, scale: clip.window.scale, autoSize: false }).window.rim; };
const load = (clip) => { const d = readJSON(clip.detections.ball6), byF = new Map(); for (const x of d.detections) (byF.get(x.f) ?? byF.set(x.f, []).get(x.f)).push({ ...x }); return { frames: d.frames, byF }; };
const out = {};
for (const id of ["IMG_4873", "IMG_4839", "IMG_4872"]) for (const kind of ["tracks", "H2_legacy"]) for (const [fk, thin] of [["30fps", 1], ["15fps", 2]]) {
  const clip = reg.clips.find((c) => c.id === id), { frames, byF } = load(clip), rim = rimOf(clip);
  const gcRaw = []; const obs = new PerformanceObserver((l) => { for (const r of l.getEntries()) gcRaw.push(r); }); obs.observe({ entryTypes: ["gc"] });
  const frameLog = [];
  let tr, M, lc, filter;
  if (kind === "tracks") { tr = createTracker({ associator: "kalman", model: sel.selected.model, modelParams: sel.selected.params, interpW: sel.selected.interpolation_W }); M = createShotMachine({ rim, scene: tr.scene, rules: R }); } else { lc = legacyCounter(rim, R); filter = H_FILTERS.H2(); }
  const t00 = performance.now();
  for (let f = 0; f < frames; f += 1) {
    if (thin > 1 && f % thin) continue;
    const boxes = byF.get(f) ?? [], h0 = process.memoryUsage().heapUsed, s = performance.now();
    let decided = 0; if (kind === "tracks") decided = M.push(tr.push(f, boxes)).length; else lc.push((f * 1000) / R.REFERENCE_FPS, filter.push(f, boxes));
    const e = performance.now(), h1 = process.memoryUsage().heapUsed;
    frameLog.push({ f, start: s, end: e, ms: e - s, boxes: boxes.length, heapDrop: h1 < h0, decided });
  }
  await new Promise((r) => setTimeout(r, 100)); obs.disconnect();
  const gcs = gcRaw.map((r) => ({ start: r.startTime, end: r.startTime + r.duration, ms: r.duration, kind: r.detail?.kind ?? r.kind }));
  const slow = frameLog.filter((x) => x.ms > 2), overlap = (a, b) => a.start < b.end && b.start < a.end;
  const explained = slow.filter((x) => gcs.some((g) => overlap(x, g)));
  const sortedMs = frameLog.map((x) => x.ms).sort((a, b) => a - b);
  out[`${id}|${kind}|${fk}`] = { frames: frameLog.length, total_ms: performance.now() - t00, median_ms: sortedMs[sortedMs.length >> 1], p999_ms: sortedMs[Math.floor(sortedMs.length * 0.999)], max_ms: sortedMs[sortedMs.length - 1], slow_over_2ms: slow.length, slow_overlapping_a_gc_event: explained.length, slow_on_a_decision_frame: slow.filter((x) => x.decided).length, decision_frames: frameLog.filter((x) => x.decided).length, slow_with_heap_drop: slow.filter((x) => x.heapDrop).length, gc_events: gcs.length, gc_total_ms: gcs.reduce((a, g) => a + g.ms, 0), gc_longest_ms: Math.max(0, ...gcs.map((g) => g.ms)), slowest: slow.sort((a, b) => b.ms - a.ms).slice(0, 5).map((x) => ({ f: x.f, ms: +x.ms.toFixed(2), boxes: x.boxes, decided: x.decided, gc: gcs.filter((g) => overlap(x, g)).map((g) => +g.ms.toFixed(2)) })) };
  console.log(`${id} ${kind} ${fk}: median ${out[`${id}|${kind}|${fk}`].median_ms.toFixed(4)} p99.9 ${out[`${id}|${kind}|${fk}`].p999_ms.toFixed(3)} max ${out[`${id}|${kind}|${fk}`].max_ms.toFixed(2)}  slow>2ms ${slow.length} (${explained.length} overlap a GC event, ${slow.filter((x) => x.heapDrop).length} with a heap drop, ${slow.filter((x) => x.decided).length} on a decision frame of ${frameLog.filter((x) => x.decided).length})  gc events ${gcs.length}`);
}
fs.writeFileSync(path.join(EVAL, "experiments/tracker/results/diagnose-timing.json"), JSON.stringify(out, null, 1) + "\n");
