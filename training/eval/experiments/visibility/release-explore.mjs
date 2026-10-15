// EXPLORATORY (not registered): why is the registered release almost never observed? Loosened launch definitions on the same chains, plus where the chain begins.
//   node release-explore.mjs -> results/release-explore.json
import fs from "node:fs";
import path from "node:path";
import { RES, crit } from "./common.mjs";
import { loadVision } from "../../lib/transpile.mjs";
import { loadClip, buildStrategies } from "./strategies.mjs";
import { chainFor } from "./metrics.mjs";
const V = await loadVision(), c = crit(), names = ["S0_fixed", "A1", "A2", "D_all_tiles", "B_left"];
const out = { note: "exploratory definitions, same chains as the registered metrics (cv_nearest on the strategy's own detections)", defs: {
  L1_launch: "an observed point with speed >= 10 px/ref frame preceded within 2 processed frames by an observed point with speed <= 6 and followed by upward motion (y falls over the next 3 observed points)",
  L2_chain_starts_in_hand: "the chain's first observed point is at least 3 observed points before the first point of speed >= 10 (the approach to launch is observed, any speed)",
  L3_start_before_apex: "the chain's observed points begin at least 8 reference frames before its minimum-y point (rising flight observed from its early part)" }, rows: {} };
const rate = {};
for (const id of c.data.clips) {
  const C = loadClip(id), S = buildStrategies(C, 1);
  for (const name of names) for (const shot of C.d.shots) {
    const { chain } = chainFor(S[name], shot, 1, C.rimU, V.shotRules.inZone); const key = name; const r = (rate[key] ??= { n: 0, L1: 0, L2: 0, L3: 0, startsBeforeF: [] });
    r.n += 1; if (!chain) continue;
    const obs = chain.obs.filter((o) => o.f <= shot.F);
    let l1 = false; for (let i = 1; i < obs.length - 3; i += 1) { if (obs[i].speed >= 10 && obs[i - 1].speed <= 6 && obs[i].f - obs[i - 1].f <= 2 && obs[i + 3].y < obs[i].y - 6) { l1 = true; break; } }
    const fast = obs.findIndex((o) => o.speed >= 10); const l2 = fast >= 3;
    let mi = 0; obs.forEach((o, i) => { if (o.y < obs[mi].y) mi = i; }); const l3 = obs.length > 3 && obs[mi].f - obs[0].f >= 8 && mi >= 2;
    if (l1) r.L1 += 1; if (l2) r.L2 += 1; if (l3) r.L3 += 1; if (obs.length) r.startsBeforeF.push(shot.F - obs[0].f);
  }
}
for (const [k, r] of Object.entries(rate)) { const s = [...r.startsBeforeF].sort((a, b) => a - b); out.rows[k] = { shots: r.n, L1: r.L1, L2: r.L2, L3: r.L3, chain_begins_frames_before_F: { median: s[s.length >> 1], p25: s[Math.floor(s.length / 4)], p75: s[Math.floor((3 * s.length) / 4)] } }; console.log(k.padEnd(14), JSON.stringify(out.rows[k])); }
fs.writeFileSync(path.join(RES, "release-explore.json"), JSON.stringify(out, null, 1));
