// Contact sheets, at a larger size, of the chalk-clip (IMG_4826) no-ball pictures that contain a
// deep-red region (the boy in the red shirt, who carries the ball). Those are the pictures where a
// ball can hide against the shirt, so each is checked by eye; the rest are not at risk.
//   node 14-review-red-boy.mjs <dataset dir> <out dir> [min red px=300]
import fs from "node:fs";
import jpeg from "jpeg-js";
const [, , D, OUTDIR, MINARG = "300"] = process.argv, MIN = Number(MINARG), n = 416, COLS = 6, CELL = 300, PER = 18;
const deepRed = (r, g, b) => r > 105 && g < 0.5 * r && b < 0.65 * r && r - g > 55;
fs.mkdirSync(OUTDIR, { recursive: true });
const hits = [];
for (const split of ["train", "val", "test"]) {
  const j = JSON.parse(fs.readFileSync(`${D}/${split}.json`, "utf8"));
  const withBall = new Set(j.annotations.map(a => a.image_id));
  for (const im of j.images) {
    if (im.source !== "4826" || withBall.has(im.id)) continue;
    const px = jpeg.decode(fs.readFileSync(`${D}/${split}/${im.file_name}`), { useTArray: true });
    let c = 0; for (let i = 0; i < n * n; i++) { const q = i * 4; if (deepRed(px.data[q], px.data[q + 1], px.data[q + 2])) c++; }
    if (c >= MIN) hits.push({ split, im, px });
  }
}
console.log(hits.length, "chalk-clip pictures contain the red boy");
for (let s = 0; s * PER < hits.length; s++) {
  const part = hits.slice(s * PER, (s + 1) * PER), rows = Math.ceil(part.length / COLS), W = COLS * CELL, H = rows * CELL, buf = Buffer.alloc(W * H * 4, 0);
  part.forEach(({ px }, k) => {
    const ox = (k % COLS) * CELL, oy = Math.floor(k / COLS) * CELL, sc = n / CELL;
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) { const q = (Math.floor(y * sc) * n + Math.floor(x * sc)) * 4, d = ((oy + y) * W + ox + x) * 4; buf[d] = px.data[q]; buf[d+1] = px.data[q+1]; buf[d+2] = px.data[q+2]; buf[d+3] = 255; }
    for (let m = 0; m <= k % COLS; m++) for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 5; xx++) { const d = ((oy + 2 + yy) * W + ox + 2 + m * 8 + xx) * 4; buf[d] = 255; buf[d+1] = 255; buf[d+2] = 255; }
  });
  const name = `redboy-${String(s + 1).padStart(2, "0")}`;
  fs.writeFileSync(`${OUTDIR}/${name}.jpg`, jpeg.encode({ data: buf, width: W, height: H }, 88).data);
  fs.writeFileSync(`${OUTDIR}/${name}.txt`, part.map(({ split, im }, k) => `${k + 1}\t${Math.floor(k / COLS) + 1},${(k % COLS) + 1}\t${split}/${im.file_name}`).join("\n"));
}
