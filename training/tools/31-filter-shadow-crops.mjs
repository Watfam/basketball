// A shadow-only crop has exactly ONE dark round blob, sitting on the pale backboard. Anything else is not a clean
// "shadow, no ball" example, so the crop is dropped:
//   - two or more dark round blobs (a real dark ball plus its shadow),
//   - the one blob is surrounded by blue sky instead of the grey-white backboard (a ball flying in the sky),
//   - no pale backboard in the picture at all.
// Writes a cleaned copy of the shadow-negative set and two review sheets of what was dropped and kept.
//
//   node 31-filter-shadow-crops.mjs <shadow dir> <out dir>
import fs from "node:fs";
import jpeg from "jpeg-js";

const [, , SRC, OUT] = process.argv, n = 416;
for (const s of ["train", "val", "test"]) fs.mkdirSync(`${OUT}/${s}`, { recursive: true });

function analyse(px) {
  const luma = new Float32Array(n * n); let pale = 0;
  for (let i = 0; i < n * n; i++) { const r = px.data[i * 4], g = px.data[i * 4 + 1], b = px.data[i * 4 + 2]; luma[i] = (r * 77 + g * 150 + b * 29) / 256; if (luma[i] > 150 && Math.abs(r - b) < 25) pale++; }
  const mask = new Uint8Array(n * n); for (let i = 0; i < n * n; i++) mask[i] = luma[i] < 95 ? 1 : 0;
  const seen = new Uint8Array(n * n), stack = new Int32Array(n * n), blobs = [];
  for (let s = 0; s < n * n; s++) {
    if (!mask[s] || seen[s]) continue;
    let top = 0, area = 0, x0 = n, x1 = 0, y0 = n, y1 = 0, sx = 0, sy = 0; stack[top++] = s; seen[s] = 1;
    while (top) {
      const q = stack[--top], x = q % n, y = (q / n) | 0; area++; sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue; const k = ny * n + nx; if (mask[k] && !seen[k]) { seen[k] = 1; stack[top++] = k; } }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (area >= 350 && area <= 16000 && (bw / bh < 2.4 && bh / bw < 2.4) && area / (bw * bh) > 0.45) blobs.push({ cx: sx / area, cy: sy / area, r: Math.sqrt(area / Math.PI), x0, x1, y0, y1, round: bw / bh < 1.3 && bh / bw < 1.3 && area / (bw * bh) > 0.65 });
  }
  return { pale: pale / (n * n), blobs };
}
// is the area just outside a blob blue sky (b clearly above r) rather than grey-white board?
function skyAround(px, b) {
  let c = 0, blue = 0;
  for (let a = 0; a < 24; a++) { const ang = (a / 24) * Math.PI * 2, x = Math.round(b.cx + Math.cos(ang) * (b.r + 8)), y = Math.round(b.cy + Math.sin(ang) * (b.r + 8)); if (x < 0 || y < 0 || x >= n || y >= n) continue; const q = (y * n + x) * 4; c++; if (px.data[q + 2] > px.data[q] + 18 && px.data[q + 2] > 150) blue++; }
  return c > 0 && blue / c > 0.5;
}

const kept = [], dropped = [], made = { train: [], val: [], test: [] }, why = { twoBlobs: 0, sky: 0, noBoard: 0, noBlob: 0 };
for (const split of ["train", "val", "test"]) {
  const j = JSON.parse(fs.readFileSync(`${SRC}/${split}.json`, "utf8"));
  for (const im of j.images) {
    const file = `${split}/${im.file_name}`, px = jpeg.decode(fs.readFileSync(`${SRC}/${file}`), { useTArray: true }), a = analyse(px);
    let reason = null;
    if (a.pale < 0.08) { reason = "noBoard"; why.noBoard++; }
    else if (a.blobs.length === 0) { reason = "noBlob"; why.noBlob++; }
    else if (a.blobs.some(b => !b.round)) { reason = "twoBlobs"; why.twoBlobs++; }
    else if (a.blobs.length >= 2) { reason = "twoBlobs"; why.twoBlobs++; }
    else if (skyAround(px, a.blobs[0])) { reason = "sky"; why.sky++; }
    if (reason) { dropped.push(file); continue; }
    kept.push(file); fs.copyFileSync(`${SRC}/${file}`, `${OUT}/${file}`); made[split].push(im);
  }
}
for (const s of ["train", "val", "test"]) fs.writeFileSync(`${OUT}/${s}.json`, JSON.stringify({ images: made[s], annotations: [], categories: [{ id: 1, name: "ball" }] }));
fs.writeFileSync(`${OUT}/dropped.json`, JSON.stringify(dropped.map((f, i) => [0, i + 1, f])));
fs.writeFileSync(`${OUT}/kept.json`, JSON.stringify(kept.map((f, i) => [0, i + 1, f])));
console.log("kept", kept.length, "dropped", dropped.length, JSON.stringify(why));
