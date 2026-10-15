// M2-as-shipped (findHoop from src/lib/vision/hoop-match.ts) as a camera-moved detector. Criteria: criteria-v6.json. Output: results/m2.json
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadFraming, STILLS, CLIPS } from "./lib.mjs";
import { ROOT } from "../../lib/registry.mjs";
const sharp = createRequire(import.meta.url)("sharp");
const { hoopMatch: H } = await loadFraming();
const dir = path.join(path.dirname(new URL(import.meta.url).pathname), "results");
const raw = JSON.parse(fs.readFileSync(path.join(dir, "m1-raw.json")));
const ev = JSON.parse(fs.readFileSync(path.join(dir, "evaluation.json")));
const ds = JSON.parse(fs.readFileSync(path.join(ROOT, "training/eval/datasets.json")));
const winScale = (c) => ds.clips.find((x) => x.id === c)?.window?.scale ?? 1;
const grey = async (file) => (await sharp(file).greyscale().resize(H.MATCH_W, H.MATCH_H, { fit: "fill" }).raw().toBuffer());
const m1rim = (clip, k) => { const e = raw[clip].find((x) => x.k === k); return e?.q ? { x: e.q.posX, y: e.q.posY } : null; };
const refOf = async (clip) => { const rim = m1rim(clip, 5); if (!rim) return null; return { gray: new Uint8Array(await grey(path.join(STILLS, `${clip}-5.png`))), rim, scale: winScale(clip) }; };
const refs = {}; for (const c of CLIPS) refs[c] = await refOf(c);
const GATE = 0.35;
const moved = (ref, m) => Math.abs(m.rim.x - ref.rim.x) > 0.02 || Math.abs(m.rim.y - ref.rim.y) > 0.02 || Math.abs(m.sizeRatio - 1) > 0.10;
const query = async (refClip, file, truthRim) => {
  const ref = refs[refClip]; if (!ref) return null;
  const m = await H.findHoop(ref, new Uint8Array(await grey(file)));
  const usable = m.score >= GATE;
  return { score: +m.score.toFixed(3), usable, moved: moved(ref, m), rimErr: truthRim ? Math.hypot(m.rim.x - truthRim.x, m.rim.y - truthRim.y) : null, sizeRatio: +m.sizeRatio.toFixed(3) };
};
const out = { same: [], different: [], synthetic: [] };
// same camera
for (const c of CLIPS) { if (c === "IMG_4844" || !refs[c]) continue; for (let k = 1; k <= 10; k++) { if (k === 5) continue; const q = await query(c, path.join(STILLS, `${c}-${k}.png`), m1rim(c, k)); if (q) out.same.push({ clip: c, k, ...q }); } }
for (const [a, b] of [["IMG_4839", "IMG_4840"], ["IMG_4840", "IMG_4839"]]) for (let k = 1; k <= 10; k++) { const q = await query(a, path.join(STILLS, `${b}-${k}.png`), m1rim(b, k)); if (q) out.same.push({ clip: `${a}->${b}`, k, ...q }); }
console.log("same done", out.same.length);
// different camera (background-registration truth)
for (const p of ev.F6.pairs.filter((x) => x.truth === "different_camera")) for (const [a, b] of [[p.a, p.b], [p.b, p.a]]) { const q = await query(a, path.join(STILLS, `${b}-5.png`), m1rim(b, 5)); if (q) out.different.push({ ref: a, query: b, ...q }); }
console.log("different done", out.different.length);
// synthetic similarity perturbations of the -5 still
const TMP = path.join(ROOT, "training/work/framing/synth2"); fs.mkdirSync(TMP, { recursive: true });
const OPS = [["pan0.01", "within", { dx: 0.01 * 1920 }], ["zoom1.04", "within", { s: 1.04 }], ["roll0.5", "within", { r: 0.5 }], ["bright0.85", "within", { b: 0.85 }], ["bright1.15", "within", { b: 1.15 }], ["pan0.03", "moved", { dx: 0.03 * 1920 }], ["pan0.08", "moved", { dx: 0.08 * 1920, dy: 0.04 * 1080 }], ["zoom1.15", "moved", { s: 1.15 }], ["zoom1.30", "moved", { s: 1.30 }], ["zoom1.50", "moved", { s: 1.5 }], ["roll3", "roll", { r: 3 }], ["roll6", "roll", { r: 6 }], ["zoom1.2+pan0.05+roll3", "moved", { s: 1.2, dx: 0.05 * 1920, r: 3 }]];
for (const clip of ["IMG_4839", "IMG_4866", "IMG_4867", "IMG_4872", "IMG_4873", "IMG_4874"]) for (const [name, truth, p] of OPS) {
  const src = path.join(STILLS, `${clip}-5.png`), dst = path.join(TMP, `${clip}-${name}.png`); const s = p.s ?? 1, r = p.r ?? 0, dx = p.dx ?? 0, dy = p.dy ?? 0;
  const args = [src]; if (p.b) args.push("-evaluate", "Multiply", String(p.b)); if (s !== 1 || r || dx || dy) args.push("-virtual-pixel", "edge", "-distort", "SRT", `960,540 ${s} ${r} ${960 + dx},${540 + dy}`); args.push(dst);
  execFileSync("magick", args);
  const rim0 = m1rim(clip, 5), a = (r * Math.PI) / 180, vx = (rim0.x * 1920 - 960) * s, vy = (rim0.y * 1080 - 540) * s;
  const truthRim = { x: (960 + dx + vx * Math.cos(a) - vy * Math.sin(a)) / 1920, y: (540 + dy + vx * Math.sin(a) + vy * Math.cos(a)) / 1080 };
  const q = await query(clip, dst, truthRim); fs.unlinkSync(dst);
  out.synthetic.push({ clip, op: name, truth, ...q }); console.log(clip, name, JSON.stringify(q));
}
fs.writeFileSync(path.join(dir, "m2.json"), JSON.stringify(out, null, 1));
const frac = (a, f) => (a.length ? +(a.filter(f).length / a.length).toFixed(3) : null);
const med = (a) => { a = [...a].sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null; };
const q95 = (a) => { a = [...a].sort((x, y) => x - y); return a.length ? a[Math.floor(a.length * 0.95)] : null; };
const u = (a) => a.filter((x) => x.usable);
const errs = [...out.same, ...out.different].filter((x) => x.usable && x.rimErr !== null).map((x) => x.rimErr);
const sum = {
  same: { n: out.same.length, usable: frac(out.same, (x) => x.usable), falseAlarmAmongUsable: frac(u(out.same), (x) => x.moved), nUsable: u(out.same).length },
  different: { n: out.different.length, usable: frac(out.different, (x) => x.usable), missAmongUsable: frac(u(out.different), (x) => !x.moved), nUsable: u(out.different).length },
  accuracy: { n: errs.length, median_frame_fraction: med(errs), p95_frame_fraction: q95(errs), median_px_of_1920: med(errs) !== null ? +(med(errs) * 1920).toFixed(1) : null },
  synthetic: Object.fromEntries(["within", "moved", "roll"].map((t) => { const a = out.synthetic.filter((x) => x.truth === t); return [t, { n: a.length, usable: frac(a, (x) => x.usable), moved_among_usable: frac(u(a), (x) => x.moved), nUsable: u(a).length }]; })),
};
fs.writeFileSync(path.join(dir, "m2-summary.json"), JSON.stringify(sum, null, 1));
console.log(JSON.stringify(sum, null, 1));
