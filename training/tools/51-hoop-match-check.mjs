// The app's hoop-matching module (src/lib/vision/hoop-match.ts) on real frames: the same pairs as tools/50, so the port can be compared with it.
//   node training/tools/51-hoop-match-check.mjs
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const out = path.join(root, "training/work/match51"); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "hoop-match.mjs"), ts.transpileModule(fs.readFileSync(path.join(root, "src/lib/vision/hoop-match.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
const { findHoop, MATCH_W, MATCH_H, MATCH_STRONG, MATCH_FAIR } = await import(path.join(out, "hoop-match.mjs"));
const CLIPS = {
  "4839": { video: "IMG_4839.MOV", rim: [1058, 450], scale: 1 }, "4840": { video: "IMG_4840.MOV", rim: [1058, 450], scale: 1 },
  "4867": { video: "IMG_4867.MOV", rim: [1018, 474], scale: 1 }, "4872": { video: "IMG_4872.MOV", rim: [1038, 462], scale: 1.18 },
  "4874": { video: "IMG_4874.MOV", rim: [1008, 520], scale: 1 }, "4851": { video: "IMG_4851.MOV", rim: [950, 413], scale: 1.27 },
  "4866": { video: "IMG_4866.MOV", rim: [801, 413], scale: 1.86 }, "4873": { video: "IMG_4873.MOV", rim: [1040, 508], scale: 1.94 },
};
const gray = (id, t) => new Uint8Array(spawnSync("ffmpeg", ["-nostdin", "-loglevel", "error", "-ss", String(t), "-i", `${root}/Training Video/${CLIPS[id].video}`, "-frames:v", "1", "-vf", `scale=${MATCH_W}:${MATCH_H}`, "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: 1 << 24 }).stdout);
const PAIRS = [["4839", "4840"], ["4839", "4867"], ["4839", "4872"], ["4839", "4874"], ["4867", "4874"], ["4867", "4872"], ["4874", "4872"], ["4839", "4851"], ["4839", "4866"], ["4839", "4873"]];
for (const [a, b] of PAIRS) {
  const A = CLIPS[a], B = CLIPS[b];
  const ref = { gray: gray(a, 25), rim: { x: A.rim[0] / 1920, y: A.rim[1] / 1080 }, scale: A.scale };
  const t0 = performance.now();
  const m = await findHoop(ref, gray(b, 70));
  const ms = Math.round(performance.now() - t0);
  const err = Math.hypot(m.rim.x * 1920 - B.rim[0], m.rim.y * 1080 - B.rim[1]) / B.scale;
  const verdict = m.score >= MATCH_STRONG ? "AUTO-START" : m.score >= MATCH_FAIR ? "ASK" : "AIM BY HAND";
  console.log(`${a} -> ${b}: score ${m.score.toFixed(2)} -> ${verdict.padEnd(11)} error ${err.toFixed(0).padStart(3)} window px  size x${m.sizeRatio.toFixed(2)}  ${ms} ms`);
}
