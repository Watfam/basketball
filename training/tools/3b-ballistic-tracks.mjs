// Turns the blobs found by 1-scan-components into ball tracks: chains of blobs that move
// like a thrown ball (a smooth arc under gravity). A person in an orange shirt walks in
// near-straight lines at walking speed and fails this test.
//
//   node 3b-ballistic-tracks.mjs <comps.json> <out.json>
import fs from "node:fs";
const [, , IN, OUT] = process.argv;
const { frames, comps, big, cropX, cropY } = JSON.parse(fs.readFileSync(IN, "utf8"));

// Group blobs by frame and chain them with a constant-velocity guess.
const byFrame = new Map(); for (const c of comps) { if (!byFrame.has(c[0])) byFrame.set(c[0], []); byFrame.get(c[0]).push(c); }
const tracks = []; let open = [];
for (const f of [...byFrame.keys()].sort((a, b) => a - b)) {
  open = open.filter(t => f - t.pts[t.pts.length - 1][0] <= 4);
  const used = new Set();
  for (const c of byFrame.get(f)) {
    let best = null, bestD = 1e9;
    for (const t of open) {
      if (used.has(t)) continue;
      const l = t.pts[t.pts.length - 1], p = t.pts.length > 1 ? t.pts[t.pts.length - 2] : null, gap = f - l[0];
      const vx = p ? (l[2] - p[2]) / (l[0] - p[0]) : 0, vy = p ? (l[3] - p[3]) / (l[0] - p[0]) : 0;
      const d = Math.hypot(c[2] - (l[2] + vx * gap), c[3] - (l[3] + vy * gap));
      if (d < 14 + 3 * gap && d < bestD) { best = t; bestD = d; }
    }
    if (best) { best.pts.push(c); used.add(best); } else { const t = { pts: [c] }; tracks.push(t); open.push(t); used.add(t); }
  }
}

// Least-squares fit y = a t^2 + b t + c and x = d t + e; returns the pieces the test needs.
function fit(pts) {
  const t0 = pts[0][0], T = pts.map(p => p[0] - t0), n = pts.length;
  const solve = (A, b) => { const m = A.length; for (let i = 0; i < m; i++) { let piv = i; for (let r = i + 1; r < m; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r; [A[i], A[piv]] = [A[piv], A[i]]; [b[i], b[piv]] = [b[piv], b[i]];
    for (let r = i + 1; r < m; r++) { const k = A[r][i] / (A[i][i] || 1e-9); for (let c = i; c < m; c++) A[r][c] -= k * A[i][c]; b[r] -= k * b[i]; } }
    const x = Array(m).fill(0); for (let i = m - 1; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < m; c++) s -= A[i][c] * x[c]; x[i] = s / (A[i][i] || 1e-9); } return x; };
  const sums = k => T.reduce((a, t) => a + t ** k, 0), A = [[sums(4), sums(3), sums(2)], [sums(3), sums(2), sums(1)], [sums(2), sums(1), n]];
  const by = [0, 1, 2].map(k => T.reduce((a, t, i) => a + (t ** (2 - k)) * pts[i][3], 0));
  const [a, b, c] = solve(A, by);
  const bx = [T.reduce((a, t, i) => a + t * pts[i][2], 0), pts.reduce((a, p) => a + p[2], 0)];
  const [d, e] = solve([[sums(2), sums(1)], [sums(1), n]], bx);
  const ry = Math.sqrt(T.reduce((s, t, i) => s + (a * t * t + b * t + c - pts[i][3]) ** 2, 0) / n);
  const rx = Math.sqrt(T.reduce((s, t, i) => s + (d * t + e - pts[i][2]) ** 2, 0) / n);
  return { a, ry, rx };
}
const keep = [];
for (const t of tracks) {
  const p = t.pts; if (p.length < 5) continue;
  const span = p[p.length - 1][0] - p[0][0]; if (span < 5 || span > 90) continue;
  let path = 0; for (let i = 1; i < p.length; i++) path += Math.hypot(p[i][2] - p[i - 1][2], p[i][3] - p[i - 1][3]);
  if (path < 30 || path / span < 2.5) continue;             // too slow: a person, not a ball
  const { a, ry, rx } = fit(p);
  if (a < 0.008 || a > 3 || ry > 4 || rx > 4.5) continue;    // not an arc under gravity
  if (p.reduce((s, q) => s + q[1], 0) / p.length > 170) continue; // too big for a ball: a shirt fragment
  keep.push({ pts: p, a: +a.toFixed(3), ry: +ry.toFixed(2), rx: +rx.toFixed(2) });
}
console.log(`blobs ${comps.length}, chains ${tracks.length}, ballistic tracks kept ${keep.length}`);
const ballFrames = new Set(); for (const c of comps) ballFrames.add(c[0]);
fs.writeFileSync(OUT, JSON.stringify({ frames, cropX, cropY, tracks: keep, ballLikeFrames: [...ballFrames], big }));
