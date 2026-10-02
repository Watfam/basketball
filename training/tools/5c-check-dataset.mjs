// Contact sheets of random pictures from the merged dataset, for checking labels by eye:
// ball pictures with their boxes, and "no ball" pictures from a chosen clip.
//   node 5c-check-dataset.mjs <out dir> [dataset dir]
import fs from "node:fs"; import path from "node:path"; import jpeg from "jpeg-js";
const OUTDIR = process.argv[2], D = process.argv[3] || path.resolve(new URL("../..", import.meta.url).pathname, "Training Video/dataset3");
let seed = 77; const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
function sheet(pick, boxes, out) {
  const COLS = 6, CELL = 208, ROWS = Math.ceil(pick.length / COLS), W = COLS * CELL, H = ROWS * CELL, buf = Buffer.alloc(W * H * 4, 0);
  pick.forEach((im, k) => { const px = jpeg.decode(fs.readFileSync(`${D}/${im.split}/${im.file_name}`), { useTArray: true }), ox = (k % COLS) * CELL, oy = Math.floor(k / COLS) * CELL;
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) { const s = ((y * 2) * 416 + x * 2) * 4, d = ((oy + y) * W + ox + x) * 4; buf[d] = px.data[s]; buf[d+1] = px.data[s+1]; buf[d+2] = px.data[s+2]; buf[d+3] = 255; }
    const a = boxes.get(im.id); if (a) { const [bx, by, bw, bh] = a.bbox, x1 = Math.round(bx / 2) - 1, y1 = Math.round(by / 2) - 1, x2 = Math.round((bx + bw) / 2) + 1, y2 = Math.round((by + bh) / 2) + 1;
      const dot = (x, y) => { if (x >= 0 && x < CELL && y >= 0 && y < CELL) { const d = ((oy + y) * W + ox + x) * 4; buf[d] = 0; buf[d+1] = 255; buf[d+2] = 0; } };
      for (let x = x1; x <= x2; x++) { dot(x, y1); dot(x, y2); } for (let y = y1; y <= y2; y++) { dot(x1, y); dot(x2, y); } } });
  fs.writeFileSync(out, jpeg.encode({ data: buf, width: W, height: H }, 88).data);
}
const all = {}; for (const s of ["train", "val", "test"]) { const j = JSON.parse(fs.readFileSync(`${D}/${s}.json`, "utf8")); all[s] = j; j.images.forEach(i => (i.split = s)); }
const imgs = [].concat(...Object.values(all).map(j => j.images)), anns = new Map([].concat(...Object.values(all).map(j => j.annotations)).map(a => [a.image_id, a]));
const take = (arr, n) => { const o = [], c = [...arr]; while (o.length < n && c.length) o.push(c.splice(Math.floor(rand() * c.length), 1)[0]); return o; };
// each entry: [source, has a ball?, how many, file name]
const jobs = (process.argv[4] ? JSON.parse(process.argv[4]) : [["4825", true, 24, "pos-4825"], ["4826", false, 18, "neg-4826"], ["4829", false, 18, "neg-4829"], ["4824", false, 18, "neg-4824"], ["4824", true, 18, "pos-4824"]]);
for (const [src, ball, n, name] of jobs) sheet(take(imgs.filter(i => i.source === src && anns.has(i.id) === ball), n), anns, `${OUTDIR}/${name}.jpg`);
console.log("sheets written to", OUTDIR);
