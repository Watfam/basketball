// Writes datasets.lock.json: hashes of the registry, thresholds, truth lists, detections, annotations and model.
// Run it deliberately, after reviewing a change to any of them; the harness refuses to run against a stale lock.
//   node training/eval/lock.mjs
import fs from "node:fs";
import path from "node:path";
import { EVAL, makeLock } from "./lib/registry.mjs";
const lock = makeLock();
fs.writeFileSync(path.join(EVAL, "datasets.lock.json"), JSON.stringify(lock, null, 2) + "\n");
console.log(`locked ${Object.keys(lock.files).length} files, ${Object.keys(lock.videos).length} videos`);
