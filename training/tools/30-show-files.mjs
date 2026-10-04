// Contact sheet of a given list of picture files from a dataset directory, numbered in list order.
//   node 30-show-files.mjs <dataset dir> <list.json: [[sheet, tile, "split/file"], ...]> <out.jpg>
import fs from "node:fs";
import jpeg from "jpeg-js";

const [, , D, LIST, OUT] = process.argv, COLS = 6, CELL = 208;
const list = JSON.parse(fs.readFileSync(LIST, "utf8"));
const rows = Math.ceil(list.length / COLS), W = COLS * CELL, H = rows * CELL, buf = Buffer.alloc(W * H * 4, 0);
list.forEach(([, , file], k) => {
  const px = jpeg.decode(fs.readFileSync(`${D}/${file}`), { useTArray: true }), ox = (k % COLS) * CELL, oy = Math.floor(k / COLS) * CELL, sc = 416 / CELL;
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) { const q = (Math.floor(y * sc) * 416 + Math.floor(x * sc)) * 4, d = ((oy + y) * W + ox + x) * 4; buf[d] = px.data[q]; buf[d + 1] = px.data[q + 1]; buf[d + 2] = px.data[q + 2]; buf[d + 3] = 255; }
  for (let m = 0; m <= k % COLS; m++) for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) { const d = ((oy + 2 + yy) * W + ox + 2 + m * 7 + xx) * 4; buf[d] = 255; buf[d + 1] = 255; buf[d + 2] = 255; }
});
fs.writeFileSync(OUT, jpeg.encode({ data: buf, width: W, height: H }, 90).data);
console.log(list.length, "pictures ->", OUT);
