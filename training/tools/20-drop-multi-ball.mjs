// Drops round-three ball pictures that probably hold a second, unboxed ball.
// For every ball picture the round-two model is run on the same picture at a LOW threshold; if it finds
// another box that is not the labelled one (little overlap, ball-sized), that picture is dropped, because
// the unboxed ball would be taught as background. Ball pictures from sources listed in ONLY are checked;
// everything else is copied unchanged.
//
//   MODEL=<ball-2.onnx> node 20-drop-multi-ball.mjs <dataset dir> <out dir> <sources, comma separated> [low threshold=0.15]
import * as ort from "onnxruntime-web";
import fs from "node:fs";
import jpeg from "jpeg-js";
import { preprocess, decode } from "../work/yolox.mjs";

const [, , SRC, OUT, ONLY, LOWARG = "0.15"] = process.argv;
const sources = new Set(ONLY.split(",")), LOW = Number(LOWARG), n = 416;
ort.env.wasm.numThreads = 1;
const session = await ort.InferenceSession.create(new Uint8Array(fs.readFileSync(process.env.MODEL)), { executionProviders: ["wasm"] });
const iou = (a, b) => { const iw = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])), ih = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1])), i = iw * ih; return i / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i + 1e-9); };

for (const s of ["train", "val", "test"]) fs.mkdirSync(`${OUT}/${s}`, { recursive: true });
const dropped = {}, kept = {};
for (const split of ["train", "val", "test"]) {
  const j = JSON.parse(fs.readFileSync(`${SRC}/${split}.json`, "utf8")), ann = new Map(j.annotations.map(a => [a.image_id, a])), images = [];
  for (const im of j.images) {
    const a = ann.get(im.id);
    let drop = false;
    if (a && sources.has(im.source)) {
      const px = jpeg.decode(fs.readFileSync(`${SRC}/${split}/${im.file_name}`), { useTArray: true }), frame = { width: n, height: n, data: new Uint8ClampedArray(px.data) };
      const { tensor, letterbox } = preprocess(frame, n);
      const o = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", tensor, [1, 3, n, n]) });
      const mine = [a.bbox[0], a.bbox[1], a.bbox[0] + a.bbox[2], a.bbox[1] + a.bbox[3]];
      drop = decode(o[session.outputNames[0]].data, 1, n, letterbox, frame, { scoreThreshold: LOW, classes: [0] }).some(d => {
        const w = d.x2 - d.x1, h = d.y2 - d.y1;
        return iou([d.x1, d.y1, d.x2, d.y2], mine) < 0.1 && w >= 8 && w <= 70 && h >= 8 && h <= 70 && w / h < 1.8 && h / w < 1.8;
      });
    }
    if (drop) { dropped[im.source] = (dropped[im.source] || 0) + 1; continue; }
    kept[im.source] = (kept[im.source] || 0) + 1;
    const dst = `${OUT}/${split}/${im.file_name}`;
    if (!fs.existsSync(dst)) fs.linkSync(`${SRC}/${split}/${im.file_name}`, dst);
    images.push(im);
  }
  const ids = new Set(images.map(i => i.id));
  fs.writeFileSync(`${OUT}/${split}.json`, JSON.stringify({ images, annotations: j.annotations.filter(a => ids.has(a.image_id)), categories: j.categories }));
}
console.log("dropped (another ball-like box found):", JSON.stringify(dropped));
console.log("kept:", JSON.stringify(kept));
