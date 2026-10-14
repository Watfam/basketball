// node training/eval/compare.mjs <baseline.json> <candidate.json>
import fs from "node:fs";
import path from "node:path";
import { EVAL, readJSON } from "./lib/registry.mjs";
import { compareReports, renderComparison } from "./lib/compare.mjs";
const [a, b] = process.argv.slice(2).map((p) => JSON.parse(fs.readFileSync(path.resolve(p), "utf8")));
const result = compareReports(a, b, readJSON("training/eval/thresholds.json"));
const md = renderComparison(result);
fs.writeFileSync(path.join(EVAL, "reports", `compare-${a.id}-vs-${b.id}.md`), md);
console.log(md);
process.exit(result.findings.some((f) => f.verdict === "REGRESSION") || !result.valid ? 1 : 0);
