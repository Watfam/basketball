// "Not a ball" pictures of backboard shadows.
//
// Round three labelled the ball's SHADOW on the backboard as a ball. Those pictures also hold the real ball somewhere
// else in the 416 px window (high in the air), so as whole pictures they cannot be "no ball". Instead, each is cut down
// to a tight window around the shadow box, and the window is only used if the model finds no ball-sized box at a low
// threshold anywhere inside it other than the shadow itself and if no orange pixels of ball size are in it. The window is
// then scaled to 416 px like every other training picture, so the shadow appears at the size the model will see.
//
//   MODEL=<ball-3.onnx> node 27-shadow-negatives.mjs <old dataset dir> <cleaned dataset dir> <out dir> [crop px=150]
import * as ort from "onnxruntime-web";
import fs from "node:fs";
import jpeg from "jpeg-js";
import { preprocess, decode } from "../work/yolox.mjs";

const [, , OLD, CLEAN, OUT, CROPARG = "150"] = process.argv, CROP = Number(CROPARG), n = 416, SOURCES = new Set(["4831", "4835", "4836"]);
ort.env.wasm.numThreads = 1;
const session = await ort.InferenceSession.create(new Uint8Array(fs.readFileSync(process.env.MODEL)), { executionProviders: ["wasm"] });
const mean = (px, x1, y1, x2, y2) => { let c = 0, sr = 0, sg = 0, sb = 0; for (let y = Math.max(0, Math.round(y1 + (y2 - y1) * 0.25)); y < Math.min(n, Math.round(y1 + (y2 - y1) * 0.75)); y++) for (let x = Math.max(0, Math.round(x1 + (x2 - x1) * 0.25)); x < Math.min(n, Math.round(x1 + (x2 - x1) * 0.75)); x++) { const q = (y * n + x) * 4; sr += px.data[q]; sg += px.data[q + 1]; sb += px.data[q + 2]; c++; } return c ? [sr / c, sg / c, sb / c] : [0, 0, 0]; };
const dark = ([r, g, b]) => (r * 77 + g * 150 + b * 29) / 256 < 85 && r < 1.45 * b + 10;

const cleanIds = new Set();
for (const s of ["train", "val", "test"]) for (const im of JSON.parse(fs.readFileSync(`${CLEAN}/${s}.json`, "utf8")).images) cleanIds.add(im.file_name);
for (const s of ["train", "val", "test"]) fs.mkdirSync(`${OUT}/${s}`, { recursive: true });

function crop(px, cx, cy) {
  const sx = Math.max(0, Math.min(n - CROP, Math.round(cx - CROP / 2))), sy = Math.max(0, Math.min(n - CROP, Math.round(cy - CROP / 2))), k = CROP / n, out = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const fx = sx + (x + 0.5) * k - 0.5, fy = sy + (y + 0.5) * k - 0.5, x0 = Math.max(0, Math.min(n - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(n - 1, Math.floor(fy))), x1 = Math.min(n - 1, x0 + 1), y1 = Math.min(n - 1, y0 + 1);
    const ax = Math.min(1, Math.max(0, fx - x0)), ay = Math.min(1, Math.max(0, fy - y0)), o = (y * n + x) * 4;
    for (let c = 0; c < 3; c++) { const p = (xx, yy) => px.data[(yy * n + xx) * 4 + c]; out[o + c] = p(x0, y0) * (1 - ax) * (1 - ay) + p(x1, y0) * ax * (1 - ay) + p(x0, y1) * (1 - ax) * ay + p(x1, y1) * ax * ay; }
    out[o + 3] = 255;
  }
  return out;
}
const hasOrange = d => { let c = 0; for (let i = 0; i < n * n; i++) { const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2]; if (r > 105 && g < 0.66 * r && b < 0.52 * r && r - g > 35) c++; } return c >= 150; };

let nextImg = 900000; const made = { train: [], val: [], test: [] }, stats = { shadowPictures: 0, used: 0, rejectedBall: 0, rejectedOrange: 0 };
for (const split of ["train", "val", "test"]) {
  const j = JSON.parse(fs.readFileSync(`${OLD}/${split}.json`, "utf8")), ann = new Map(j.annotations.map(a => [a.image_id, a]));
  for (const im of j.images) {
    const a = ann.get(im.id);
    if (!a || !SOURCES.has(im.source) || cleanIds.has(im.file_name)) continue;
    const px = jpeg.decode(fs.readFileSync(`${OLD}/${split}/${im.file_name}`), { useTArray: true }), [bx, by, bw, bh] = a.bbox;
    if (!dark(mean(px, bx, by, bx + bw, by + bh))) continue;
    stats.shadowPictures++;
    const data = crop(px, bx + bw / 2, by + bh / 2);
    if (hasOrange(data)) { stats.rejectedOrange++; continue; }
    // the model runs on the cropped, rescaled window: any ball-sized box other than the shadow means a ball is in it
    const frame = { width: n, height: n, data: new Uint8ClampedArray(data) }, { tensor, letterbox } = preprocess(frame, n);
    const o = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", tensor, [1, 3, n, n]) });
    const boxes = decode(o[session.outputNames[0]].data, 1, n, letterbox, frame, { scoreThreshold: 0.3, classes: [0] }).filter(d => {
      const px2 = { data }; return !dark(mean(px2, d.x1, d.y1, d.x2, d.y2));
    });
    if (boxes.length) { stats.rejectedBall++; continue; }
    const name = `shadow_${im.file_name}`, id = nextImg++;
    fs.writeFileSync(`${OUT}/${split}/${name}`, jpeg.encode({ data: Buffer.from(data), width: n, height: n }, 92).data);
    made[split].push({ id, file_name: name, width: n, height: n, source: `${im.source}s` }); stats.used++;
  }
}
for (const s of ["train", "val", "test"]) fs.writeFileSync(`${OUT}/${s}.json`, JSON.stringify({ images: made[s], annotations: [], categories: [{ id: 1, name: "ball" }] }));
console.log(JSON.stringify(stats), "per split:", JSON.stringify(Object.fromEntries(Object.entries(made).map(([k, v]) => [k, v.length]))));
