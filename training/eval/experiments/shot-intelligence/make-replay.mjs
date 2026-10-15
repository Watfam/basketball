// Builds the offline flight-path replay data and frames for a few shots. Output goes to training/work/replay/ (git-ignored: it contains frames of the footage).
//   node make-replay.mjs   then   python3 -m http.server 8765 --directory training/work/replay   and open http://localhost:8765/replay.html
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, videoFile, sampledShots } from "../visibility/common.mjs";
import { analyseClip, CLIPS, clipInfo } from "./shots.mjs";

const OUT = path.join(ROOT, "training/work/replay"), SIDE = 560, BEFORE = 60, AFTER = 25, DEMO_CLIPS = ["IMG_4839", "IMG_4851", "IMG_4866", "IMG_4872"];
fs.mkdirSync(path.join(OUT, "frames"), { recursive: true });
fs.copyFileSync(new URL("./replay/replay.html", import.meta.url), path.join(OUT, "replay.html"));
const round = (v, d = 1) => (v == null ? v : +v.toFixed(d));
const pack = (A, s) => {
  const pts = s.trail.segments.flatMap((g) => g.points).filter((p) => p.type === "observed"), near = pts.filter((p) => p.y >= A.rim.y - 120 && p.y <= A.rim.y + 10).map((p) => p.w).sort((a, b) => a - b);
  const bw = near.length >= 3 ? near[near.length >> 1] : 24, band = pts.filter((p) => p.f >= s.first - 20 && p.f <= s.first && p.y >= A.rim.y - 120 && p.y <= A.rim.y - 50);
  return { segments: s.trail.segments.map((g) => g.points.map((p) => ({ f: p.f, x: round(p.x), y: round(p.y), w: round(p.w), s: round(p.score, 2), t: p.type === "observed" ? "o" : "r", u: round(p.unc, 2), id: p.id }))), gaps: s.trail.gaps, events: s.trail.events.map((e) => ({ f: e.f, x: round(e.x), y: round(e.y), reason: e.reason })), ball_width_u: round(bw), approach_frames: band.map((p) => p.f), observed: pts.length, mean_score: round(pts.reduce((a, p) => a + p.score, 0) / Math.max(1, pts.length), 2) };
};
const data = { generated: "deterministic", note: "image-space positions; observed = detector box centre, reconstructed = interpolated across a 1-3 frame gap (never a measurement); uncertainty rings are image-space and are not physical error", clips: {}, shots: [] };
for (const id of CLIPS) {
  const clip = clipInfo(id), prod = await analyseClip(id, { thin: 1, source: "production" });
  const g = clip.window, baseSide = g.cropSize, rimN = g.rim_native, cropSide = Math.min(1080, 2 * baseSide), cx0 = Math.min(1920 - cropSide, Math.max(0, Math.round(rimN[0] - cropSide / 2))), cy0 = Math.min(1080 - cropSide, Math.max(0, Math.round(rimN[1] - cropSide / 2)));
  data.clips[id] = { base: { x: g.cropX, y: g.cropY, side: baseSide }, crop: { x: cx0, y: cy0, side: cropSide }, rim_u: { x: round(prod.rim.x), y: round(prod.rim.y) }, canvas: SIDE, shots: prod.shots.map((s) => ({ id: s.id, first: s.first, outcome: s.label.written_outcome, v4: s.call.v4, trail: { production: pack(prod, s) } })) };
  if (DEMO_CLIPS.includes(id)) {
    const ctx = await analyseClip(id, { thin: 1, source: "context" }), sampled = sampledShots(id).map((x) => x.F), pickFor = (o) => prod.shots.find((s) => s.label.written_outcome === o && sampled.some((F) => Math.abs(F - s.first) <= 15) && s.first > 75);
    for (const o of ["make", "miss"]) {
      const s = pickFor(o); if (!s) continue; const c = ctx.shots.find((x) => Math.abs(x.first - s.first) <= 15), entry = data.clips[id].shots.find((x) => x.id === s.id);
      if (c) entry.trail.context = pack(ctx, c); entry.frames = { from: s.first - BEFORE, to: s.first + AFTER, dir: `frames/${s.id.replace(":", "_")}` };
      const dir = path.join(OUT, entry.frames.dir); fs.mkdirSync(dir, { recursive: true });
      const r = spawnSync("ffmpeg", ["-nostdin", "-loglevel", "error", "-y", "-ss", String(((s.first - BEFORE) * 1001) / 30000), "-i", videoFile(id), "-vf", `fps=30000/1001,crop=${cropSide}:${cropSide}:${cx0}:${cy0},scale=${SIDE}:${SIDE}`, "-frames:v", String(BEFORE + AFTER + 1), "-q:v", "4", path.join(dir, "%03d.jpg")]);
      if (r.status !== 0) throw new Error(r.stderr.toString());
      console.log("frames", s.id, o, fs.readdirSync(dir).length);
    }
  }
}
fs.writeFileSync(path.join(OUT, "data.json"), JSON.stringify(data));
console.log("wrote data.json", (fs.statSync(path.join(OUT, "data.json")).size / 1e6).toFixed(2), "MB");
