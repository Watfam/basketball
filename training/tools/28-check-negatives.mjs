// Contact sheet of random pictures from a set of NO-BALL pictures (a dataset dir whose json files have no
// annotations, or a merged dataset with --noball to show only unannotated pictures), at a size big enough to
// see a small ball. Tile n of the sheet is picture n in the .txt file.
//
//   node 28-check-negatives.mjs <dataset dir> <out dir> <how many> [seed] [source filter]
import fs from "node:fs";
import jpeg from "jpeg-js";

const [, , D, OUTDIR, NARG, SEED = "3", SRC = ""] = process.argv, COLS = 6, CELL = 208;
let seed = Number(SEED); const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
fs.mkdirSync(OUTDIR, { recursive: true });
const all = [];
for (const s of ["train", "val", "test"]) {
  const j = JSON.parse(fs.readFileSync(`${D}/${s}.json`, "utf8")), withBall = new Set(j.annotations.map(a => a.image_id));
  for (const im of j.images) if (!withBall.has(im.id) && (!SRC || im.source === SRC)) all.push({ s, im });
}
const pick = [], pool = [...all]; while (pick.length < Number(NARG) && pool.length) pick.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
const PER = 30;
for (let sh = 0; sh * PER < pick.length; sh++) {
  const part = pick.slice(sh * PER, (sh + 1) * PER), rows = Math.ceil(part.length / COLS), W = COLS * CELL, H = rows * CELL, buf = Buffer.alloc(W * H * 4, 0);
  part.forEach(({ s: sp, im }, k) => {
    const px = jpeg.decode(fs.readFileSync(`${D}/${sp}/${im.file_name}`), { useTArray: true }), ox = (k % COLS) * CELL, oy = Math.floor(k / COLS) * CELL, sc = 416 / CELL;
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) { const q = (Math.floor(y * sc) * 416 + Math.floor(x * sc)) * 4, d = ((oy + y) * W + ox + x) * 4; buf[d] = px.data[q]; buf[d + 1] = px.data[q + 1]; buf[d + 2] = px.data[q + 2]; buf[d + 3] = 255; }
    for (let m = 0; m <= k % COLS; m++) for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) { const d = ((oy + 2 + yy) * W + ox + 2 + m * 7 + xx) * 4; buf[d] = 255; buf[d + 1] = 255; buf[d + 2] = 255; }
  });
  const name = `negatives-${String(sh + 1).padStart(2, "0")}`;
  fs.writeFileSync(`${OUTDIR}/${name}.jpg`, jpeg.encode({ data: buf, width: W, height: H }, 90).data);
  fs.writeFileSync(`${OUTDIR}/${name}.txt`, part.map(({ s: sp, im }, k) => `${k + 1}\t${Math.floor(k / COLS) + 1},${(k % COLS) + 1}\t${sp}/${im.file_name}`).join("\n"));
}
console.log(all.length, "no-ball pictures available;", pick.length, "reviewed in", Math.ceil(pick.length / PER), "sheets");
