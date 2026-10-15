// Loads the app's src/lib/framing TypeScript for offline evaluation without changing it (transpiled copies go to training/work/framing-build, git-ignored).
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "../../lib/registry.mjs";
const OUT = path.join(ROOT, "training/work/framing-build");
export async function loadFraming() {
  const srcDir = path.join(ROOT, "src/lib/framing");
  fs.mkdirSync(OUT, { recursive: true });
  for (const name of fs.readdirSync(srcDir)) {
    if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
    const js = ts.transpileModule(fs.readFileSync(path.join(srcDir, name), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/from "(\.[^"]*)\.ts"/g, 'from "$1.mjs"');
    fs.writeFileSync(path.join(OUT, name.replace(/\.ts$/, ".mjs")), js);
  }
  const load = (n) => import(pathToFileURL(path.join(OUT, n + ".mjs")).href + "?t=" + Date.now());
  return { measure: await load("measure") };
}
export const STILLS = path.join(ROOT, "training/work/framing/stills");
export const CLIPS = ["IMG_4836", "IMG_4839", "IMG_4840", "IMG_4844", "IMG_4851", "IMG_4866", "IMG_4867", "IMG_4872", "IMG_4873", "IMG_4874"];
export const KS = [1, 3, 5, 7, 9];
