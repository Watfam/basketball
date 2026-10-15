// STEP 3 of the registered procedure: compute the shot statistic on the five DEVELOPMENT clips only (all clean), derive the thresholds by the
// registered rule, and write thresholds.json. Nothing else is evaluated here. Run once; the output is committed before evaluate.mjs exists.
import fs from "node:fs";
import path from "node:path";
import { loadApp, clipOf, loadDets, replayClip, DEV } from "./lib.mjs";
import { quantile } from "../../lib/stats.mjs";
const dir = path.dirname(new URL(import.meta.url).pathname);
const app = await loadApp();
const out = { generated: new Date().toISOString(), note: "development clips only; fps 15 (the app's rate)", clips: {}, rule: "T_SHOT = clamp(2 x p99 of shotOcc over all development records, 0.25, 0.60); T_FRAC = clamp(2 x largest affected share over any development clip at that T_SHOT, 0.20, 0.50)" };
const all = [];
for (const id of DEV) {
  const clip = clipOf(id), r = replayClip(app, clip, loadDets(clip), { thin: 2 });
  const shares = r.records.map((x) => app.warning.shotRimShare(x)).filter((v) => v !== null);
  out.clips[id] = { counted: r.counted.length, records: r.records.length, shares: shares.map((v) => +v.toFixed(4)) };
  all.push(...shares);
  console.log(id, "counted", r.counted.length, "records", r.records.length, "max share", Math.max(...shares).toFixed(3), "p95", quantile(shares, 0.95).toFixed(3), "nonzero", shares.filter((v) => v > 0).length);
}
const p99 = quantile(all, 0.99), clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const tShot = +clamp(2 * p99, 0.25, 0.60).toFixed(3);
const fracs = DEV.map((id) => { const s = out.clips[id].shares; return s.length ? s.filter((v) => v >= tShot).length / s.length : 0; });
const tFrac = +clamp(2 * Math.max(...fracs), 0.20, 0.50).toFixed(3);
out.dev = { records: all.length, p99: +p99.toFixed(4), max: +Math.max(...all).toFixed(4), affected_share_per_clip: Object.fromEntries(DEV.map((id, i) => [id, +fracs[i].toFixed(4)])) };
out.thresholds = { tShot, tFrac };
fs.writeFileSync(path.join(dir, "thresholds.json"), JSON.stringify({ derived: out.generated, from: "development clips only (IMG_4839, IMG_4840, IMG_4851, IMG_4866, IMG_4867), 15 fps", rule: out.rule, dev: out.dev, ...out.thresholds }, null, 1));
fs.writeFileSync(path.join(dir, "results-dev-stats.json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ p99: out.dev.p99, max: out.dev.max, ...out.thresholds }));
