// Synthetic similarity perturbations of real stills (criteria.json: P3 within tolerance, N similarity beyond tolerance) with KNOWN truth.
// Each op is applied to all 5 set-A stills of a clip with ImageMagick, the rim is measured with the seed moved by the same transform, and the
// perturbed descriptor is compared with the clip's own untouched descriptor. Output: results/synthetic.json
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadFraming, STILLS, KS } from "./lib.mjs";
import { ROOT } from "../../lib/registry.mjs";
const sharp = createRequire(import.meta.url)("sharp");
const { measure, descriptor } = await loadFraming();
const SEED = { IMG_4839: [1058, 450], IMG_4866: [801, 413], IMG_4867: [1018, 474], IMG_4872: [1038, 462], IMG_4873: [1040, 508], IMG_4874: [1008, 520] };
const OPS = [
  // [name, kind, truth, params]
  ["pan0.01", "P3", "comparable", { dx: 0.01 * 1920, dy: 0 }],
  ["zoom1.04", "P3", "comparable", { s: 1.04 }],
  ["roll0.5", "P3", "comparable", { r: 0.5 }],
  ["bright0.85", "P3", "comparable", { b: 0.85 }],
  ["bright1.15", "P3", "comparable", { b: 1.15 }],
  ["pan0.03", "N", "normalizable", { dx: 0.03 * 1920, dy: 0 }],
  ["pan0.08", "N", "normalizable", { dx: 0.08 * 1920, dy: 0.04 * 1080 }],
  ["zoom1.15", "N", "normalizable", { s: 1.15 }],
  ["zoom1.30", "N", "normalizable", { s: 1.30 }],
  ["zoom1.50", "N", "normalizable", { s: 1.50 }],
  ["roll3", "N", "normalizable", { r: 3 }],
  ["roll6", "N", "normalizable", { r: 6 }],
  ["zoom1.2+pan0.05+roll3", "N", "normalizable", { s: 1.2, dx: 0.05 * 1920, dy: 0, r: 3 }],
];
const TMP = path.join(ROOT, "training/work/framing/synth");
fs.mkdirSync(TMP, { recursive: true });
const raw = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "results/m1-raw.json")));
const out = [];
for (const clip of Object.keys(SEED)) {
  const base = descriptor.describeFraming(raw[clip].filter((e) => KS.includes(e.k)));
  for (const [name, kind, truth, p] of OPS) {
    const ms = [];
    for (const k of KS) {
      const src = path.join(STILLS, `${clip}-${k}.png`), dst = path.join(TMP, `${clip}-${k}-${name}.png`);
      const s = p.s ?? 1, r = p.r ?? 0, dx = p.dx ?? 0, dy = p.dy ?? 0;
      const args = [src];
      if (p.b) args.push("-evaluate", "Multiply", String(p.b));
      if (s !== 1 || r !== 0 || dx || dy) args.push("-virtual-pixel", "edge", "-distort", "SRT", `960,540 ${s} ${r} ${960 + dx},${540 + dy}`);
      args.push(dst);
      execFileSync("magick", args);
      const { data, info } = await sharp(dst).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      // seed transformed the same way: scale about the centre, rotate (IM SRT angle is clockwise in image coordinates), shift
      const [sx0, sy0] = SEED[clip], a = (r * Math.PI) / 180;
      const vx = (sx0 - 960) * s, vy = (sy0 - 540) * s;
      const sx = 960 + dx + vx * Math.cos(a) - vy * Math.sin(a), sy = 540 + dy + vx * Math.sin(a) + vy * Math.cos(a);
      ms.push(measure.measureFraming({ data, width: info.width, height: info.height }, { x: sx / 1920, y: sy / 1080 }));
      fs.unlinkSync(dst);
    }
    const d = descriptor.describeFraming(ms);
    const cmp = descriptor.compareFramingDescriptors(base, d);
    out.push({ clip, op: name, kind, truth, usable: d.usable, class: cmp.class, reasons: cmp.reasons, cues: Object.fromEntries(Object.entries(cmp.cues).map(([k, v]) => [k, v.verdict])), deltas: Object.fromEntries(Object.entries(cmp.cues).map(([k, v]) => [k, +v.delta.toFixed(4)])) });
    console.log(clip, name, cmp.class, "usable:", d.usable.join(","), JSON.stringify(Object.fromEntries(Object.entries(cmp.cues).map(([k, v]) => [k, v.verdict]))));
  }
}
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "results/synthetic.json"), JSON.stringify(out, null, 1));
