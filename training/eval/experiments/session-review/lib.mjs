// Loads the app's src/lib/review TypeScript for offline checks without changing it (transpiled copies in training/work/review-build, git-ignored).
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "../../lib/registry.mjs";
const OUT = path.join(ROOT, "training/work/review-build");
export async function loadReview() {
  for (const dir of ["lib/review", "lib/vision"]) {
    const srcDir = path.join(ROOT, "src", dir), dest = path.join(OUT, dir);
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(srcDir)) {
      if (!name.endsWith(".ts") || name.endsWith(".test.ts") || /^(use-camera-counter|detector|engine|gpu-probes|replay-store|hoop-ref-store)/.test(name) || name === "detector.worker.ts") continue;
      const src = fs.readFileSync(path.join(srcDir, name), "utf8");
      const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/from "(\.[^"]*)\.ts"/g, 'from "$1.mjs"').replace(/from "\.\.\/vision\/([^"]*)\.ts"/g, 'from "../vision/$1.mjs"');
      fs.writeFileSync(path.join(dest, name.replace(/\.ts$/, ".mjs")), js);
    }
  }
  const load = (rel) => import(pathToFileURL(path.join(OUT, rel)).href);
  return { trail: await load("lib/review/trail.mjs"), fingerprint: await load("lib/review/fingerprint.mjs"), quality: await load("lib/review/quality.mjs"), recorder: await load("lib/review/recorder.mjs"), types: await load("lib/review/types.mjs") };
}
