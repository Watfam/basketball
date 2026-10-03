// Random hoop windows from a clip with a model's detections drawn on, for counting by eye how many
// visible balls were found and how many were missed. Detections come from 17-review-detections.mjs.
//
// The model is run on the very frame that is drawn, so boxes and pictures always agree.
//
//   MODEL=<onnx> node 18-recall-sheets.mjs <video> <cropX> <cropY> <how many> <seed> <out dir> [min score=0.25]
import * as ort from "onnxruntime-web";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import jpeg from "jpeg-js";
import { preprocess, decode } from "../work/yolox.mjs";

const [, , VIDEO, CX, CY, N, SEED, OUTDIR, MINARG = "0.25"] = process.argv;
const SIZE = 416, TILE = 250, COLS = 6, PER = 24;
ort.env.wasm.numThreads = 1;
const session = await ort.InferenceSession.create(new Uint8Array(fs.readFileSync(process.env.MODEL)), { executionProviders: ["wasm"] });
const byT = new Map();
const dur = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", VIDEO]).stdout.toString());
let seed = Number(SEED); const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const secs = new Set(); while (secs.size < Number(N)) secs.add(2 + Math.floor(rand() * (Math.floor(dur) - 4)));
const list = [...secs].sort((a, b) => a - b);
fs.mkdirSync(OUTDIR, { recursive: true });

const grab = t => spawnSync("ffmpeg", ["-nostdin", "-loglevel", "error", "-ss", String(t), "-i", VIDEO, "-an", "-frames:v", "1", "-vf", `crop=${SIZE}:${SIZE}:${CX}:${CY}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 26 }).stdout;
for (let s = 0; s * PER < list.length; s++) {
  const part = list.slice(s * PER, (s + 1) * PER), rows = Math.ceil(part.length / COLS), W = COLS * TILE, H = rows * TILE, buf = Buffer.alloc(W * H * 4, 40);
  for (const [k, t] of part.entries()) {
    const px = grab(t);
    const rgba = new Uint8ClampedArray(SIZE * SIZE * 4);
    for (let p = 0, q = 0; p < px.length; p += 3, q += 4) { rgba[q] = px[p]; rgba[q + 1] = px[p + 1]; rgba[q + 2] = px[p + 2]; rgba[q + 3] = 255; }
    const img = { width: SIZE, height: SIZE, data: rgba }, { tensor, letterbox } = preprocess(img, SIZE);
    const o = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", tensor, [1, 3, SIZE, SIZE]) });
    byT.set(t, decode(o[session.outputNames[0]].data, 1, SIZE, letterbox, img, { scoreThreshold: Number(MINARG), classes: [0] }).map(d => ({ box: [d.x1, d.y1, d.x2, d.y2], score: d.score })));
    const ox = (k % COLS) * TILE, oy = Math.floor(k / COLS) * TILE, sc = TILE / SIZE;
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const q = (Math.floor(y / sc) * SIZE + Math.floor(x / sc)) * 3, d = ((oy + y) * W + ox + x) * 4; buf[d] = px[q]; buf[d + 1] = px[q + 1]; buf[d + 2] = px[q + 2]; buf[d + 3] = 255; }
    const dot = (x, y) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < TILE && y >= 0 && y < TILE) { const d = ((oy + y) * W + ox + x) * 4; buf[d] = 0; buf[d + 1] = 255; buf[d + 2] = 0; } };
    for (const dt of byT.get(t) || []) { const [x1, y1, x2, y2] = dt.box.map(v => v * sc); for (let x = x1; x <= x2; x++) { dot(x, y1); dot(x, y2); } for (let y = y1; y <= y2; y++) { dot(x1, y); dot(x2, y); } }
    for (let m = 0; m <= k % COLS; m++) for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) { const d = ((oy + 2 + yy) * W + ox + 2 + m * 7 + xx) * 4; buf[d] = 255; buf[d + 1] = 255; buf[d + 2] = 255; }
  }
  const name = `recall-${String(s + 1).padStart(2, "0")}`;
  fs.writeFileSync(`${OUTDIR}/${name}.jpg`, jpeg.encode({ data: buf, width: W, height: H }, 90).data);
  fs.writeFileSync(`${OUTDIR}/${name}.txt`, part.map((t, k) => `${k + 1}\t${Math.floor(k / COLS) + 1},${(k % COLS) + 1}\t${t}s\t${(byT.get(t) || []).length ? "boxed" : "no box"}`).join("\n"));
}
console.log(list.length, "windows ->", Math.ceil(list.length / PER), "sheets in", OUTDIR);
