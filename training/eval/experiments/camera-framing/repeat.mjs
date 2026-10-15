// Within-clip repeatability (F2) for the clips named on the command line (default: development clips) from results/m1-raw*.json
import fs from "node:fs";
import path from "node:path";
const dir = path.join(path.dirname(new URL(import.meta.url).pathname), "results");
const file = process.argv[2] || "m1-raw-dev.json";
const raw = JSON.parse(fs.readFileSync(path.join(dir, file)));
const sd = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const defs = { posX: (q) => q.posX * 1920, posY: (q) => q.posY * 1080, logSize: (q) => Math.log(q.size), elev: (q) => q.elev, az: (q) => q.az, off: (q) => q.off, asp: (q) => q.asp, roll: (q) => q.roll };
const rel = new Set(["elev", "az", "asp"]);
const pooled = {};
for (const [clip, arr] of Object.entries(raw)) {
  const row = [];
  for (const [name, f] of Object.entries(defs)) {
    const v = arr.filter((e) => e.q && (name === "posX" || name === "posY" || name === "logSize" || name === "elev" || e.q[name] !== null)).map((e) => f(e.q));
    if (v.length < 2) { row.push(`${name} n=${v.length}`); continue; }
    const s = rel.has(name) ? sd(v) / mean(v) : sd(v);
    (pooled[name] ||= []).push([s * s, v.length - 1]);
    row.push(`${name} ${s.toFixed(3)} (n=${v.length})`);
  }
  console.log(clip, row.join(" | "));
}
console.log("POOLED within-clip SD (relative for elev/az/asp):");
for (const [n, a] of Object.entries(pooled)) { const num = a.reduce((x, [v, d]) => x + v * d, 0), den = a.reduce((x, [, d]) => x + d, 0); console.log(" ", n, Math.sqrt(num / den).toFixed(4)); }
