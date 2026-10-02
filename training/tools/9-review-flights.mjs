// One row per detected ball flight: up to 8 frames spread along it, each a 120x120 native-pixel
// crop centred on where the tracker says the ball is, with the tracker's box in green.
// Used to accept or reject whole flights by eye.
//   node 9-review-flights.mjs <tracks.json> <video> <out dir> [flights per sheet=6]
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import jpeg from "jpeg-js";

const [, , TRACKS, VIDEO, OUTDIR, PER = "6"] = process.argv;
const FPS = 30000 / 1001, TILE = 160, CROP = 120, COLS = 8, perSheet = Number(PER);
const T = JSON.parse(fs.readFileSync(TRACKS, "utf8"));
fs.mkdirSync(OUTDIR, { recursive: true });
const flights = T.tracks.map((t, i) => ({ id: i + 1, pts: t.pts }));

for (let s = 0; s * perSheet < flights.length; s++) {
  const rows = flights.slice(s * perSheet, (s + 1) * perSheet);
  const W = COLS * TILE, H = rows.length * TILE, buf = Buffer.alloc(W * H * 4, 40);
  rows.forEach((fl, r) => {
    const n = Math.min(COLS, fl.pts.length);
    const picks = Array.from({ length: n }, (_, k) => fl.pts[Math.round((k * (fl.pts.length - 1)) / Math.max(1, n - 1))]);
    picks.forEach((p, k) => {
      const nx = T.cropX + 2 * p[2], ny = T.cropY + 2 * p[3];
      const cx = Math.max(0, Math.min(1920 - CROP, Math.round(nx - CROP / 2)));
      const cy = Math.max(0, Math.min(1080 - CROP, Math.round(ny - CROP / 2)));
      const res = spawnSync(
        "ffmpeg",
        ["-nostdin", "-loglevel", "error", "-ss", String(p[0] / FPS), "-i", VIDEO, "-an", "-frames:v", "1",
          "-vf", `crop=${CROP}:${CROP}:${cx}:${cy},scale=${TILE}:${TILE}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        { maxBuffer: 1 << 24 }
      );
      if (!res.stdout || res.stdout.length < TILE * TILE * 3) return;
      const ox = k * TILE, oy = r * TILE, sc = TILE / CROP;
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++) {
          const q = (y * TILE + x) * 3, d = ((oy + y) * W + ox + x) * 4;
          buf[d] = res.stdout[q]; buf[d + 1] = res.stdout[q + 1]; buf[d + 2] = res.stdout[q + 2]; buf[d + 3] = 255;
        }
      const bx = (nx - cx) * sc, by = (ny - cy) * sc, hw = ((p[4] * 2 + 3) / 2) * sc, hh = ((p[5] * 2 + 3) / 2) * sc;
      const dot = (x, y) => {
        x = Math.round(x); y = Math.round(y);
        if (x >= 0 && x < TILE && y >= 0 && y < TILE) { const d = ((oy + y) * W + ox + x) * 4; buf[d] = 0; buf[d + 1] = 255; buf[d + 2] = 0; }
      };
      for (let x = bx - hw; x <= bx + hw; x++) { dot(x, by - hh); dot(x, by + hh); }
      for (let y = by - hh; y <= by + hh; y++) { dot(bx - hw, y); dot(bx + hw, y); }
    });
  });
  const name = `sheet${String(s + 1).padStart(2, "0")}`;
  fs.writeFileSync(`${OUTDIR}/${name}.jpg`, jpeg.encode({ data: buf, width: W, height: H }, 90).data);
  fs.writeFileSync(
    `${OUTDIR}/${name}.txt`,
    rows.map((fl, r) => `row ${r + 1} = flight ${fl.id}: ${(fl.pts[0][0] / FPS).toFixed(1)}s to ${(fl.pts[fl.pts.length - 1][0] / FPS).toFixed(1)}s, ${fl.pts.length} points`).join("\n")
  );
}
console.log(flights.length, "flights ->", Math.ceil(flights.length / perSheet), "sheets in", OUTDIR);
