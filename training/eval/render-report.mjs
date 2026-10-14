// Re-renders a report's Markdown from its JSON (no measurement is repeated).   node training/eval/render-report.mjs <id>
import fs from "node:fs";
import path from "node:path";
import { EVAL } from "./lib/registry.mjs";
import { renderReport } from "./lib/render.mjs";
const id = process.argv[2] ?? "baseline-v0";
const r = JSON.parse(fs.readFileSync(path.join(EVAL, "reports", id + ".json"), "utf8"));
fs.writeFileSync(path.join(EVAL, "reports", id + ".md"), renderReport(r));
console.log(`rendered reports/${id}.md`);
