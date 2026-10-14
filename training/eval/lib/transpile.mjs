// Loads the app's own vision code (src/lib/vision/*.ts) for the harness without changing it: transpiled copies
// go to training/work/eval-build (git-ignored). Same approach as tools/43-run-tests.mjs.
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "./registry.mjs";

const OUT = path.join(ROOT, "training/work/eval-build");

export async function loadVision() {
  const srcDir = path.join(ROOT, "src/lib/vision");
  fs.mkdirSync(OUT, { recursive: true });
  for (const name of fs.readdirSync(srcDir)) {
    if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
    const src = fs.readFileSync(path.join(srcDir, name), "utf8");
    const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
      .replace(/from "(\.[^"]*)\.ts"/g, 'from "$1.mjs"')
      .replace(/import\("(\.[^"]*)\.ts"\)/g, 'import("$1.mjs")');
    fs.writeFileSync(path.join(OUT, name.replace(/\.ts$/, ".mjs")), js);
  }
  const load = (n) => import(pathToFileURL(path.join(OUT, n + ".mjs")).href);
  return { roi: await load("roi"), shotRules: await load("shotRules"), counting: await load("counting"), yolox: await load("yolox") };
}
