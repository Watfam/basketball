// Builds the annotation sheets: four frames per sheet at 1.5x, with a coordinate grid (window pixels, a line every 25, labelled every
// 50) and only the blind frame id on each tile. Nothing on the sheet shows the clip, the frame number, the stratum, or any model box.
//   node training/eval/annotate/sheets.mjs
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, readJSON } from "../lib/registry.mjs";

const manifest = readJSON("training/eval/annotate/manifest.json");
const work = path.join(ROOT, "training/work/eval");
const SCALE = 1.5, TILE = 416 * SCALE;
fs.mkdirSync(path.join(work, "sheets"), { recursive: true });
fs.mkdirSync(path.join(work, "tiles"), { recursive: true });

const run = (args) => { const r = spawnSync("magick", args, { encoding: "utf8" }); if (r.status !== 0) throw new Error(r.stderr); };

function tile(id) {
  const args = [path.join(work, "frames", id + ".png"), "-filter", "Lanczos", "-resize", `${TILE}x${TILE}!`, "-fill", "none", "-strokewidth", "1"];
  for (let v = 0; v <= 416; v += 25) {
    const p = v * SCALE, major = v % 100 === 0;
    args.push("-stroke", major ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.25)", "-draw", `line ${p},0 ${p},${TILE}`, "-draw", `line 0,${p} ${TILE},${p}`);
  }
  args.push("-stroke", "none", "-fill", "yellow", "-pointsize", "12");
  for (let v = 50; v < 416; v += 50) {
    args.push("-annotate", `+${v * SCALE + 2}+12`, String(v), "-annotate", `+2+${v * SCALE - 2}`, String(v));
  }
  args.push("-fill", "black", "-stroke", "none", "-draw", "rectangle 0,0 54,18", "-fill", "cyan", "-pointsize", "16", "-annotate", "+4+14", id);
  run([...args, path.join(work, "tiles", id + ".png")]);
}

const ids = manifest.frames.map((f) => f.id);
for (const id of ids) tile(id);
const sheets = [];
for (let i = 0; i < ids.length; i += 4) {
  const group = ids.slice(i, i + 4);
  const name = `sheet-${String(i / 4 + 1).padStart(2, "0")}.png`;
  run(["montage", ...group.map((id) => path.join(work, "tiles", id + ".png")), "-tile", "2x2", "-geometry", "+3+3", "-background", "#222", path.join(work, "sheets", name)]);
  sheets.push({ sheet: name, ids: group });
}
fs.writeFileSync(path.join(work, "sheets", "index.json"), JSON.stringify(sheets, null, 2));
console.log(`${ids.length} tiles, ${sheets.length} sheets`);
