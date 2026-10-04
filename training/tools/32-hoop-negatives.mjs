// "Nothing here" pictures of the net and rim, in the window the phone will cut around the hoop: the model fired on
// net and rim edge at small sizes, so it needs to see them with no ball. Frames come from the two clips where no
// ball is anywhere in view (IMG_4829 and the steady middle of IMG_4832). Each picture is a 416 px window centred near
// the rim with a little random shift and scale.
//
//   node 32-hoop-negatives.mjs <out dir> [per clip=180]
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import jpeg from "jpeg-js";

const [, , OUT, PERARG = "180"] = process.argv, PER = Number(PERARG), SIZE = 416, RS = 600;
const REPO = path.resolve(new URL("../..", import.meta.url).pathname), ROOT = `${REPO}/Training Video`;
let seed = 31337; const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
// rim in native pixels for each clip, and the seconds to draw from
const CLIPS = [
  { id: "4829", file: "IMG_4829.MOV", rim: [932, 360], from: 5, to: 130, fps: 30000 / 1001 },
  { id: "4832", file: "IMG_4832.MOV", rim: [1050, 350], from: 22, to: 115, fps: 30 },
];
function grab(c, t) {
  const r = spawnSync("ffmpeg", ["-nostdin", "-loglevel", "error", "-ss", String(t), "-i", `${ROOT}/${c.file}`, "-an", "-frames:v", "1", "-vf", `crop=${RS}:${RS}:${c.rim[0] - 300}:${c.rim[1] - 300}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 26 });
  return r.stdout.length >= RS * RS * 3 ? r.stdout : null;
}
function window(img, W, cx, cy) {
  const out = new Uint8Array(SIZE * SIZE * 4), sx = cx - W / 2, sy = cy - W / 2, k = W / SIZE;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const fx = sx + (x + 0.5) * k - 0.5, fy = sy + (y + 0.5) * k - 0.5, x0 = Math.max(0, Math.min(RS - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(RS - 1, Math.floor(fy))), x1 = Math.min(RS - 1, x0 + 1), y1 = Math.min(RS - 1, y0 + 1);
    const ax = Math.min(1, Math.max(0, fx - x0)), ay = Math.min(1, Math.max(0, fy - y0)), o = (y * SIZE + x) * 4;
    for (let c = 0; c < 3; c++) { const p = (xx, yy) => img[(yy * RS + xx) * 3 + c]; out[o + c] = p(x0, y0) * (1 - ax) * (1 - ay) + p(x1, y0) * ax * (1 - ay) + p(x0, y1) * (1 - ax) * ay + p(x1, y1) * ax * ay; }
    out[o + 3] = 255;
  }
  return out;
}
const made = { train: [], val: [], test: [] };
let id = 950000;
for (const c of CLIPS) {
  for (let i = 0; i < PER; i++) {
    const t = c.from + rand() * (c.to - c.from), img = grab(c, t); if (!img) continue;
    // tighter than the other pictures: in the far-away clips the hoop is small, in the kids clip it fills the window, so
    // zoom in to make the net and rim about the size the phone sees
    const W = Math.round(SIZE * (0.55 + rand() * 0.15)), cx = 300 + (rand() * 2 - 1) * 25, cy = 300 + (rand() * 2 - 1) * 25;
    // same time boundaries the dataset already uses for these clips, so no frame near a test frame is trained on
    const split = c.id === "4829" ? (t < 85 ? "train" : t < 110 ? "val" : "test") : (t < 85 ? "train" : t < 100 ? "val" : "test");
    fs.mkdirSync(`${OUT}/${split}`, { recursive: true });
    const name = `hoop_${c.id}_${Math.round(t * 100)}_${id}.jpg`;
    fs.writeFileSync(`${OUT}/${split}/${name}`, jpeg.encode({ data: Buffer.from(window(img, W, cx, cy)), width: SIZE, height: SIZE }, 92).data);
    made[split].push({ id: id++, file_name: name, width: SIZE, height: SIZE, source: `${c.id}h` });
  }
}
for (const s of ["train", "val", "test"]) { fs.mkdirSync(`${OUT}/${s}`, { recursive: true }); fs.writeFileSync(`${OUT}/${s}.json`, JSON.stringify({ images: made[s], annotations: [], categories: [{ id: 1, name: "ball" }] })); }
console.log("hoop pictures:", JSON.stringify(Object.fromEntries(Object.entries(made).map(([k, v]) => [k, v.length]))));
