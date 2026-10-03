// Numbered contact sheets for deciding by eye which dataset pictures to drop.
// Tile n on a sheet is entry n in the matching .txt file (row-major, 6 per row), and a thin
// white mark along the top edge of the tile counts its column so a tile can be named exactly.
//
//   node 13-review-sheets.mjs <dataset dir> <source id> <ball|noball> <out dir> [per sheet=30] [cell px=208]
import fs from "node:fs";
import jpeg from "jpeg-js";

const [, , D, SRC, KIND, OUTDIR, PER = "30", CELLARG = "208"] = process.argv;
const COLS = 6, CELL = Number(CELLARG), per = Number(PER);
fs.mkdirSync(OUTDIR, { recursive: true });
const entries = [];
for (const split of ["train", "val", "test"]) {
  const j = JSON.parse(fs.readFileSync(`${D}/${split}.json`, "utf8"));
  const ann = new Map(j.annotations.map(a => [a.image_id, a]));
  for (const im of j.images) if (im.source === SRC && ann.has(im.id) === (KIND === "ball")) entries.push({ split, im, a: ann.get(im.id) });
}
const sheets = Math.ceil(entries.length / per);
for (let s = 0; s < sheets; s++) {
  const part = entries.slice(s * per, (s + 1) * per), rows = Math.ceil(part.length / COLS), W = COLS * CELL, H = rows * CELL, buf = Buffer.alloc(W * H * 4, 0);
  part.forEach(({ split, im, a }, k) => {
    const px = jpeg.decode(fs.readFileSync(`${D}/${split}/${im.file_name}`), { useTArray: true });
    const ox = (k % COLS) * CELL, oy = Math.floor(k / COLS) * CELL, sc = 416 / CELL;
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
      const q = ((Math.floor(y * sc)) * 416 + Math.floor(x * sc)) * 4, d = ((oy + y) * W + ox + x) * 4;
      buf[d] = px.data[q]; buf[d + 1] = px.data[q + 1]; buf[d + 2] = px.data[q + 2]; buf[d + 3] = 255;
    }
    if (a) {
      const [bx, by, bw, bh] = a.bbox, x1 = Math.round(bx / sc) - 1, y1 = Math.round(by / sc) - 1, x2 = Math.round((bx + bw) / sc) + 1, y2 = Math.round((by + bh) / sc) + 1;
      const dot = (x, y) => { if (x >= 0 && x < CELL && y >= 0 && y < CELL) { const d = ((oy + y) * W + ox + x) * 4; buf[d] = 0; buf[d + 1] = 255; buf[d + 2] = 0; } };
      for (let x = x1; x <= x2; x++) { dot(x, y1); dot(x, y2); } for (let y = y1; y <= y2; y++) { dot(x1, y); dot(x2, y); }
    }
    // column marker: (k % 6) + 1 white squares along the top-left
    for (let m = 0; m <= k % COLS; m++) for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) { const d = ((oy + 2 + yy) * W + ox + 2 + m * 7 + xx) * 4; buf[d] = 255; buf[d + 1] = 255; buf[d + 2] = 255; }
  });
  const name = `${SRC}-${KIND}-${String(s + 1).padStart(2, "0")}`;
  fs.writeFileSync(`${OUTDIR}/${name}.jpg`, jpeg.encode({ data: buf, width: W, height: H }, 88).data);
  fs.writeFileSync(`${OUTDIR}/${name}.txt`, part.map(({ split, im }, k) => `${k + 1}\t${Math.floor(k / COLS) + 1},${(k % COLS) + 1}\t${split}/${im.file_name}`).join("\n"));
}
console.log(entries.length, "pictures ->", sheets, "sheets in", OUTDIR);
