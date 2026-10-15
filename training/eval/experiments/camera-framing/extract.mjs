// Measures every still with M1 and writes results/m1-raw.json plus overlays (training/work/framing/overlays, git-ignored).
import { createRequire } from "node:module";
const sharp = createRequire(import.meta.url)("sharp");
import fs from "node:fs";
import path from "node:path";
import { loadFraming, STILLS, CLIPS, KS, KS_B } from "./lib.mjs";
import { ROOT } from "../../lib/registry.mjs";
const { measure } = await loadFraming();
const OV = path.join(ROOT, "training/work/framing/overlays");
fs.mkdirSync(OV, { recursive: true });
const only = process.argv[2];
const DEV = ['IMG_4839','IMG_4840','IMG_4851','IMG_4866','IMG_4867'];
// Seeds = the rim position the app's own aim recorded for the clip (datasets.json rim_native). IMG_4836 has none (eye estimate); IMG_4844's camera moved during the clip (see background-registration.json) and its rim_native is not where the rim is in the stills: eye seeds, diagnostic only.
const SEED = { // (rim_native from datasets.json unless noted)
  IMG_4836: [1035, 400], IMG_4839: [1058, 450], IMG_4840: [1058, 450], IMG_4844: [840, 135], IMG_4851: [950, 413], IMG_4866: [801, 413], IMG_4867: [1018, 474], IMG_4872: [1038, 462], IMG_4873: [1040, 508], IMG_4874: [1008, 520] };
const out = {};
for (const clip of CLIPS) {
  if (only === 'dev' ? !DEV.includes(clip) : only && !clip.includes(only)) continue;
  out[clip] = [];
  for (const k of [...KS, ...KS_B]) {
    const file = path.join(STILLS, `${clip}-${k}.png`);
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const sd = SEED[clip]; const m = measure.measureFraming({ data, width: info.width, height: info.height }, { x: sd[0] / 1920, y: sd[1] / 1080 });
    out[clip].push({ k, q: m.q, rim: m.rim, board: m.board, issues: m.issues, candidates: m.candidates, ms: Math.round(m.ms) });
    // overlay on a 960 crop around the rim
    if (m.rim) {
      const f = m.factor, r = m.rim;
      const cx = Math.round(r.cx * f), cy = Math.round(r.cy * f), rw = r.w * f;
      const half = Math.round(Math.max(rw * 6, 260));
      const x0 = Math.max(0, cx - half), y0 = Math.max(0, cy - Math.round(half * 0.95)), cw = Math.min(info.width - x0, 2 * half), ch = Math.min(info.height - y0, Math.round(half * 1.4));
      let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}"><ellipse cx="${cx - x0}" cy="${cy - y0}" rx="${rw / 2}" ry="${(r.h * f) / 2}" fill="none" stroke="#00ff00" stroke-width="2"/>`;
      if (m.board) { const c = m.board.corners.map((p) => `${p.x * f - x0},${p.y * f - y0}`).join(" "); svg += `<polygon points="${c}" fill="none" stroke="#ff00ff" stroke-width="2"/>`; }
      svg += "</svg>";
      const base = await sharp(file).extract({ left: x0, top: y0, width: cw, height: ch }).png().toBuffer();
      await sharp(base).composite([{ input: Buffer.from(svg) }]).png().toFile(path.join(OV, `${clip}-${k}.png`));
    }
  }
}
fs.mkdirSync(path.join(path.dirname(new URL(import.meta.url).pathname), "results"), { recursive: true });
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "results", only ? `m1-raw-${only}.json` : "m1-raw.json"), JSON.stringify(out, null, 1));
for (const [c, arr] of Object.entries(out)) for (const e of arr) console.log(c, e.k, e.q ? `pos ${e.q.posX.toFixed(3)},${e.q.posY.toFixed(3)} size ${e.q.size.toFixed(4)} elev ${e.q.elev.toFixed(2)} az ${e.q.az?.toFixed(2)} off ${e.q.off?.toFixed(2)} roll ${e.q.roll?.toFixed(1)}` : "NONE", e.issues.join("; "), e.ms + "ms");
