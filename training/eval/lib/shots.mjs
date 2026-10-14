// Shot classification through the app's own counting core (src/lib/vision/counting.ts, transpiled, unmodified).
// Detections are replayed frame by frame, optionally thinned to 15 fps as the live loop runs.
import fs from "node:fs";
import path from "node:path";
import { ROOT, readJSON } from "./registry.mjs";
import { wilson } from "./stats.mjs";

export const RULES = ["v1", "v2", "v3", "v4"];

/** Counted shots for one clip's detections. `thin` keeps every nth frame (2 = the live 15 fps). */
export function countClip(vision, clip, detsFile, { thin = 1, minScore = 0 } = {}) {
  const d = readJSON(detsFile);
  const w = clip.window;
  const [rx, ry] = w.rim_native;
  const core = vision.counting.createCountingCore({ frameW: 1920, frameH: 1080, rim: { x: rx / 1920, y: ry / 1080 }, scale: w.scale, autoSize: false });
  const c = core.window.crop;
  if (c.sx !== d.cropX || c.sy !== d.cropY || (d.cropSize ?? 416) !== c.sw) {
    throw new Error(`${clip.id}: the app's window (${c.sx}, ${c.sy}, ${c.sw}) is not the one the detections were made in (${d.cropX}, ${d.cropY}, ${d.cropSize ?? 416})`);
  }
  const byFrame = new Map();
  for (const x of d.detections) if (x.score >= minScore) (byFrame.get(x.f) ?? byFrame.set(x.f, []).get(x.f)).push(x);
  const calls = [];
  for (let f = 0; f < d.frames; f += 1) {
    if (thin > 1 && f % thin !== 0) continue;
    calls.push(...core.push((f * 1000) / vision.shotRules.REFERENCE_FPS, byFrame.get(f) ?? []).calls);
  }
  calls.push(...core.flush());
  return { calls: calls.filter((x) => x.counted), frames: d.frames, detections: d.detections.length };
}

/**
 * Pairs counted shots with the written list. Equal counts pair 1 to 1 in order. Otherwise an alignment that rewards
 * agreement of V2 with the list, exactly as tools/41-score-core.ts does so numbers stay comparable with the README;
 * that alignment flatters the rule, and the result says which was used.
 */
export function align(shots, truth) {
  if (shots.length === truth.length) return { how: "1-to-1", pairs: shots.map((s, i) => ({ s, t: truth[i], ti: i })), extra: 0, unseen: 0 };
  const N = shots.length, M = truth.length, NEG = -1e9;
  const dp = Array.from({ length: N + 1 }, () => Array(M + 1).fill(NEG));
  const bk = Array.from({ length: N + 1 }, () => Array(M + 1).fill(null));
  dp[0][0] = 0;
  for (let i = 0; i <= N; i += 1) for (let j = 0; j <= M; j += 1) {
    const v = dp[i][j];
    if (v === NEG) continue;
    if (i < N && v - 1 > dp[i + 1][j]) { dp[i + 1][j] = v - 1; bk[i + 1][j] = [i, j, "skip"]; }
    if (j < M && v - 2 > dp[i][j + 1]) { dp[i][j + 1] = v - 2; bk[i][j + 1] = [i, j, "unseen"]; }
    if (i < N && j < M) {
      const sc = shots[i].v2 === truth[j] ? 1 : -1;
      if (v + sc > dp[i + 1][j + 1]) { dp[i + 1][j + 1] = v + sc; bk[i + 1][j + 1] = [i, j, "match"]; }
    }
  }
  let i = N, j = M;
  const path_ = [];
  while (i || j) { const b = bk[i][j]; path_.push(b); i = b[0]; j = b[1]; }
  path_.reverse();
  return {
    how: "alignment by V2 agreement (flatters the rule)",
    pairs: path_.filter((p) => p[2] === "match").map((p) => ({ s: shots[p[0]], t: truth[p[1]], ti: p[1] })),
    extra: path_.filter((p) => p[2] === "skip").length,
    unseen: path_.filter((p) => p[2] === "unseen").length,
  };
}

/**
 * `phantomFrames`: reference frames of candidates the annotation identified as NOT shots (type no_shot). They are removed before the
 * shots are paired with the written list, within `tolerance` frames (a 15 fps run numbers the same moment one frame differently).
 */
export function scoreClip(vision, clip, detsFile, opts = {}) {
  const truth = readJSON(clip.truth.file).results;
  const { calls: all, frames, detections } = countClip(vision, clip, detsFile, opts);
  const phantoms = opts.phantomFrames ?? [];
  const calls = all.filter((c) => !phantoms.some((f) => Math.abs(c.first - f) <= (opts.tolerance ?? 3)));
  const removed = all.length - calls.length;
  const a = align(calls, truth);
  const correct = Object.fromEntries(RULES.map((r) => [r, a.pairs.filter((p) => p.s[r] === p.t).length]));
  const n = a.pairs.length;
  return {
    clip: clip.id, role: clip.role, session: clip.session, detector_in_sample: clip.ball6_training?.used ?? null,
    frames, detections, written: truth.length, counted: calls.length, matched: n, extra_candidates: a.extra, written_never_seen: a.unseen, alignment: removed ? `${a.how} after removing ${removed} annotated phantom candidate(s)` : a.how,
    correct, accuracy: Object.fromEntries(RULES.map((r) => [r, wilson(correct[r], n)])),
    // the honest end-to-end figure: right calls out of ALL written shots, so a shot the system never counted is a miss, not a skipped row
    accuracy_of_written: Object.fromEntries(RULES.map((r) => [r, wilson(correct[r], truth.length)])),
    // one entry per WRITTEN shot (index = its place in Matt's list), kept so a later run can be compared shot by shot, not just in aggregate
    per_shot: truth.map((t, ti) => { const p = a.pairs.find((x) => x.ti === ti); return p ? { ti, truth: t, seen: true, v4: p.s.v4, v2: p.s.v2, flagged: p.s.flagged, cross: p.s.cross } : { ti, truth: t, seen: false }; }),
  };
}

export function pool(rows) {
  const n = rows.reduce((a, r) => a + r.matched, 0);
  const written = rows.reduce((a, r) => a + (r.written ?? r.matched), 0);
  const correct = Object.fromEntries(RULES.map((r) => [r, rows.reduce((a, x) => a + x.correct[r], 0)]));
  return { clips: rows.length, matched: n, written, correct, accuracy: Object.fromEntries(RULES.map((r) => [r, wilson(correct[r], n)])), accuracy_of_written: Object.fromEntries(RULES.map((r) => [r, wilson(correct[r], written)])) };
}
