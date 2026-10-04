// Round-four cleanup of a merged dataset (round three, BEFORE its second-ball filter).
//
//  1. Shadow boxes out: in IMG_4831 / 4835 / 4836 any ball box that covers a dark, non-orange blob is dropped with its
//     picture (those were mostly the ball's shadow on the backboard; Matt, 2026-10-04). IMG_4825's dark boxes are
//     backlit real balls and stay.
//  2. Second-ball filter redone by colour: a picture is dropped when the model finds ANOTHER ball-sized box that is
//     ORANGE. A dark second box is a shadow (or the black ball's shadow) and no longer counts, so the roughly 150 good
//     pictures the old filter threw away are kept.
//
//   MODEL=<ball-3.onnx> node 25-clean-round4.mjs <dataset dir> <out dir> [low threshold=0.15]
import * as ort from "onnxruntime-web";
import fs from "node:fs";
import jpeg from "jpeg-js";
import { preprocess, decode } from "../work/yolox.mjs";

const [, , SRC, OUT, LOWARG = "0.15"] = process.argv, LOW = Number(LOWARG), n = 416;
const DARK_SOURCES = new Set(["4831", "4835", "4836"]), FILTER_SOURCES = new Set(["4831", "4835", "4836", "4825"]);
ort.env.wasm.numThreads = 1;
const session = await ort.InferenceSession.create(new Uint8Array(fs.readFileSync(process.env.MODEL)), { executionProviders: ["wasm"] });
const iou = (a, b) => { const iw = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])), ih = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1])), i = iw * ih; return i / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i + 1e-9); };
// mean colour of the middle of a box; dark and not red-dominant = shadow-like
function isDark(px, x1, y1, x2, y2) {
  let c = 0, sr = 0, sg = 0, sb = 0;
  for (let y = Math.max(0, Math.round(y1 + (y2 - y1) * 0.25)); y < Math.min(n, Math.round(y1 + (y2 - y1) * 0.75)); y++) for (let x = Math.max(0, Math.round(x1 + (x2 - x1) * 0.25)); x < Math.min(n, Math.round(x1 + (x2 - x1) * 0.75)); x++) { const q = (y * n + x) * 4; sr += px.data[q]; sg += px.data[q + 1]; sb += px.data[q + 2]; c++; }
  if (!c) return false; const r = sr / c, g = sg / c, b = sb / c;
  return (r * 77 + g * 150 + b * 29) / 256 < 85 && r < 1.45 * b + 10;
}

for (const s of ["train", "val", "test"]) fs.mkdirSync(`${OUT}/${s}`, { recursive: true });
const dropped = { shadow: {}, secondBall: {} }, kept = {};
for (const split of ["train", "val", "test"]) {
  const j = JSON.parse(fs.readFileSync(`${SRC}/${split}.json`, "utf8")), ann = new Map(j.annotations.map(a => [a.image_id, a])), images = [];
  for (const im of j.images) {
    const a = ann.get(im.id); let why = null;
    if (a && FILTER_SOURCES.has(im.source)) {
      const px = jpeg.decode(fs.readFileSync(`${SRC}/${split}/${im.file_name}`), { useTArray: true }), [bx, by, bw, bh] = a.bbox;
      if (DARK_SOURCES.has(im.source) && isDark(px, bx, by, bx + bw, by + bh)) why = "shadow";
      else {
        const frame = { width: n, height: n, data: new Uint8ClampedArray(px.data) }, { tensor, letterbox } = preprocess(frame, n);
        const o = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", tensor, [1, 3, n, n]) });
        const mine = [bx, by, bx + bw, by + bh];
        const second = decode(o[session.outputNames[0]].data, 1, n, letterbox, frame, { scoreThreshold: LOW, classes: [0] }).some(d => {
          const w = d.x2 - d.x1, h = d.y2 - d.y1;
          return iou([d.x1, d.y1, d.x2, d.y2], mine) < 0.1 && w >= 8 && w <= 70 && h >= 8 && h <= 70 && w / h < 1.8 && h / w < 1.8 && !isDark(px, d.x1, d.y1, d.x2, d.y2);
        });
        if (second) why = "secondBall";
      }
    }
    if (why) { dropped[why][im.source] = (dropped[why][im.source] || 0) + 1; continue; }
    kept[im.source] = (kept[im.source] || 0) + 1;
    const dst = `${OUT}/${split}/${im.file_name}`; if (!fs.existsSync(dst)) fs.linkSync(`${SRC}/${split}/${im.file_name}`, dst);
    images.push(im);
  }
  const ids = new Set(images.map(i => i.id));
  fs.writeFileSync(`${OUT}/${split}.json`, JSON.stringify({ images, annotations: j.annotations.filter(a => ids.has(a.image_id)), categories: j.categories }));
}
console.log("dropped, shadow boxes:", JSON.stringify(dropped.shadow));
console.log("dropped, another ORANGE ball in the picture:", JSON.stringify(dropped.secondBall));
console.log("kept:", JSON.stringify(kept));
console.log("DONE");
