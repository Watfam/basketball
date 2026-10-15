// Draws the precision-review samples (registered: seed 20261102, up to 40 per pool, stratified by clip) and renders numbered crops for labelling by eye.
//   node make-precision-sheets.mjs  -> training/work/exp2/precision/{pool}-sheet.jpg and samples.json
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { WORK, crit, videoFile } from "./common.mjs";
import { loadClip, TILE_ORDER } from "./strategies.mjs";
import { rng } from "../../lib/stats.mjs";
const c = crit(), r = rng(20261102), pools = { A1: [], A2: [], A3: [], tiles: [] }, avail = c.data.clips.filter((id) => fs.existsSync(path.join(WORK, "dets", `${id}.json`)));
for (const id of avail) {
  const C = loadClip(id);
  for (const f of C.frames) {
    const base = C.s0.get(f) ?? [], near = (b) => base.some((x) => Math.hypot((x.x1 + x.x2) / 2 - (b.x1 + b.x2) / 2, (x.y1 + x.y2) / 2 - (b.y1 + b.y2) / 2) <= 12);
    const add = (pool, boxes) => { for (const b of boxes) if (b.score >= 0.25 && !near(b)) pools[pool].push({ clip: id, f, b, cx: C.g.cropX + (b.x1 + b.x2) / 2 / C.k, cy: C.g.cropY + (b.y1 + b.y2) / 2 / C.k, side: Math.max(60, ((b.x2 - b.x1) / C.k) * 3) }); };
    add("A1", C.tileDets("A1", f)); add("A2", C.tileDets("A2", f)); add("A3", C.tileDets("A3", f));
    add("tiles", TILE_ORDER.slice(1).flatMap((n) => C.tileDets(n, f)));
  }
}
fs.mkdirSync(path.join(WORK, "precision"), { recursive: true });
const samples = {};
for (const [pool, all] of Object.entries(pools)) {
  const byClip = {}; for (const x of all) (byClip[x.clip] ??= []).push(x);
  const per = Math.max(1, Math.floor(40 / Math.max(1, Object.keys(byClip).length))), pick = [];
  for (const [clip, arr] of Object.entries(byClip)) { for (let i = arr.length - 1; i > 0; i -= 1) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } pick.push(...arr.slice(0, per)); }
  samples[pool] = { population: all.length, per_clip_population: Object.fromEntries(Object.entries(byClip).map(([k, v]) => [k, v.length])), picked: pick.map((x, i) => ({ n: i + 1, clip: x.clip, f: x.f, score: +x.b.score.toFixed(2), cx: Math.round(x.cx), cy: Math.round(x.cy) })) };
  const tiles = [];
  pick.forEach((x, i) => {
    const out = path.join(WORK, "precision", `${pool}-${i + 1}.png`), s = Math.round(x.side), x0 = Math.min(1920 - s, Math.max(0, Math.round(x.cx - s / 2))), y0 = Math.min(1080 - s, Math.max(0, Math.round(x.cy - s / 2)));
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String((x.f * 1001) / 30000), "-i", videoFile(x.clip), "-frames:v", "1", "-vf", `crop=${s}:${s}:${x0}:${y0},scale=180:180`, out]);
    execFileSync("magick", [out, "-gravity", "NorthWest", "-fill", "yellow", "-undercolor", "#000000bb", "-pointsize", "20", "-annotate", "+2+2", String(i + 1), out.replace(".png", ".l.png")]); tiles.push(out.replace(".png", ".l.png"));
  });
  if (tiles.length) execFileSync("magick", ["montage", ...tiles, "-tile", "8x", "-geometry", "+2+2", path.join(WORK, "precision", `${pool}-sheet.jpg`)]);
  console.log(pool, "population", all.length, "picked", pick.length);
}
fs.writeFileSync(path.join(WORK, "precision", "samples.json"), JSON.stringify(samples, null, 1));
