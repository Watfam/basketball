// EXPLORATORY plausibility check: do the L1 'launch' events found in the 2x window (A2) chains coincide with the ball leaving the hands? 10 shots drawn with seed 20261103.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { WORK, crit, videoFile } from "./common.mjs";
import { loadVision } from "../../lib/transpile.mjs";
import { loadClip, buildStrategies } from "./strategies.mjs";
import { chainFor } from "./metrics.mjs";
import { rng } from "../../lib/stats.mjs";
const V = await loadVision(), c = crit(), all = [];
for (const id of c.data.clips) { const C = loadClip(id), S = buildStrategies(C, 1); for (const shot of C.d.shots) { const { chain } = chainFor(S.A2, shot, 1, C.rimU, V.shotRules.inZone); if (!chain) continue; const obs = chain.obs.filter((o) => o.f <= shot.F); for (let i = 1; i < obs.length - 3; i += 1) if (obs[i].speed >= 10 && obs[i - 1].speed <= 6 && obs[i].f - obs[i - 1].f <= 2 && obs[i + 3].y < obs[i].y - 6) { all.push({ id, F: shot.F, f: obs[i].f, x: C.g.cropX + obs[i].x / C.k + 0, y: C.g.cropY + obs[i].y / C.k, w: obs[i].w / C.k, held: obs[i - 1].f }); break; } } }
const r = rng(20261103); for (let i = all.length - 1; i > 0; i -= 1) { const j = Math.floor(r() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
const pick = all.slice(0, 10); fs.mkdirSync(path.join(WORK, "launch"), { recursive: true }); const rows = [];
pick.forEach((s, k) => { const tiles = []; const side = 260, x0 = Math.min(1920 - side, Math.max(0, Math.round(s.x - side / 2))), y0 = Math.min(1080 - side, Math.max(0, Math.round(s.y - side / 2 + 40)));
  for (const o of [-6, -3, 0, 3, 6]) { const out = path.join(WORK, "launch", `${k}-${o}.png`); execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(((s.f + o) * 1001) / 30000), "-i", videoFile(s.id), "-frames:v", "1", "-vf", `crop=${side}:${side}:${x0}:${y0},scale=200:200`, out]); execFileSync("magick", [out, "-gravity", "NorthWest", "-fill", "yellow", "-undercolor", "#000000bb", "-pointsize", "16", "-annotate", "+2+2", `${k + 1}: f${s.f + o} (${o >= 0 ? "+" : ""}${o})`, out.replace(".png", ".l.png")]); tiles.push(out.replace(".png", ".l.png")); }
  rows.push(tiles); });
execFileSync("magick", ["montage", ...rows.flat(), "-tile", "5x", "-geometry", "+2+2", path.join(WORK, "launch", "sheet.jpg")]);
fs.writeFileSync(path.join(WORK, "launch", "picks.json"), JSON.stringify({ population: all.length, pick }, null, 1)); console.log("population", all.length);
