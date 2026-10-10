// Node 20 cannot run TypeScript directly, so this transpiles the app's counting files and the scorer
// (tools/41-score-core.ts) into training/work/core41 and runs it:   node training/tools/41-run.mjs <args of 41-score-core.ts>
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const out = path.join(root, "training/work/core41");
const files = ["src/lib/vision/counting.ts", "src/lib/vision/roi.ts", "src/lib/vision/autoSize.ts", "src/lib/vision/shotRules.ts", "training/tools/41-score-core.ts"];
fs.rmSync(out, { recursive: true, force: true });
for (const rel of files) {
  const js = ts.transpileModule(fs.readFileSync(path.join(root, rel), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const dest = path.join(out, rel).replace(/\.ts$/, ".mjs");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, js.replace(/from "(\.[^"]*)\.ts"/g, 'from "$1.mjs"'));
}
const r = spawnSync("node", [path.join(out, "training/tools/41-score-core.mjs"), ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(r.status ?? 1);
