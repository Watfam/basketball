// Draws the 40 recall frames (registered: 10 shots, seed 20261101, F-60/-45/-30/-15) and renders gridded full frames for blind annotation.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { loadRegistry, sampledShots, videoFile, WORK, crit } from "./common.mjs";
import { rng } from "../../lib/stats.mjs";
const c = crit(), reg = loadRegistry(), r = rng(20261101), pool = [];
for (const id of [...c.data.roles.development, ...c.data.roles.validation]) for (const s of sampledShots(id)) if (s.F >= 75) pool.push({ id, F: s.F });
for (let i = pool.length - 1; i > 0; i -= 1) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
const chosen = pool.slice(0, 10), frames = [];
for (const s of chosen) for (const o of [-60, -45, -30, -15]) frames.push({ id: s.id, F: s.F, offset: o, n: s.F + o });
fs.mkdirSync(path.join(WORK, "recall"), { recursive: true });
frames.forEach((fr, i) => {
  fr.key = `R${String(i + 1).padStart(2, "0")}`;
  const raw = path.join(WORK, "recall", `${fr.key}.png`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String((fr.n * 1001) / 30000), "-i", videoFile(fr.id), "-frames:v", "1", raw]);
  const draw = [];
  for (let x = 0; x <= 1920; x += 100) draw.push("-stroke", x % 500 === 0 ? "#ffff00" : "#ffffff55", "-strokewidth", x % 500 === 0 ? "2" : "1", "-draw", `line ${x},0 ${x},1080`);
  for (let y = 0; y <= 1080; y += 100) draw.push("-stroke", y % 500 === 0 ? "#ffff00" : "#ffffff55", "-strokewidth", y % 500 === 0 ? "2" : "1", "-draw", `line 0,${y} 1920,${y}`);
  const lab = [];
  for (let x = 0; x < 1920; x += 200) lab.push("-annotate", `+${x + 3}+22`, String(x));
  for (let y = 100; y < 1080; y += 200) lab.push("-annotate", `+4+${y - 3}`, String(y));
  execFileSync("magick", [raw, ...draw, "-stroke", "none", "-fill", "yellow", "-undercolor", "#00000099", "-pointsize", "20", "-gravity", "NorthWest", ...lab.map((v) => v), path.join(WORK, "recall", `${fr.key}-grid.jpg`)]);
});
fs.writeFileSync(path.join(WORK, "recall", "frames.json"), JSON.stringify(frames, null, 1));
console.log(frames.map((f) => `${f.key} ${f.id} f${f.n}`).join("\n"));
