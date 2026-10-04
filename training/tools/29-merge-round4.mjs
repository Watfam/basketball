// Round-four dataset: the cleaned set (shadow boxes out, orange-only boxes, colour-based second-ball filter) plus
// shadow-only negatives. A shadow-negative picture is dropped if the model, run on it at a LOW threshold, finds a
// second dark round object far from the shadow-sized one (a real dark ball in the same crop).
//
//   MODEL=<ball-3.onnx> node 29-merge-round4.mjs <cleaned dataset> <shadow negatives dir> <out dir>
import * as ort from "onnxruntime-web";
import fs from "node:fs";
import jpeg from "jpeg-js";
import { preprocess, decode } from "../work/yolox.mjs";

const [, , CLEAN, SHADOW, OUT] = process.argv, n = 416;
ort.env.wasm.numThreads = 1;
const session = await ort.InferenceSession.create(new Uint8Array(fs.readFileSync(process.env.MODEL)), { executionProviders: ["wasm"] });
for (const s of ["train", "val", "test"]) fs.mkdirSync(`${OUT}/${s}`, { recursive: true });
const dropped = {};
const stats = {};
for (const split of ["train", "val", "test"]) {
  const base = JSON.parse(fs.readFileSync(`${CLEAN}/${split}.json`, "utf8")), sh = JSON.parse(fs.readFileSync(`${SHADOW}/${split}.json`, "utf8")), images = [...base.images];
  for (const im of base.images) { const dst = `${OUT}/${split}/${im.file_name}`; if (!fs.existsSync(dst)) fs.linkSync(`${CLEAN}/${split}/${im.file_name}`, dst); }
  for (const im of sh.images) {
    const px = jpeg.decode(fs.readFileSync(`${SHADOW}/${split}/${im.file_name}`), { useTArray: true }), frame = { width: n, height: n, data: new Uint8ClampedArray(px.data) };
    const { tensor, letterbox } = preprocess(frame, n);
    const o = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", tensor, [1, 3, n, n]) });
    const dets = decode(o[session.outputNames[0]].data, 1, n, letterbox, frame, { scoreThreshold: 0.1, classes: [0] }).filter(d => { const w = d.x2 - d.x1, h = d.y2 - d.y1; return w >= 20 && h >= 20 && w <= 90 && h <= 90; });
    // the shadow itself is usually the strongest dark round object; any further one at least 80 px away is a real ball
    dets.sort((a, b) => b.score - a.score);
    const first = dets[0], far = first && dets.slice(1).some(d => Math.hypot((d.x1 + d.x2 - first.x1 - first.x2) / 2, (d.y1 + d.y2 - first.y1 - first.y2) / 2) > 80);
    if (far) { dropped[split] = (dropped[split] || 0) + 1; continue; }
    const dst = `${OUT}/${split}/${im.file_name}`; fs.copyFileSync(`${SHADOW}/${split}/${im.file_name}`, dst); images.push(im);
  }
  fs.writeFileSync(`${OUT}/${split}.json`, JSON.stringify({ images, annotations: base.annotations, categories: base.categories }));
  const withBall = new Set(base.annotations.map(a => a.image_id));
  stats[split] = { pictures: images.length, ball: images.filter(i => withBall.has(i.id)).length, noBall: images.filter(i => !withBall.has(i.id)).length };
}
console.log("shadow pictures dropped (a second dark round object):", JSON.stringify(dropped));
console.log("final:", JSON.stringify(stats));
