// Contact sheets of the labelled ball boxes that cover a dark, non-orange blob (a real black ball, a backlit ball,
// or a SHADOW on the backboard), so each can be sorted by eye. Tile n is entry n in the .txt file.
//   node 24-dark-boxes.mjs <dataset dir> <source id> <out dir>
import fs from "node:fs"; import jpeg from "jpeg-js";
const [, , D, SRC, OUTDIR] = process.argv, COLS = 6, TILE = 210, PER = 24;
fs.mkdirSync(OUTDIR, { recursive: true });
const items = [];
for (const split of ["train", "val", "test"]) {
  const j = JSON.parse(fs.readFileSync(`${D}/${split}.json`, "utf8")), img = new Map(j.images.map(i => [i.id, i]));
  for (const a of j.annotations) {
    const im = img.get(a.image_id); if (im.source !== SRC) continue;
    const px = jpeg.decode(fs.readFileSync(`${D}/${split}/${im.file_name}`), { useTArray: true }), [bx, by, bw, bh] = a.bbox; let n = 0, sr = 0, sg = 0, sb = 0;
    for (let y = Math.max(0, Math.round(by + bh * 0.25)); y < Math.min(416, Math.round(by + bh * 0.75)); y++) for (let x = Math.max(0, Math.round(bx + bw * 0.25)); x < Math.min(416, Math.round(bx + bw * 0.75)); x++) { const q = (y * 416 + x) * 4; sr += px.data[q]; sg += px.data[q + 1]; sb += px.data[q + 2]; n++; }
    if (!n) continue; const r = sr / n, g = sg / n, b = sb / n, luma = (r * 77 + g * 150 + b * 29) / 256;
    if (luma < 85 && r < 1.45 * b + 10) items.push({ split, im, a, px });
  }
}
for (let s = 0; s * PER < items.length; s++) {
  const part = items.slice(s * PER, (s + 1) * PER), rows = Math.ceil(part.length / COLS), W = COLS * TILE, H = rows * TILE, buf = Buffer.alloc(W * H * 4, 30);
  part.forEach(({ px, a }, k) => {
    const ox = (k % COLS) * TILE, oy = Math.floor(k / COLS) * TILE, sc = 416 / TILE;
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const q = ((Math.floor(y * sc)) * 416 + Math.floor(x * sc)) * 4, d = ((oy + y) * W + ox + x) * 4; buf[d] = px.data[q]; buf[d + 1] = px.data[q + 1]; buf[d + 2] = px.data[q + 2]; buf[d + 3] = 255; }
    const [bx, by, bw, bh] = a.bbox, x1 = Math.round(bx / sc) - 1, y1 = Math.round(by / sc) - 1, x2 = Math.round((bx + bw) / sc) + 1, y2 = Math.round((by + bh) / sc) + 1;
    const dot = (x, y) => { if (x >= 0 && x < TILE && y >= 0 && y < TILE) { const d = ((oy + y) * W + ox + x) * 4; buf[d] = 0; buf[d + 1] = 255; buf[d + 2] = 0; } };
    for (let x = x1; x <= x2; x++) { dot(x, y1); dot(x, y2); } for (let y = y1; y <= y2; y++) { dot(x1, y); dot(x2, y); }
    for (let m = 0; m <= k % COLS; m++) for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) { const d = ((oy + 2 + yy) * W + ox + 2 + m * 7 + xx) * 4; buf[d] = 255; buf[d + 1] = 255; buf[d + 2] = 255; }
  });
  const name = `dark-${SRC}-${String(s + 1).padStart(2, "0")}`;
  fs.writeFileSync(`${OUTDIR}/${name}.jpg`, jpeg.encode({ data: buf, width: W, height: H }, 90).data);
  fs.writeFileSync(`${OUTDIR}/${name}.txt`, part.map(({ split, im }, k) => `${k + 1}\t${Math.floor(k / COLS) + 1},${(k % COLS) + 1}\t${split}/${im.file_name}`).join("\n"));
}
console.log(items.length, "dark boxes ->", Math.ceil(items.length / PER), "sheets in", OUTDIR);
