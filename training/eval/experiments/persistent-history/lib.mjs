// Loads the app's src/lib/review TypeScript (including the history core and analytics) for offline checks, without changing it.
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "../../lib/registry.mjs";
const OUT = path.join(ROOT, "training/work/history-build");
export async function loadHistoryLib() {
  for (const dir of ["lib/review", "lib/vision", "lib/basketball"]) {
    const srcDir = path.join(ROOT, "src", dir), dest = path.join(OUT, dir);
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(srcDir)) {
      if (!name.endsWith(".ts") || name.endsWith(".test.ts") || /^(use-camera-counter|detector|engine|gpu-probes|replay-store|hoop-ref-store|history-store|review-store|retain-session|selftest)/.test(name) || name === "detector.worker.ts") continue;
      const src = fs.readFileSync(path.join(srcDir, name), "utf8");
      const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/from "(\.[^"]*)\.ts"/g, 'from "$1.mjs"').replace(/from "\.\.\/(vision|basketball)\/([^"]*)\.ts"/g, 'from "../$1/$2.mjs"');
      fs.writeFileSync(path.join(dest, name.replace(/\.ts$/, ".mjs")), js);
    }
  }
  const load = (rel) => import(pathToFileURL(path.join(OUT, rel)).href);
  return { core: await load("lib/review/history-core.mjs"), consistency: await load("lib/review/consistency.mjs"), recorder: await load("lib/review/recorder.mjs"), types: await load("lib/review/history-types.mjs") };
}
