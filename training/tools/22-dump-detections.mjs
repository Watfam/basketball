// Runs a ball model on EVERY frame of a clip (in 30 s pieces, so memory stays small) and saves all
// detections to one JSON file: [{f, x1, y1, x2, y2, score}], coordinates inside the 416 px hoop window.
//
//   MODEL=<onnx> node 22-dump-detections.mjs <video> <cropX> <cropY> <out.json> [min score=0.2]
import * as ort from "onnxruntime-web";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { preprocess, decode } from "../work/yolox.mjs";

const [, , VIDEO, CX, CY, OUT, MINARG = "0.2"] = process.argv;
// SCALE (env, default 1): cut a window of 416 x SCALE camera pixels and shrink it to 416, as the app does for zoomed or distant setups.
const SCALE = Number(process.env.SCALE ?? 1), CUT = Math.round(416 * SCALE);
const SIZE = 416, PIECE = 30, FB = SIZE * SIZE * 3;
ort.env.wasm.numThreads = 1;
const session = await ort.InferenceSession.create(new Uint8Array(fs.readFileSync(process.env.MODEL)), { executionProviders: ["wasm"] });
const dur = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", VIDEO]).stdout.toString());
// START (env, seconds, default 0): skip the start of the clip; frame numbers still count from the clip start.
const START = Number(process.env.START ?? 0);
const out = []; let frameBase = Math.round((START * 30000) / 1001);
for (let s = START; s < dur; s += PIECE) {
  const r = spawnSync("ffmpeg", ["-nostdin", "-loglevel", "error", "-ss", String(s), "-t", String(PIECE), "-i", VIDEO, "-an", "-vf", `fps=30000/1001,crop=${CUT}:${CUT}:${CX}:${CY}${CUT === SIZE ? "" : `,scale=${SIZE}:${SIZE}`}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1024 * 1024 * 1024 });
  const n = Math.floor(r.stdout.length / FB);
  for (let i = 0; i < n; i++) {
    const px = r.stdout.subarray(i * FB, (i + 1) * FB), rgba = new Uint8ClampedArray(SIZE * SIZE * 4);
    for (let p = 0, q = 0; p < FB; p += 3, q += 4) { rgba[q] = px[p]; rgba[q + 1] = px[p + 1]; rgba[q + 2] = px[p + 2]; rgba[q + 3] = 255; }
    const img = { width: SIZE, height: SIZE, data: rgba }, { tensor, letterbox } = preprocess(img, SIZE);
    const o = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", tensor, [1, 3, SIZE, SIZE]) });
    for (const d of decode(o[session.outputNames[0]].data, 1, SIZE, letterbox, img, { scoreThreshold: Number(MINARG), classes: [0] }))
      out.push({ f: frameBase + i, x1: +d.x1.toFixed(1), y1: +d.y1.toFixed(1), x2: +d.x2.toFixed(1), y2: +d.y2.toFixed(1), score: +d.score.toFixed(3) });
  }
  frameBase += n;
  console.log(`piece ${s}-${s + PIECE}s, frames ${frameBase}, detections ${out.length}`);
}
fs.writeFileSync(OUT, JSON.stringify({ video: VIDEO, cropX: Number(CX), cropY: Number(CY), cropSize: CUT, size: SIZE, frames: frameBase, fps: 30000 / 1001, detections: out }));
console.log("DONE");
