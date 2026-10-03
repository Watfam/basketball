// Runs a ball model over hoop windows of a clip and saves EVERY detection as a zoomed crop at the
// camera's native resolution, numbered, so each one can be judged by eye as ball / not a ball.
//
//   MODEL=<onnx> node 17-review-detections.mjs <video> <cropX> <cropY> <every n sec> <out dir> [min score=0.25]
//
// Needs training/work/yolox.mjs (the app's decoder) and onnxruntime-web.
import * as ort from "onnxruntime-web";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import jpeg from "jpeg-js";
import { preprocess, decode } from "../work/yolox.mjs";

const [, , VIDEO, CX, CY, EVERY, OUTDIR, MINARG = "0.25"] = process.argv;
const SIZE = 416, CROP = 100, TILE = 200, COLS = 6, PER = 30;
ort.env.wasm.numThreads = 1;
const session = await ort.InferenceSession.create(new Uint8Array(fs.readFileSync(process.env.MODEL)), { executionProviders: ["wasm"] });
fs.mkdirSync(OUTDIR, { recursive: true });

const r = spawnSync("ffmpeg", ["-nostdin", "-loglevel", "error", "-i", VIDEO, "-an", "-vf", `fps=1/${EVERY},crop=${SIZE}:${SIZE}:${CX}:${CY}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 30 });
const fb = SIZE * SIZE * 3, frames = [];
for (let i = 0; i + fb <= r.stdout.length; i += fb) frames.push(r.stdout.subarray(i, i + fb));

const found = [];
for (let i = 0; i < frames.length; i++) {
  const rgba = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let p = 0, q = 0; p < fb; p += 3, q += 4) { rgba[q] = frames[i][p]; rgba[q + 1] = frames[i][p + 1]; rgba[q + 2] = frames[i][p + 2]; rgba[q + 3] = 255; }
  const img = { width: SIZE, height: SIZE, data: rgba };
  const { tensor, letterbox } = preprocess(img, SIZE);
  const o = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", tensor, [1, 3, SIZE, SIZE]) });
  for (const d of decode(o[session.outputNames[0]].data, 1, SIZE, letterbox, img, { scoreThreshold: Number(MINARG), classes: [0] })) found.push({ t: i * Number(EVERY), frame: i, d });
}
console.log(`frames ${frames.length}, detections ${found.length}`);

for (let s = 0; s * PER < found.length; s++) {
  const part = found.slice(s * PER, (s + 1) * PER), rows = Math.ceil(part.length / COLS), W = COLS * TILE, H = rows * TILE, buf = Buffer.alloc(W * H * 4, 40);
  part.forEach((f, k) => {
    const cx = (f.d.x1 + f.d.x2) / 2, cy = (f.d.y1 + f.d.y2) / 2, sx = Math.max(0, Math.min(SIZE - CROP, Math.round(cx - CROP / 2))), sy = Math.max(0, Math.min(SIZE - CROP, Math.round(cy - CROP / 2))), sc = TILE / CROP;
    const ox = (k % COLS) * TILE, oy = Math.floor(k / COLS) * TILE, px = frames[f.frame];
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const q = ((sy + Math.floor(y / sc)) * SIZE + sx + Math.floor(x / sc)) * 3, d = ((oy + y) * W + ox + x) * 4; buf[d] = px[q]; buf[d + 1] = px[q + 1]; buf[d + 2] = px[q + 2]; buf[d + 3] = 255; }
    const x1 = (f.d.x1 - sx) * sc, y1 = (f.d.y1 - sy) * sc, x2 = (f.d.x2 - sx) * sc, y2 = (f.d.y2 - sy) * sc;
    const dot = (x, y) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < TILE && y >= 0 && y < TILE) { const d = ((oy + y) * W + ox + x) * 4; buf[d] = 0; buf[d + 1] = 255; buf[d + 2] = 0; } };
    for (let x = x1; x <= x2; x++) { dot(x, y1); dot(x, y2); } for (let y = y1; y <= y2; y++) { dot(x1, y); dot(x2, y); }
    for (let m = 0; m <= k % COLS; m++) for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) { const d = ((oy + 2 + yy) * W + ox + 2 + m * 7 + xx) * 4; buf[d] = 255; buf[d + 1] = 255; buf[d + 2] = 255; }
  });
  const name = `det-${String(s + 1).padStart(2, "0")}`;
  fs.writeFileSync(`${OUTDIR}/${name}.jpg`, jpeg.encode({ data: buf, width: W, height: H }, 88).data);
  fs.writeFileSync(`${OUTDIR}/${name}.txt`, part.map((f, k) => `${k + 1}\t${Math.floor(k / COLS) + 1},${(k % COLS) + 1}\t${f.t}s\tscore ${f.d.score.toFixed(2)}`).join("\n"));
}
fs.writeFileSync(`${OUTDIR}/detections.json`, JSON.stringify(found.map(f => ({ t: f.t, score: +f.d.score.toFixed(3), box: [f.d.x1, f.d.y1, f.d.x2, f.d.y2].map(v => +v.toFixed(1)) }))));
