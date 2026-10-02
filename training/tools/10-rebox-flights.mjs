// Replaces the motion tracker's rough boxes with the ball model's tighter ones, but only
// inside flights that were accepted by eye, and only where the model's box lands on the
// spot the tracker pointed at. Frames where the two disagree are dropped, not guessed.
//
//   node 10-rebox-flights.mjs <flights.json> <tracks.json> <video> <out.json>
//
// Needs training/work/yolox.mjs (the app's decoder, transpiled) and Training Video/ball.onnx.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import * as ort from "onnxruntime-web";
import { preprocess, decode } from "../work/yolox.mjs";

const [, , FLIGHTS, TRACKS, VIDEO, OUT] = process.argv;
const REPO = path.resolve(new URL("../..", import.meta.url).pathname);
const FPS = 30000 / 1001, SIZE = 416, RS = 600, RIM = [985, 370];
const NEAR = 28, MIN_SCORE = 0.3;

ort.env.wasm.numThreads = 1;
const session = await ort.InferenceSession.create(new Uint8Array(fs.readFileSync(`${REPO}/Training Video/ball.onnx`)), { executionProviders: ["wasm"] });

const flightInfo = JSON.parse(fs.readFileSync(FLIGHTS, "utf8"));
const T = JSON.parse(fs.readFileSync(TRACKS, "utf8"));
const accepted = new Set(flightInfo.accepted);

function decodeRun(startFrame, count) {
  const r = spawnSync("ffmpeg", ["-nostdin", "-loglevel", "error", "-ss", String(startFrame / FPS), "-i", VIDEO, "-an", "-vf", `fps=30000/1001,crop=${RS}:${RS}:${RIM[0] - 300}:${RIM[1] - 300}`, "-frames:v", String(count), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 30 });
  const fb = RS * RS * 3, out = [];
  for (let i = 0; i + fb <= r.stdout.length; i += fb) out.push(r.stdout.subarray(i, i + fb));
  return out;
}

const result = [];
const stats = { flights: 0, points: 0, kept: 0, noDetection: 0 };
for (let f = 0; f < T.tracks.length; f++) {
  const id = f + 1;
  if (!accepted.has(id)) continue;
  stats.flights++;
  const pts = T.tracks[f].pts, first = pts[0][0], last = pts[pts.length - 1][0];
  const imgs = decodeRun(first, last - first + 1);
  const kept = [];
  for (const p of pts) {
    stats.points++;
    const img = imgs[p[0] - first];
    if (!img) continue;
    // where the tracker says the ball is, in the 600x600 working window
    const gx = T.cropX + 2 * p[2] - (RIM[0] - 300), gy = T.cropY + 2 * p[3] - (RIM[1] - 300);
    const wx = Math.max(0, Math.min(RS - SIZE, Math.round(gx - SIZE / 2))), wy = Math.max(0, Math.min(RS - SIZE, Math.round(gy - SIZE / 2)));
    const rgba = new Uint8ClampedArray(SIZE * SIZE * 4);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const s = ((wy + y) * RS + wx + x) * 3, d = (y * SIZE + x) * 4;
      rgba[d] = img[s]; rgba[d + 1] = img[s + 1]; rgba[d + 2] = img[s + 2]; rgba[d + 3] = 255;
    }
    const frame = { width: SIZE, height: SIZE, data: rgba };
    const { tensor, letterbox } = preprocess(frame, SIZE);
    const o = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", tensor, [1, 3, SIZE, SIZE]) });
    const dets = decode(o[session.outputNames[0]].data, 1, SIZE, letterbox, frame, { scoreThreshold: MIN_SCORE, classes: [0] });
    let best = null, bestD = 1e9;
    for (const d of dets) {
      const cx = wx + (d.x1 + d.x2) / 2, cy = wy + (d.y1 + d.y2) / 2, w = d.x2 - d.x1, h = d.y2 - d.y1;
      const dist = Math.hypot(cx - gx, cy - gy);
      if (dist <= NEAR && w >= 10 && w <= 46 && h >= 10 && h <= 46 && w / h < 1.8 && h / w < 1.8 && dist < bestD) { best = { x1: wx + d.x1, y1: wy + d.y1, x2: wx + d.x2, y2: wy + d.y2, score: +d.score.toFixed(3) }; bestD = dist; }
    }
    if (best) { kept.push({ frame: p[0], box: best, tracker: [+gx.toFixed(1), +gy.toFixed(1), p[4] * 2 + 3, p[5] * 2 + 3] }); stats.kept++; } else stats.noDetection++;
  }
  result.push({ flight: id, firstFrame: first, lastFrame: last, points: pts.length, kept });
  if (stats.flights % 10 === 0) console.log(`flights ${stats.flights}, points ${stats.points}, kept ${stats.kept}`);
}
fs.writeFileSync(OUT, JSON.stringify({ rim: RIM, workWindow: RS, stats, flights: result }));
console.log("DONE", JSON.stringify(stats));
