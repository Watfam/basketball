import fs from "node:fs";
const { rows } = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const FPS = 30000 / 1001, RIM = [90, 90];
// keep ball-sized moving blobs; link them into tracks frame to frame
const pts = rows.filter(r => r[1] >= 12 && r[1] <= 400).map(r => ({ f: r[0], n: r[1], x: r[2], y: r[3] }));
const tracks = []; let open = [];
for (const p of pts) {
  open = open.filter(t => p.f - t.last.f <= 6);
  let best = null, bestD = 1e9;
  for (const t of open) { const d = Math.hypot(p.x - t.last.x, p.y - t.last.y); const reach = 22 + 7 * (p.f - t.last.f); if (d < reach && d < bestD) { best = t; bestD = d; } }
  if (best) { best.pts.push(p); best.last = p; } else { const t = { pts: [p], last: p }; tracks.push(t); open.push(t); }
}
const long = tracks.filter(t => t.pts.length >= 4);
console.log("blobs:", pts.length, "tracks:", tracks.length, "tracks with 4+ points:", long.length);

// a candidate: a track that is falling (y increasing) as it passes rim height, near the rim in x
const cands = [];
for (const t of long) {
  for (let i = 1; i < t.pts.length; i++) {
    const a = t.pts[i - 1], b = t.pts[i];
    if (a.y < RIM[1] + 2 && b.y >= RIM[1] - 2 && b.y > a.y && Math.abs(b.x - RIM[0]) < 26) { cands.push({ track: t, i, f: b.f }); break; }
  }
}
// merge candidates that are the same flight
cands.sort((a, b) => a.f - b.f);
const merged = []; for (const c of cands) if (!merged.length || c.f - merged[merged.length - 1].f > 25) merged.push(c);
console.log("balls coming down through the rim zone:", merged.length);

const out = merged.map(c => {
  const t = c.track, f0 = c.f;
  const after = t.pts.filter(p => p.f > f0 && p.f <= f0 + 22);
  const below = after.filter(p => p.y > RIM[1] + 12 && Math.abs(p.x - RIM[0]) < 28);
  const xAtRim = t.pts[c.i].x;
  const rose = t.pts.filter(p => p.f < f0 && p.f >= f0 - 40);
  const apex = rose.length ? Math.min(...rose.map(p => p.y)) : null;
  return { f: f0, t: +(f0 / FPS).toFixed(2), xAtRim: +xAtRim.toFixed(0), apexY: apex === null ? null : +apex.toFixed(0), pointsAfter: after.length, belowRim: below.length, maxX: after.length ? +Math.max(...after.map(p => Math.abs(p.x - RIM[0]))).toFixed(0) : null,
    guess: below.length >= 2 ? "make-like" : "miss-like" };
});
fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
const mk = out.filter(o => o.guess === "make-like").length;
console.log(`first guess: ${mk} make-like, ${out.length - mk} miss-like\n`);
console.log("  time(s)  xAtRim  apexY  pts_after  below_rim  maxOffX  guess");
for (const o of out.slice(0, 40)) console.log(String(o.t).padStart(8), String(o.xAtRim).padStart(7), String(o.apexY).padStart(6), String(o.pointsAfter).padStart(9), String(o.belowRim).padStart(10), String(o.maxX).padStart(8), " ", o.guess);
