// Per-shot detection strips (exploratory): which frames before F have a plausible ball detection, in the base window (#), only outside it (o), or none (.). 30 fps, score >= 0.4, width 12-45 u.
import { loadClip, buildStrategies } from "./strategies.mjs";
const id = process.argv[2], C = loadClip(id), S = buildStrategies(C, 1), ok = (b) => b.score >= 0.4 && b.x2 - b.x1 >= 12 && b.x2 - b.x1 <= 45;
for (const shot of C.d.shots) {
  let row = "";
  for (let f = shot.F - 75; f <= shot.F + 15; f += 1) { const s0 = (S.S0_fixed.byF.get(f) ?? []).some(ok), d = (S.D_all_tiles.byF.get(f) ?? []).some(ok); row += s0 ? "#" : d ? "o" : "."; }
  const missing = [...row].filter((c) => c === ".").length, inside = [...row].filter((c) => c === "#").length;
  console.log(`F${String(shot.F).padStart(5)} ${shot.truth.padEnd(4)} ${row}  (#${inside} o${row.length - inside - missing} .${missing})`);
}
console.log("legend: each char one frame from F-75 to F+15; F is at index 75");
