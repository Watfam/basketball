// Net movement, frame by frame: mean absolute brightness change inside the net's patch of the picture, for one clip.
//   node 47-net.mjs <video> <out.json> <rimNativeX> <rimNativeY> <scale> [<rim2X> <rim2Y> <switchSec>]
// The patch is the net's place under the rim (x within 30 px of the rim, 10 to 75 px below it, in 416 px hoop-window units; times the
// window scale to get camera pixels). A second rim and a switch time cover IMG_4844, where the camera moved. Frames are numbered as in
// tools/22 (fps=30000/1001). Design-time exploration only.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const REPO = path.resolve(new URL("../..", import.meta.url).pathname);
const [, , VIDEO, OUT, RX, RY, SCALE, RX2, RY2, SWITCH] = process.argv;
const FW = 1920, FH = 1080, FB = FW * FH * 3, k = Number(SCALE);
const ff = spawn("ffmpeg", ["-nostdin", "-loglevel", "error", "-i", `${REPO}/Training Video/${VIDEO}`, "-an", "-vf", "fps=30000/1001", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { stdio: ["ignore", "pipe", "inherit"] });
let chunks = [], have = 0, n = 0, prev = null;
const energy = [];
const patch = (rx, ry) => ({ x0: Math.round(rx - 30 * k), x1: Math.round(rx + 30 * k), y0: Math.round(ry + 10 * k), y1: Math.round(ry + 75 * k) });
for await (const c of ff.stdout) {
  chunks.push(c); have += c.length;
  while (have >= FB) {
    const all = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
    const img = all.subarray(0, FB), rest = all.subarray(FB); chunks = rest.length ? [rest] : []; have = rest.length;
    const second = SWITCH && n / (30000 / 1001) >= Number(SWITCH);
    const p = second ? patch(Number(RX2), Number(RY2)) : patch(Number(RX), Number(RY));
    const w = p.x1 - p.x0, h = p.y1 - p.y0, cur = new Uint8Array(Math.ceil(w / 2) * Math.ceil(h / 2));
    let i = 0; for (let y = p.y0; y < p.y1; y += 2) for (let x = p.x0; x < p.x1; x += 2) { const q = (y * FW + x) * 3; cur[i++] = (img[q] * 77 + img[q + 1] * 150 + img[q + 2] * 29) >> 8; }
    let e = 0; if (prev && prev.length === cur.length) { for (let j = 0; j < cur.length; j++) e += Math.abs(cur[j] - prev[j]); e /= cur.length; }
    energy.push(+e.toFixed(2)); prev = cur; n++;
  }
}
fs.writeFileSync(OUT, JSON.stringify({ video: VIDEO, frames: n, energy }));
console.log("DONE", VIDEO, n);
