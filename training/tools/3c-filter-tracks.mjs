// Keeps only tracks that stay high in the hoop window and are long enough to be a flight.
// People (heads, shirt edges, raised arms) sit low or move in short fragments; a thrown
// ball spends its time above them.   node 3c-filter-tracks.mjs <in> <out> [maxY=125] [minPts=7]
import fs from "node:fs";
const [, , IN, OUT, MAXY = "125", MINPTS = "7"] = process.argv;
const T = JSON.parse(fs.readFileSync(IN, "utf8"));
const keep = T.tracks.filter(t => t.pts.length >= Number(MINPTS) && t.pts.every(p => p[3] <= Number(MAXY)) && Math.min(...t.pts.map(p => p[3])) <= 100);
console.log(`${T.tracks.length} tracks -> ${keep.length} kept (all points above y=${MAXY}, at least ${MINPTS} points, reaches y<=100); ${keep.reduce((a, t) => a + t.pts.length, 0)} ball points`);
fs.writeFileSync(OUT, JSON.stringify({ ...T, tracks: keep }));
