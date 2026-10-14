// Pulls the manifest's frames out of the footage: the 416 px window as the model sees it (PNG) and the same frame at native
// resolution (raw rgb, for the circle-fit test). Uses the dump tool's own piece-wise decoding so frame numbers match.
// Images stay in training/work/eval (git-ignored): footage of the kids is never committed.
//   node training/eval/annotate/extract.mjs
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, loadRegistry, readJSON } from "../lib/registry.mjs";
import { windowFrames, nativeFrames, SIZE } from "../lib/frames.mjs";

const reg = loadRegistry();
const manifest = readJSON("training/eval/annotate/manifest.json");
const out = path.join(ROOT, "training/work/eval");
fs.mkdirSync(path.join(out, "frames"), { recursive: true });
fs.mkdirSync(path.join(out, "native"), { recursive: true });

const byClip = {};
for (const f of manifest.frames) (byClip[f.clip] ??= []).push(f);

for (const [id, list] of Object.entries(byClip)) {
  const clip = reg.clips.find((c) => c.id === id);
  const idsByFrame = new Map();
  for (const f of list) (idsByFrame.get(f.n) ?? idsByFrame.set(f.n, []).get(f.n)).push(f.id);
  const pieceStarts = new Map();
  const last = Math.max(...idsByFrame.keys());
  let got = 0;
  for (const { n, rgb, piece, local } of windowFrames(clip)) {
    if (n > last) break;
    if (!idsByFrame.has(n)) continue;
    pieceStarts.set(n, { piece, local });
    for (const fid of idsByFrame.get(n)) {
      const r = spawnSync("magick", ["-size", `${SIZE}x${SIZE}`, "-depth", "8", "rgb:-", "png:" + path.join(out, "frames", fid + ".png")], { input: Buffer.from(rgb) });
      if (r.status !== 0) throw new Error("magick failed: " + r.stderr);
      fs.writeFileSync(path.join(out, "frames", fid + ".rgb"), rgb);
      got += 1;
    }
  }
  const native = nativeFrames(clip, [...idsByFrame.keys()], pieceStarts);
  for (const [n, buf] of native) for (const fid of idsByFrame.get(n)) fs.writeFileSync(path.join(out, "native", fid + ".rgb"), buf);
  console.log(`${id}: ${got} window frames, ${native.size} native crops (${clip.window.cropSize} px)`);
}
