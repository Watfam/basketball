// Scores a clip with the app's own counting core (hoop window, auto size, rules V2/V3, worth-a-look flag) against
// Matt's written list.
//
//   node training/tools/41-run.mjs <dets.json> <truth.json> <rimNativeX> <rimNativeY> <auto|fixed> [scale=1]
//   node training/tools/41-run.mjs --segments <truth.json> <dets.json:rimX:rimY:scale:fromSec:toSec> [...]   (camera moved mid-clip:
//   each segment is counted with its own window and keeps only the shots first seen in its time range; auto sizing on)
//
// <dets.json> comes from tools/22 and its window must be the one the core cuts at that scale (checked here).
// Counted shots are matched to the list 1 to 1 in order when the numbers agree, otherwise by alignment (said so).
import fs from "node:fs";
import { createCountingCore } from "../../src/lib/vision/counting.ts";
import { REFERENCE_FPS, type ShotCall } from "../../src/lib/vision/shotRules.ts";

const segMode = process.argv[2] === "--segments";
const truth = process.argv[2] === "-" ? [] : (JSON.parse(fs.readFileSync(process.argv[3], "utf8")) as { results: string[] }).results;

type Dets = { cropX: number; cropY: number; cropSize?: number; frames: number; detections: { f: number; x1: number; y1: number; x2: number; y2: number }[] };

function countClip(detsFile: string, rimX: number, rimY: number, mode: string, scale: number, fromMs: number, toMs: number): ShotCall[] {
  const d = JSON.parse(fs.readFileSync(detsFile, "utf8")) as Dets;
  const core = createCountingCore({ frameW: 1920, frameH: 1080, rim: { x: rimX / 1920, y: rimY / 1080 }, scale, autoSize: mode === "auto" });
  if (core.window.crop.sx !== d.cropX || core.window.crop.sy !== d.cropY || (d.cropSize ?? 416) !== core.window.crop.sw) {
    console.error(`window mismatch: core cuts (${core.window.crop.sx}, ${core.window.crop.sy}, ${core.window.crop.sw}), detections were made at (${d.cropX}, ${d.cropY}, ${d.cropSize ?? 416})`);
    process.exit(1);
  }
  const byFrame = new Map<number, Dets["detections"]>();
  for (const x of d.detections) byFrame.set(x.f, [...(byFrame.get(x.f) ?? []), x]);
  const calls: ShotCall[] = [];
  for (let f = 0; f < d.frames; f += 1) {
    const r = core.push((f * 1000) / REFERENCE_FPS, byFrame.get(f) ?? []);
    if (r.windowChanged) console.error(`window changed at frame ${f}: scale now ${core.scale}`);
    calls.push(...r.calls);
  }
  calls.push(...core.flush());
  console.log(`${detsFile.split("/").pop()}: sizing ${JSON.stringify(core.sizing)}; scale ${core.scale}`);
  return calls.filter((c) => c.counted && c.firstMs >= fromMs && c.firstMs < toMs);
}

let shots: ShotCall[] = [];
if (segMode) {
  for (const seg of process.argv.slice(4)) {
    const [file, rx, ry, sc, from, to] = seg.split(":");
    shots.push(...countClip(file, Number(rx), Number(ry), "auto", Number(sc), Number(from) * 1000, Number(to) * 1000));
  }
  shots.sort((a, b) => a.firstMs - b.firstMs);
  shots.forEach((c, i) => (c.n = i + 1));
} else {
  const [, , DETS, , RX, RY, MODE, SCALE = "1"] = process.argv;
  if (DETS === "-") {
    const w = createCountingCore({ frameW: 1920, frameH: 1080, rim: { x: Number(RX) / 1920, y: Number(RY) / 1080 }, scale: Number(SCALE), autoSize: false }).window;
    console.log(JSON.stringify(w));
    process.exit(0);
  }
  shots = countClip(DETS, Number(RX), Number(RY), MODE, Number(SCALE), 0, Infinity);
}
console.log(`${shots.length} counted shots, ${truth.length} written`);

type Row = { c: ShotCall; t: string };
let pairs: Row[] = [];
let how = "1 to 1 in order";
if (shots.length === truth.length) pairs = shots.map((c, i) => ({ c, t: truth[i] }));
else {
  how = `alignment by V2 agreement (${shots.length} counted, ${truth.length} written), flatters the rule`;
  const N = shots.length, M = truth.length, NEG = -1e9;
  const dp = Array.from({ length: N + 1 }, () => Array(M + 1).fill(NEG));
  const bk: ([number, number, string] | null)[][] = Array.from({ length: N + 1 }, () => Array(M + 1).fill(null));
  dp[0][0] = 0;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= M; j++) {
    const v = dp[i][j];
    if (v === NEG) continue;
    if (i < N && v - 1 > dp[i + 1][j]) { dp[i + 1][j] = v - 1; bk[i + 1][j] = [i, j, "skip"]; }
    if (j < M && v - 2 > dp[i][j + 1]) { dp[i][j + 1] = v - 2; bk[i][j + 1] = [i, j, "unseen"]; }
    if (i < N && j < M) {
      const s = shots[i].v2 === truth[j] ? 1 : -1;
      if (v + s > dp[i + 1][j + 1]) { dp[i + 1][j + 1] = v + s; bk[i + 1][j + 1] = [i, j, "match"]; }
    }
  }
  let i = N, j = M;
  const path: [number, number, string][] = [];
  while (i || j) { const b = bk[i][j] as [number, number, string]; path.push(b); i = b[0]; j = b[1]; }
  path.reverse();
  pairs = path.filter((p) => p[2] === "match").map((p) => ({ c: shots[p[0]], t: truth[p[1]] }));
  console.log("extra candidates (skipped):", path.filter((p) => p[2] === "skip").map((p) => `#${p[0] + 1} at ${(shots[p[0]].firstMs / 1000).toFixed(1)}s`).join(", ") || "none");
  console.log("written shots never seen:", path.filter((p) => p[2] === "unseen").map((p) => `#${p[1] + 1}`).join(", ") || "none");
}
console.log("alignment:", how);
console.log("cand   time   V1    V2    V3    flag  fall   written");
const tally = { v1: 0, v2: 0, v3: 0 };
let wrongV2 = 0, caughtV2 = 0, flagged = 0;
for (const { c, t } of pairs) {
  tally.v1 += c.v1 === t ? 1 : 0; tally.v2 += c.v2 === t ? 1 : 0; tally.v3 += c.v3 === t ? 1 : 0;
  if (c.flagged) flagged += 1;
  if (c.v2 !== t) { wrongV2 += 1; if (c.flagged) caughtV2 += 1; }
  const mark = c.v2 === t && c.v3 === t ? "" : c.v2 !== t && c.v3 === t ? "  <- V2 wrong, V3 right" : c.v2 === t && c.v3 !== t ? "  <- V3 wrong, V2 right" : "  <- both wrong";
  console.log(`${String(c.n).padStart(3)}  ${(c.firstMs / 1000).toFixed(1).padStart(6)}s  ${c.v1.padEnd(5)} ${c.v2.padEnd(5)} ${c.v3.padEnd(5)} ${c.flagged ? "FLAG " : "     "} ${c.fall === null ? "  -  " : c.fall.toFixed(1).padStart(5)}  ${t}${mark}`);
}
const n = pairs.length, pc = (x: number) => `${x} of ${n} (${Math.round((100 * x) / n)}%)`;
console.log(`\nV1 ${pc(tally.v1)}; V2 ${pc(tally.v2)}; V3 ${pc(tally.v3)}`);
console.log(`flag: ${flagged} of ${n} shots flagged (${Math.round((100 * flagged) / n)}%), catching ${caughtV2} of ${wrongV2} wrong V2 calls`);
for (const k of ["v1", "v2", "v3"] as const) {
  const m = shots.filter((c) => c[k] === "make").length;
  console.log(`${k} totals: ${m} makes, ${shots.length - m} misses (written ${truth.filter((x) => x === "make").length} / ${truth.filter((x) => x === "miss").length})`);
}
