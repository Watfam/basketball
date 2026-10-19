// EXPLORATION, no registered claim: for every real group with two or more arrivals, how well does ONE parabola explain the ball from the first
// arrival's rim contact to the second arrival? Same flight (a rim bounce) should fit; a ball that was caught and thrown should not.
import { CLIPS, loadClip, sightings, arrivals, follow, fitFlight } from "./lib.mjs";
import { countClip } from "../../lib/shots.mjs";
const rows = [];
for (const id of CLIPS) {
  const c = await loadClip(id); const pts = sightings(c);
  const { calls } = countClip(c.vision, c.clip, c.clip.detections.ball6, { thin: 1 });
  const arr = arrivals(pts);
  for (const call of calls) {
    const inside = arr.filter((a) => a.f1 >= call.first - 2 && a.f1 <= call.last + 2);
    for (let k = 0; k + 1 < inside.length; k += 1) {
      const a1 = inside[k], a2 = inside[k + 1];
      // the ball after the first arrival: start at its last sighting at or after f1, follow to a2's arrival
      const startIdx = pts.findIndex((p) => p.f >= a1.f1);
      const chain = follow(pts, startIdx, a2.f1);
      const fit = fitFlight(chain);
      rows.push({ clip: id, call: call.first, f1: a1.f1, f2: a2.f1, gap: a2.f1 - a1.f1, n: chain.length, reachesA2: chain[chain.length - 1].f >= a2.f1 - 1, rms: fit?.rms ?? null, accel: fit?.accel ?? null });
    }
  }
}
for (const r of rows) console.log(`${r.clip} call ${String(r.call).padStart(5)} arrivals ${r.f1}->${r.f2} gap ${String(r.gap).padStart(3)} chain ${String(r.n).padStart(3)} reaches ${r.reachesA2 ? "yes" : "no "} rms ${r.rms === null ? "  -  " : r.rms.toFixed(2)} accel ${r.accel === null ? "-" : r.accel.toFixed(2)}`);
