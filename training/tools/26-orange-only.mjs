// Second pass for the clips where the ball's shadow got boxed (IMG_4831, 4835, 4836): keep a ball picture only if the
// middle of its box is clearly ORANGE (red well above blue and clearly above green). Shadows and black balls fail.
// The black ball loses its few real boxes; it needs its own clip. Other sources are copied unchanged.
//
//   node 26-orange-only.mjs <dataset dir> <out dir>
import fs from "node:fs";
import jpeg from "jpeg-js";

const [, , SRC, OUT] = process.argv, n = 416, CHECK = new Set(["4831", "4835", "4836"]);
function orange(px, x1, y1, x2, y2) {
  let c = 0, sr = 0, sg = 0, sb = 0;
  for (let y = Math.max(0, Math.round(y1 + (y2 - y1) * 0.25)); y < Math.min(n, Math.round(y1 + (y2 - y1) * 0.75)); y++)
    for (let x = Math.max(0, Math.round(x1 + (x2 - x1) * 0.25)); x < Math.min(n, Math.round(x1 + (x2 - x1) * 0.75)); x++) { const q = (y * n + x) * 4; sr += px.data[q]; sg += px.data[q + 1]; sb += px.data[q + 2]; c++; }
  if (!c) return false; const r = sr / c, g = sg / c, b = sb / c;
  return r >= 95 && r > 1.5 * b && r > 1.2 * g;
}
for (const s of ["train", "val", "test"]) fs.mkdirSync(`${OUT}/${s}`, { recursive: true });
const dropped = {}, kept = {};
for (const split of ["train", "val", "test"]) {
  const j = JSON.parse(fs.readFileSync(`${SRC}/${split}.json`, "utf8")), ann = new Map(j.annotations.map(a => [a.image_id, a])), images = [];
  for (const im of j.images) {
    const a = ann.get(im.id);
    if (a && CHECK.has(im.source)) {
      const px = jpeg.decode(fs.readFileSync(`${SRC}/${split}/${im.file_name}`), { useTArray: true }), [bx, by, bw, bh] = a.bbox;
      if (!orange(px, bx, by, bx + bw, by + bh)) { dropped[im.source] = (dropped[im.source] || 0) + 1; continue; }
    }
    kept[im.source] = (kept[im.source] || 0) + 1;
    const dst = `${OUT}/${split}/${im.file_name}`; if (!fs.existsSync(dst)) fs.linkSync(`${SRC}/${split}/${im.file_name}`, dst);
    images.push(im);
  }
  const ids = new Set(images.map(i => i.id));
  fs.writeFileSync(`${OUT}/${split}.json`, JSON.stringify({ images, annotations: j.annotations.filter(a => ids.has(a.image_id)), categories: j.categories }));
}
console.log("dropped (not clearly orange):", JSON.stringify(dropped));
console.log("kept:", JSON.stringify(kept));
