// Runs ball-6 on the registered tiles/windows for the sampled shot segments of ONE clip.
//   node gen-tiles.mjs CLIP [parity]    -> training/work/exp2/dets/CLIP.json
// One ffmpeg decode per range writes every tile as a raw file; each tile is then run through the harness runner (the app's own YOLOX pre/post-processing).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRunner } from "../../lib/model.mjs";
import { ROOT, WORK, FRAME, loadRegistry, tileSpecs, sampledShots, ranges, videoFile } from "./common.mjs";
const id = process.argv[2], parityOnly = process.argv[3] === "parity";
const reg = loadRegistry(), clip = reg.clips.find((c) => c.id === id), { geometry: g, specs } = tileSpecs(clip), shots = sampledShots(id), rs = ranges(shots);
const runner = await createRunner(path.join(ROOT, "public/models/ball-6.onnx"), { scoreThreshold: 0.2 });
fs.mkdirSync(path.join(WORK, "raw"), { recursive: true }); fs.mkdirSync(path.join(WORK, "dets"), { recursive: true });
const FB = 416 * 416 * 3;
const unique = Object.entries(specs).filter(([, s]) => !s.alias_of);
const allNames = parityOnly ? ["base"] : unique.map(([n]) => n);
const out = { clip: id, geometry: { cropX: g.cropX, cropY: g.cropY, side: g.side, rim: g.rim }, shots, ranges: rs, specs, dets: {}, ms: {} };
for (const n of allNames) { out.dets[n] = {}; out.ms[n] = []; }
const vf = (s) => (s.kind === "full" ? "scale=416:234:flags=bicubic,pad=416:416:0:91:color=0x727272" : `crop=${s.side}:${s.side}:${s.ox}:${s.oy}${s.side === 416 ? "" : ",scale=416:416:flags=bicubic"}`);
const t00 = Date.now();
for (const [ri, [f0, f1]] of (parityOnly ? [[shots[1].F - 25, shots[1].F + 5]] : rs).entries()) {
  const tileNames = parityOnly || ri === 0 ? allNames : allNames.filter((x) => x !== "base");
  const n = f1 - f0 + 1, files = tileNames.map((name) => path.join(WORK, "raw", `${id}-${name}.rgb`));
  const parts = tileNames.map((name, i) => `[b${i}]${vf(specs[name])}[o${i}]`).join(";");
  const fc = `[0:v]fps=30000/1001,split=${tileNames.length}${tileNames.map((_, i) => `[b${i}]`).join("")};${parts}`;
  const args = ["-nostdin", "-loglevel", "error", "-y", "-ss", String((f0 * 1001) / 30000), "-i", videoFile(id), "-an", "-filter_complex", fc];
  tileNames.forEach((_, i) => args.push("-map", `[o${i}]`, "-frames:v", String(n), "-f", "rawvideo", "-pix_fmt", "rgb24", files[i]));
  const r = spawnSync("ffmpeg", args, { maxBuffer: 1 << 28 }); if (r.status !== 0) { console.error(r.stderr.toString()); process.exit(1); }
  for (let i = 0; i < tileNames.length; i += 1) {
    const buf = fs.readFileSync(files[i]), got = Math.floor(buf.length / FB), name = tileNames[i], s = specs[name];
    for (let k = 0; k < got; k += 1) {
      const det = await runner.detect(buf.subarray(k * FB, (k + 1) * FB)); out.ms[name].push(det.ms);
      out.dets[name][f0 + k] = det.boxes.map((b) => {
        if (s.kind === "full") { const f = FRAME.w / 416; return { x1: b.x1 * f, y1: (b.y1 - 91) * f, x2: b.x2 * f, y2: (b.y2 - 91) * f, score: b.score }; }
        const f = s.side / 416; return { x1: s.ox + b.x1 * f, y1: s.oy + b.y1 * f, x2: s.ox + b.x2 * f, y2: s.oy + b.y2 * f, score: b.score };
      });
    }
    fs.unlinkSync(files[i]);
  }
  console.log(`${id} frames ${f0}-${f1} done, ${((Date.now() - t00) / 1000).toFixed(0)} s`);
}
fs.writeFileSync(path.join(WORK, "dets", `${id}${parityOnly ? "-parity" : ""}.json`), JSON.stringify(out));
console.log("wrote", id);
