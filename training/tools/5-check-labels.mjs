import fs from "node:fs"; import jpeg from "jpeg-js";
const D = "/Users/WatfordFamily/Desktop/basketball-app/Training Video/dataset";
const split = process.argv[2] || "train", COLS = 6, ROWS = 5, CELL = 208, N = COLS * ROWS;
const coco = JSON.parse(fs.readFileSync(`${D}/${split}.json`, "utf8"));
const byImg = new Map(coco.annotations.map(a => [a.image_id, a]));
let seed = Number(process.argv[3] || 7); const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const pool = coco.images.filter(i => byImg.has(i.id)); const picks = [];
while (picks.length < N) picks.push(pool[Math.floor(rand() * pool.length)]);
const W = COLS * CELL, H = ROWS * CELL, out = Buffer.alloc(W * H * 4, 0);
picks.forEach((im, k) => {
  const px = jpeg.decode(fs.readFileSync(`${D}/${split}/${im.file_name}`), { useTArray: true }), a = byImg.get(im.id);
  const [bx, by, bw, bh] = a.bbox, ox = (k % COLS) * CELL, oy = Math.floor(k / COLS) * CELL;
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) { const s = ((y * 2) * 416 + x * 2) * 4, d = ((oy + y) * W + ox + x) * 4; out[d] = px.data[s]; out[d+1] = px.data[s+1]; out[d+2] = px.data[s+2]; out[d+3] = 255; }
  const x1 = Math.round(bx / 2) - 1, y1 = Math.round(by / 2) - 1, x2 = Math.round((bx + bw) / 2) + 1, y2 = Math.round((by + bh) / 2) + 1;
  for (let x = x1; x <= x2; x++) for (const y of [y1, y2]) if (x >= 0 && x < CELL && y >= 0 && y < CELL) { const d = ((oy + y) * W + ox + x) * 4; out[d] = 0; out[d+1] = 255; out[d+2] = 0; }
  for (let y = y1; y <= y2; y++) for (const x of [x1, x2]) if (x >= 0 && x < CELL && y >= 0 && y < CELL) { const d = ((oy + y) * W + ox + x) * 4; out[d] = 0; out[d+1] = 255; out[d+2] = 0; }
});
fs.writeFileSync(process.argv[4] || "overlay.jpg", jpeg.encode({ data: out, width: W, height: H }, 88).data);
console.log("wrote", process.argv[4] || "overlay.jpg");
