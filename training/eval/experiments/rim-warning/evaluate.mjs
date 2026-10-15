// The registered evaluation (criteria.json) of the P-1 warning with the FROZEN thresholds (thresholds.json). Not independent validation: every clip was seen before.
import fs from "node:fs";
import path from "node:path";
import { loadApp, clipOf, loadDets, replayClip, CLIPS } from "./lib.mjs";
import { readJSON } from "../../lib/registry.mjs";
import { rng, wilson } from "../../lib/stats.mjs";
const dir = path.dirname(new URL(import.meta.url).pathname);
const th = readJSON("training/eval/experiments/rim-warning/thresholds.json"), T = { tShot: th.tShot, tFrac: th.tFrac };
const app = await loadApp(), assess = (recs) => app.warning.assessRimReading(recs, T);
const spot = readJSON("training/eval/experiments/rim-phantom/results/analysis.json").ibmg4873[0].centre; // read, not recomputed
const CLEAN = CLIPS.filter((c) => c !== "IMG_4873");
const out = { generated: new Date().toISOString(), thresholds: T, phantom_spot_from_rim_phantom_analysis: spot, caveat: "NOT independent validation: all eight clips were seen in earlier phases; exactly one clip has the phantom.", real: {}, injection: {} };
const w = (k, n) => { const x = wilson(k, n); return { k, n, rate: n ? +(k / n).toFixed(3) : null, wilson95: x ? [+x.lo.toFixed(3), +x.hi.toFixed(3)] : null }; };

// ---- real clips
const truthAffected = (rec, minFrames) => rec.frames.filter((f) => f.ran && f.boxes.some((b) => b.score >= 0.2 && Math.hypot((b.x1 + b.x2) / 2 - spot.x, (b.y1 + b.y2) / 2 - spot.y) <= 4)).length >= minFrames;
for (const [fpsKey, thin, minFrames] of [["15fps", 2, 5], ["30fps", 1, 10]]) {
  out.real[fpsKey] = {};
  for (const id of CLIPS) {
    const clip = clipOf(id), r = replayClip(app, clip, loadDets(clip), { thin }), a = assess(r.records);
    const flagged = new Set(a.affected.map((x) => x.shotId));
    const isPhantom = id === "IMG_4873";
    const truth = r.records.map((rec) => isPhantom && truthAffected(rec, minFrames));
    const wins = []; for (let i = 0; i < r.records.length; i += 10) { const chunk = r.records.slice(i, i + 10); if (chunk.length >= 5) wins.push({ from: i, n: chunk.length, warn: assess(chunk).warn }); }
    out.real[fpsKey][id] = {
      counted: r.counted.length, records: r.records.length, warn: a.warn, reason: a.reason, affected: a.affected.length, affected_share: r.records.length ? +(a.affected.length / r.records.length).toFixed(3) : 0,
      empty_records: r.records.filter((x) => x.frames.length === 0).length,
      shares: r.records.map((x) => +(app.warning.shotRimShare(x) ?? 0).toFixed(3)),
      truly_affected: truth.filter(Boolean).length, flagged_truly_affected: r.records.filter((rec, i) => truth[i] && flagged.has(rec.shotId)).length, flagged_not_truly_affected: r.records.filter((rec, i) => !truth[i] && flagged.has(rec.shotId)).length,
      windows: wins,
    };
    const o = out.real[fpsKey][id];
    console.log(fpsKey, id.padEnd(9), "counted", String(o.counted).padStart(3), "affected", String(o.affected).padStart(2), "/", o.records, "warn", o.warn, "| truly affected", o.truly_affected, "flagged of them", o.flagged_truly_affected, "| windows warned", o.windows.filter((x) => x.warn).length, "/", o.windows.length);
  }
}
const R15 = out.real["15fps"];
const falseWholeClips = CLEAN.filter((id) => R15[id].warn);
const cleanShots = CLEAN.reduce((a, id) => a + R15[id].records, 0), cleanFlagged = CLEAN.reduce((a, id) => a + R15[id].affected, 0);
const p = R15.IMG_4873;
out.summary = {
  C1_false_warnings_whole_clips: { ...w(falseWholeClips.length, CLEAN.length), clips: falseWholeClips, pass: falseWholeClips.length <= 1 },
  C2_missed_warning_IMG_4873: { warned: p.warn, pass: p.warn },
  C3_shot_level: { phantom_clip: w(p.flagged_truly_affected, p.truly_affected), clean_clips_flagged: w(cleanFlagged, cleanShots), pass: p.truly_affected > 0 && p.flagged_truly_affected / p.truly_affected >= 0.8 && cleanFlagged / cleanShots <= 0.05 },
  windows_reported_not_scored: { clean_windows_warned: w(CLEAN.reduce((a, id) => a + R15[id].windows.filter((x) => x.warn).length, 0), CLEAN.reduce((a, id) => a + R15[id].windows.length, 0)), phantom_windows_warned: w(p.windows.filter((x) => x.warn).length, p.windows.length) },
  sensitivity_30fps: { clean_clips_warned: CLEAN.filter((id) => out.real["30fps"][id].warn), IMG_4873_warned: out.real["30fps"].IMG_4873.warn, IMG_4873_flagged_truly_affected: `${out.real["30fps"].IMG_4873.flagged_truly_affected}/${out.real["30fps"].IMG_4873.truly_affected}` },
};

// ---- synthetic injection (SYNTHETIC): the rim-phantom study's generator
const DUTY = [0.05, 0.10, 0.20, 0.42, 0.60], SPOTS = [[-12, 2], [8, -15]], SEED = 20261020;
out.injection.label = "SYNTHETIC. Not a real-clip result.";
out.injection.cells = [];
for (const duty of DUTY) for (const [si, [ox, oy]] of SPOTS.entries()) for (const [ci, id] of CLEAN.entries()) {
  const clip = clipOf(id), { frames, byF: base } = loadDets(clip), byF = new Map([...base].map(([k, v]) => [k, v.map((b) => ({ ...b }))]));
  const clean = replayClip(app, clip, { frames, byF: base }, { thin: 2 });
  const [rx, ry] = clip.window.rim_native, probe = app.counting.createCountingCore({ frameW: 1920, frameH: 1080, rim: { x: rx / 1920, y: ry / 1080 }, scale: clip.window.scale, autoSize: false }).window.rim;
  const rnd = rng(SEED + 1000 * ci + 100 * si + Math.round(duty * 100));
  let f = 0;
  while (f < frames) { const on = rnd() < duty, len = Math.max(5, Math.round(-Math.log(1 - rnd()) * 60)); if (on) for (let g = f; g < Math.min(frames, f + len); g += 1) (byF.get(g) ?? byF.set(g, []).get(g)).push({ f: g, x1: probe.x + ox - 5.5, y1: probe.y + oy - 5.5, x2: probe.x + ox + 5.5, y2: probe.y + oy + 5.5, score: 0.5, _inj: true }); f += len; }
  const r = replayClip(app, clip, { frames, byF }, { thin: 2 }), a = assess(r.records);
  out.injection.cells.push({ duty, spot: si, clip: id, warn: a.warn, affected: a.affected.length, records: r.records.length, counted_clean: clean.counted.length, counted_injected: r.counted.length });
}
out.injection.by_duty = Object.fromEntries(DUTY.map((d) => { const c = out.injection.cells.filter((x) => x.duty === d); return [d, { ...w(c.filter((x) => x.warn).length, c.length), mean_counted_clean: +(c.reduce((a, x) => a + x.counted_clean, 0) / c.length).toFixed(1), mean_counted_injected: +(c.reduce((a, x) => a + x.counted_injected, 0) / c.length).toFixed(1), shots_lost_total: c.reduce((a, x) => a + Math.max(0, x.counted_clean - x.counted_injected), 0), cells_losing_2_or_more_shots: c.filter((x) => x.counted_clean - x.counted_injected >= 2).length }]; }));
const hi = [0.42, 0.60].flatMap((d) => out.injection.cells.filter((x) => x.duty === d));
out.summary.C4_injection = { warn_at_0_42_and_0_60: w(hi.filter((x) => x.warn).length, hi.length), warn_at_0_05: out.injection.by_duty[0.05], pass: hi.filter((x) => x.warn).length / hi.length >= 0.9 && out.injection.by_duty[0.05].rate <= 0.1 };
fs.writeFileSync(path.join(dir, "results.json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.summary, null, 1));
console.log("injection by duty:", JSON.stringify(out.injection.by_duty));
