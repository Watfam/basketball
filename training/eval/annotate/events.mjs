// Frame strips around chosen shot candidates, for annotating rim interactions (and release, where it is in the picture).
// Not blind to the rule's calls (the candidates are chosen BECAUSE a call was wrong or the shot alignment was ambiguous);
// the outcome is read from the pictures.
//   node training/eval/annotate/events.mjs <clip> <frame> [<frame> ...]   -> training/work/eval/events/<clip>-<frame>.png
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, loadRegistry } from "../lib/registry.mjs";
import { windowFrames, SIZE } from "../lib/frames.mjs";

const [clipId, ...frameArgs] = process.argv.slice(2);
const targets = frameArgs.map(Number);
const OFFSETS = [-6, 0, 6, 12, 18, 30];
const reg = loadRegistry();
const clip = reg.clips.find((c) => c.id === clipId);
const out = path.join(ROOT, "training/work/eval/events");
fs.mkdirSync(out, { recursive: true });
const want = new Map();
for (const t of targets) for (const o of OFFSETS) (want.get(t + o) ?? want.set(t + o, []).get(t + o)).push([t, o]);
const last = Math.max(...want.keys());
for (const { n, rgb } of windowFrames(clip)) {
  if (n > last) break;
  for (const [t, o] of want.get(n) ?? []) {
    const f = path.join(out, `${clipId}-${t}-${o}.png`);
    spawnSync("magick", ["-size", `${SIZE}x${SIZE}`, "-depth", "8", "rgb:-", "-fill", "yellow", "-pointsize", "20", "-annotate", "+6+24", `${o >= 0 ? "+" : ""}${o}`, `png:${f}`], { input: Buffer.from(rgb) });
  }
}
for (const t of targets) {
  const files = OFFSETS.map((o) => path.join(out, `${clipId}-${t}-${o}.png`));
  spawnSync("magick", ["montage", ...files, "-tile", "3x2", "-geometry", "+2+2", "-background", "#222", path.join(out, `${clipId}-${t}.png`)]);
  console.log(`strip ${clipId}-${t}.png`);
}
