// Scans the footage for moving orange blobs inside a window around the rim.
import { spawn } from "node:child_process";
import fs from "node:fs";
const W = 180, H = 180, FRAME = W * H * 3;
const OUT = process.argv[2];
const ff = spawn("ffmpeg", ["-loglevel","error","-i","/Users/WatfordFamily/Desktop/basketball-app/Training Video/IMG_4824.MOV","-an",
  "-vf","crop=360:360:795:280,scale=180:180,fps=30000/1001","-f","rawvideo","-pix_fmt","rgb24","-"], { stdio: ["ignore","pipe","inherit"] });
let buf = Buffer.alloc(0), n = 0;
const history = []; // orange masks of the last 3 frames
const rows = [];
const orange = (r,g,b) => r > 120 && r - g > 45 && g > b + 8 && r > b * 1.9;
ff.stdout.on("data", chunk => {
  buf = Buffer.concat([buf, chunk]);
  while (buf.length >= FRAME) {
    const f = buf.subarray(0, FRAME); buf = buf.subarray(FRAME);
    const mask = new Uint8Array(W * H);
    for (let i = 0, p = 0; i < W * H; i++, p += 3) mask[i] = orange(f[p], f[p+1], f[p+2]) ? 1 : 0;
    const old = history.length === 3 ? history[0] : null;
    let count = 0, sx = 0, sy = 0, total = 0;
    for (let i = 0; i < W * H; i++) if (mask[i]) { total++; if (!old || !old[i]) { count++; sx += i % W; sy += (i / W) | 0; } }
    if (count >= 6) rows.push([n, count, +(sx / count).toFixed(1), +(sy / count).toFixed(1), total]);
    history.push(mask); if (history.length > 3) history.shift();
    n++;
    if (n % 1500 === 0) fs.writeFileSync(OUT + ".progress", String(n));
  }
});
ff.on("close", () => { fs.writeFileSync(OUT, JSON.stringify({ frames: n, rows })); fs.writeFileSync(OUT + ".progress", "done " + n); });
