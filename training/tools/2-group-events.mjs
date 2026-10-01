import fs from "node:fs";
const { frames, rows } = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const FPS = 30000 / 1001, RIM = [90, 90];
console.log("frames:", frames, "rows with a moving orange blob:", rows.length);
// group into events: gap of more than 20 frames starts a new one
const events = []; let cur = null;
for (const r of rows) {
  if (!cur || r[0] - cur.rows[cur.rows.length - 1][0] > 20) { cur = { rows: [] }; events.push(cur); }
  cur.rows.push(r);
}
for (const e of events) {
  const rs = e.rows;
  e.start = rs[0][0]; e.end = rs[rs.length - 1][0]; e.n = rs.length;
  e.minDist = Math.min(...rs.map(r => Math.hypot(r[2] - RIM[0], r[3] - RIM[1])));
  e.maxCount = Math.max(...rs.map(r => r[1]));
}
console.log("events:", events.length);
const near = events.filter(e => e.minDist < 40);
console.log("events whose blob comes within 40 px (window units, 80 px real) of the rim:", near.length);
const hist = {}; for (const e of events) { const b = Math.min(10, Math.floor((e.end - e.start) / 15)); hist[b] = (hist[b] || 0) + 1; }
console.log("event length (units of half-second):", JSON.stringify(hist));
console.log("\nfirst 25 events near the rim: start(s) -> end(s), frames with blob, closest approach, biggest blob");
for (const e of near.slice(0, 25)) console.log(`${(e.start / FPS).toFixed(1).padStart(7)}s -> ${(e.end / FPS).toFixed(1).padStart(7)}s  n=${String(e.n).padStart(3)}  closest=${e.minDist.toFixed(0).padStart(3)}  maxpx=${e.maxCount}`);
fs.writeFileSync(process.argv[3], JSON.stringify(events.map(e => ({ start: e.start, end: e.end, n: e.n, minDist: e.minDist, maxCount: e.maxCount, rows: e.rows }))));
