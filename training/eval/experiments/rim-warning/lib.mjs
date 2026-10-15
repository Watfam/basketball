// Loads the app's own review + vision code (transpiled copies in training/work/replay-build, git-ignored) and replays a clip's saved detections
// through the app's REAL review recorder and the PRODUCTION counting core, cutting a record at every counted call exactly as use-camera-counter.ts does.
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, EVAL, loadRegistry, readJSON } from "../../lib/registry.mjs";

const BASE = path.join(ROOT, "training/work/replay-build");
export async function loadApp() {
  for (const dir of ["lib/review", "lib/vision", "lib/basketball"]) {
    const out = path.join(BASE, dir), src = path.join(ROOT, "src", dir);
    fs.mkdirSync(out, { recursive: true });
    for (const f of fs.readdirSync(src)) {
      if (!f.endsWith(".ts") || f.endsWith(".test.ts") || /^(history-store|review-store|history-ops|retain-session|use-camera-counter|detector|engine|gpu-probes|replay-store|hoop-ref-store)/.test(f)) continue;
      const js = ts.transpileModule(fs.readFileSync(path.join(src, f), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/from "(\.[^"]*)\.ts"/g, 'from "$1.mjs"').replace(/from "\.\.\/(vision|basketball)\/([^"]*)\.ts"/g, 'from "../$1/$2.mjs"');
      fs.writeFileSync(path.join(out, f.replace(/\.ts$/, ".mjs")), js);
    }
  }
  const load = (rel) => import(pathToFileURL(path.join(BASE, rel)).href + "?t=" + Date.now());
  return { recorder: await load("lib/review/recorder.mjs"), warning: await load("lib/review/rim-warning.mjs"), counting: await load("lib/vision/counting.mjs"), shotRules: await load("lib/vision/shotRules.mjs") };
}
export const reg = loadRegistry();
export const clipOf = (id) => reg.clips.find((c) => c.id === id);
export const CLIPS = ["IMG_4839", "IMG_4840", "IMG_4851", "IMG_4866", "IMG_4867", "IMG_4872", "IMG_4873", "IMG_4874"];
export const DEV = ["IMG_4839", "IMG_4840", "IMG_4851", "IMG_4866", "IMG_4867"];
export function loadDets(clip) { const d = readJSON(clip.detections.ball6), byF = new Map(); for (const x of d.detections) (byF.get(x.f) ?? byF.set(x.f, []).get(x.f)).push({ ...x }); return { frames: d.frames, byF }; }

/**
 * Replay one clip. thin 2 = 15 fps (the app's rate). `byF` may carry injected boxes (flag _inj). Returns the records (one per counted call, cut 900 ms
 * after the call as the app does), the counted calls from the production core, and the window rim.
 */
export function replayClip(app, clip, { frames, byF }, { thin = 2 } = {}) {
  const [rx, ry] = clip.window.rim_native, REF = app.shotRules.REFERENCE_FPS;
  const core = app.counting.createCountingCore({ frameW: 1920, frameH: 1080, rim: { x: rx / 1920, y: ry / 1080 }, scale: clip.window.scale, autoSize: false });
  const rec = app.recorder.createReviewRecorder(), records = [], counted = [], pending = [];
  const cutDue = (t) => { for (let i = pending.length - 1; i >= 0; i -= 1) if (pending[i].due <= t) { const p = pending.splice(i, 1)[0]; records.push(rec.cut(p.firstMs, p.id, core.window.rim, core.scale)); } };
  for (let f = 0; f < frames; f += 1) {
    if (thin > 1 && f % thin) continue;
    const t = (f * 1000) / REF, boxes = byF.get(f) ?? [];
    cutDue(t);
    rec.push(t, true, boxes);
    const { calls, windowChanged } = core.push(t, boxes);
    for (const c of calls) if (c.counted) { counted.push(c); pending.push({ due: t + 900, firstMs: c.firstMs, id: `shot-${Math.round(c.firstMs)}` }); }
    if (windowChanged) rec.reset();
  }
  const tEnd = ((frames - 1) * 1000) / REF;
  for (const c of core.flush()) if (c.counted) { counted.push(c); pending.push({ due: tEnd, firstMs: c.firstMs, id: `shot-${Math.round(c.firstMs)}` }); }
  cutDue(Infinity);
  records.sort((a, b) => a.firstMs - b.firstMs);
  return { records, counted, rim: core.window.rim };
}
