// EXPLORATORY: where do the (loosened, L1) launch events of the 2x-window chains lie, and how large is the ball there?
import fs from "node:fs";
import path from "node:path";
import { RES, crit, readJSON } from "./common.mjs";
import { loadVision } from "../../lib/transpile.mjs";
import { loadClip, buildStrategies } from "./strategies.mjs";
import { chainFor } from "./metrics.mjs";
const V = await loadVision(), c = crit(), rows = {}, roles = Object.fromEntries([...c.data.roles.development.map((x) => [x, "dev"]), ...c.data.roles.validation.map((x) => [x, "val"])]);
const out = { per_clip: {}, pooled: { shots: 0, launches: 0, outside_base_window: 0, widths_ratio: [], timing_pair_diffs: [] } };
for (const id of c.data.clips) {
  const C = loadClip(id), S = buildStrategies(C, 1), r = (out.per_clip[id] = { shots: 0, launches: 0, outside_base_window: 0, ball_width_launch_over_rim: [] });
  for (const shot of C.d.shots) {
    r.shots += 1; out.pooled.shots += 1;
    const { chain } = chainFor(S.A2, shot, 1, C.rimU, V.shotRules.inZone); if (!chain) continue;
    const obs = chain.obs.filter((o) => o.f <= shot.F), rimW = (() => { const p = obs.filter((o) => Math.abs(o.y - C.rimU.y) < 60 && Math.abs(o.x - C.rimU.x) < 80); return p.length ? p[0].w : null; })();
    for (let i = 1; i < obs.length - 3; i += 1) if (obs[i].speed >= 10 && obs[i - 1].speed <= 6 && obs[i].f - obs[i - 1].f <= 2 && obs[i + 3].y < obs[i].y - 6) {
      const o = obs[i - 1]; r.launches += 1; out.pooled.launches += 1; const outside = o.x < 0 || o.x > 416 || o.y < 0 || o.y > 416; if (outside) { r.outside_base_window += 1; out.pooled.outside_base_window += 1; }
      if (rimW) { r.ball_width_launch_over_rim.push(+(o.w / rimW).toFixed(2)); out.pooled.widths_ratio.push(o.w / rimW); }
      break;
    }
  }
}
const w = [...out.pooled.widths_ratio].sort((a, b) => a - b); out.pooled.width_ratio = { n: w.length, p10: w[Math.floor(w.length * 0.1)], median: w[w.length >> 1], p90: w[Math.floor(w.length * 0.9)] }; delete out.pooled.widths_ratio; delete out.pooled.timing_pair_diffs;
fs.writeFileSync(path.join(RES, "launch-stats.json"), JSON.stringify(out, null, 1));
for (const [id, r] of Object.entries(out.per_clip)) console.log(id, `shots ${r.shots} launches ${r.launches} outside-base-window ${r.outside_base_window}`);
console.log("pooled", JSON.stringify(out.pooled));
