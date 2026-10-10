// Runs the app's src/lib/vision tests on a Node too old to read TypeScript (this Mac has 20.9; `npm test` needs a newer one).
// Transpiles src/lib/vision/*.ts to training/work/tests43 and runs the *.test.ts files with node --test.
//   node training/tools/43-run-tests.mjs [name-filter]
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const out = path.join(root, "training/work/tests43");
fs.rmSync(out, { recursive: true, force: true });
const tests = [];
const all = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (f.endsWith(".ts")) all.push(path.relative(root, f)); } };
walk(path.join(root, "src/lib"));
for (const rel of all) {
  const name = path.basename(rel);
  const src = fs.readFileSync(path.join(root, rel), "utf8");
  const dest = path.join(out, rel.replace(/\.ts$/, ".mjs"));
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace(/from "(\.[^"]*)\.ts"/g, 'from "$1.mjs"')
    .replace(/import\("(\.[^"]*)\.ts"\)/g, 'import("$1.mjs")')
    .replaceAll("import.meta.dirname", JSON.stringify(path.dirname(path.join(root, rel))));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, js);
  if (name.endsWith(".test.ts") && (!process.argv[2] || name.includes(process.argv[2]))) tests.push(dest);
}
const r = spawnSync("node", ["--test", ...tests], { stdio: "inherit", cwd: root });
process.exit(r.status ?? 1);
