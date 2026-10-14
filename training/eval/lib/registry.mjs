// Loads the dataset registry and checks it against the lock, so the evaluation set cannot change silently.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const EVAL = path.join(ROOT, "training/eval");

export const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
export const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));

export function loadRegistry() {
  return readJSON("training/eval/datasets.json");
}

/** Every small file the evaluation depends on. Videos are fingerprinted by size, not hashed (about 3 GB). */
export function lockedFiles(reg = loadRegistry()) {
  const files = new Set(["training/eval/datasets.json", "training/eval/thresholds.json"]);
  for (const c of reg.clips) {
    if (c.truth?.file) files.add(c.truth.file);
    for (const f of Object.values(c.detections ?? {})) if (typeof f === "string" && fs.existsSync(path.join(ROOT, f))) files.add(f);
  }
  for (const f of ["training/eval/annotate/manifest.json", "training/eval/annotate/annotations.json"]) if (fs.existsSync(path.join(ROOT, f))) files.add(f);
  files.add("public/models/ball-6.onnx");
  return [...files].sort();
}

export function makeLock(reg = loadRegistry()) {
  const files = {};
  for (const f of lockedFiles(reg)) files[f] = sha256(path.join(ROOT, f));
  const videos = {};
  for (const c of reg.clips) {
    const p = path.join(ROOT, c.file);
    if (fs.existsSync(p)) videos[c.id] = { bytes: fs.statSync(p).size };
  }
  return { locked: new Date().toISOString().slice(0, 10), files, videos };
}

/** Returns a list of problems; empty means the evaluation set is exactly what was locked. */
export function verifyLock(reg = loadRegistry()) {
  const lockPath = path.join(EVAL, "datasets.lock.json");
  if (!fs.existsSync(lockPath)) return ["datasets.lock.json is missing: run node training/eval/lock.mjs"];
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  const problems = [];
  for (const [f, h] of Object.entries(lock.files)) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) problems.push(`missing: ${f}`);
    else if (sha256(p) !== h) problems.push(`changed since lock: ${f}`);
  }
  for (const f of lockedFiles(reg)) if (!(f in lock.files)) problems.push(`not in lock (new file): ${f}`);
  for (const [id, v] of Object.entries(lock.videos ?? {})) {
    const c = reg.clips.find((x) => x.id === id);
    const p = c && path.join(ROOT, c.file);
    if (p && fs.existsSync(p) && fs.statSync(p).size !== v.bytes) problems.push(`video size changed: ${id}`);
  }
  return problems;
}
