// How the "worth a look" ring and the V4 calls react when the rim point is tapped a little off. The window is NOT moved, only the rim
// point the rules use (as when a finger taps a few px away from the real rim).
//   node 48-aim-shift.mjs <dets json> <truth json> <rimWinX> <rimWinY> <thin> <shift px> [<window frames offset>]
// Shots are matched to the written list by time against the same clip run with no shift (so the score is not flattered by re-aligning).
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const out = path.join(root, "training/work/aim48"); fs.mkdirSync(out, { recursive: true });
const src = fs.readFileSync(path.join(root, "src/lib/vision/shotRules.ts"), "utf8");
fs.writeFileSync(path.join(out, "shotRules.mjs"), ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
const { createShotCounter, REFERENCE_FPS } = await import(path.join(out, "shotRules.mjs"));
const [, , DETS, TRUTH, RX, RY, THIN, SHIFT] = process.argv;
const d = JSON.parse(fs.readFileSync(DETS, "utf8")), truth = JSON.parse(fs.readFileSync(TRUTH, "utf8")).results;
const by = new Map(); for (const q of d.detections) { if (!by.has(q.f)) by.set(q.f, []); by.get(q.f).push(q); }
function run(shift) {
  const c = createShotCounter({ x: Number(RX) + shift, y: Number(RY) });
  const calls = [];
  for (let f = 0; f < d.frames; f += 1) { if (f % Number(THIN) !== 0) continue; calls.push(...c.push((f * 1000) / REFERENCE_FPS, by.get(f) ?? [])); }
  calls.push(...c.flush());
  return calls.filter((x) => x.counted);
}
const ref = run(0), got = run(Number(SHIFT));
// truth for a shot: the written result of the unshifted shot nearest in time (the unshifted run matched 1-to-1 when the counts agree)
const label = (c) => { const i = ref.reduce((b, r, k) => (Math.abs(r.firstMs - c.firstMs) < Math.abs(ref[b].firstMs - c.firstMs) ? k : b), 0); return ref.length === truth.length && Math.abs(ref[i].firstMs - c.firstMs) < 1500 ? truth[i] : null; };
let right = 0, known = 0, ring = 0; const why = {};
for (const c of got) { const t = label(c); if (t) { known++; right += c.v4 === t ? 1 : 0; } if (c.flagged) { ring++; for (const r of c.flagReasons) why[r] = (why[r] ?? 0) + 1; } }
console.log(JSON.stringify({ shift: Number(SHIFT), shots: got.length, ring, ringPct: Math.round((100 * ring) / got.length), why, v4Right: right, matched: known }));
