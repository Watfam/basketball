// Runs the app's replay test (src/lib/review/replaytest.ts) in Node on the real-derived phone replay file (made from existing recordings by
// persistent-history/build-real-history.mjs --phone-file). DESKTOP numbers: they show the logic is right on real paths, not how fast a phone is.
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "../../lib/registry.mjs";
const BASE = path.join(ROOT, "training/work/replay-build");
for (const dir of ["lib/review", "lib/vision", "lib/basketball"]) {
  const out = path.join(BASE, dir), src = path.join(ROOT, "src", dir);
  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    if (!f.endsWith(".ts") || f.endsWith(".test.ts") || /^(history-store|review-store|history-ops|retain-session|use-camera-counter|detector|engine|gpu-probes|replay-store|hoop-ref-store)/.test(f)) continue;
    const js = ts.transpileModule(fs.readFileSync(path.join(src, f), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/from "(\.[^"]*)\.ts"/g, 'from "$1.mjs"').replace(/from "\.\.\/(vision|basketball)\/([^"]*)\.ts"/g, 'from "../$1/$2.mjs"');
    fs.writeFileSync(path.join(out, f.replace(/\.ts$/, ".mjs")), js);
  }
}
const OUT = path.join(BASE, "lib/review");
const load = (n) => import(pathToFileURL(path.join(OUT, n + ".mjs")).href);
const [rt, mem, tr] = [await load("replaytest"), await load("history-memory"), await load("history-transfer")];
const file = path.join(ROOT, "training/work/phone-replay/hardwood-lab-replay-sample.json");
const be = mem.memoryBackend();
const plan = await tr.planImport(fs.readFileSync(file, "utf8"), be, "me", { onDuplicate: "skip" }, Date.now());
if (!plan.ok) throw new Error(plan.message);
console.log("import plan", JSON.stringify(plan.summary), "shots", plan.shotsToAdd);
await tr.runImport(plan, be);
const noCtx = new Proxy({}, { get: () => () => undefined, set: () => true });
const r = await rt.runReplayTest(be, () => {}, { canvas: () => noCtx });
const checks = rt.judgeReplay(r);
console.log(JSON.stringify({ desktop_node: true, replay: r }, null, 1));
for (const c of checks) console.log(c.verdict.padEnd(14), c.label, "|", c.value);
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "replay-real-desktop.json"), JSON.stringify({ note: "Desktop Node run of the replay test on the real-derived file. Not a phone result.", report: r, checks }, null, 1));
