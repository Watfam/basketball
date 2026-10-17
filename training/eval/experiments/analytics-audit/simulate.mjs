// Phase 14 analytics audit: how often do the player-facing statements say "Clear" or "leans to a side" when nothing has changed?
// Criteria were registered first (PREREGISTRATION.md). The app's own functions are used (transpiled from src/lib, not re-implemented).
//   node training/eval/experiments/analytics-audit/simulate.mjs [--trials 3000]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ROOT } from "../../lib/registry.mjs";

const req = createRequire(path.join(ROOT, "node_modules") + "/");
const ts = req("typescript");
const OUT = path.join(ROOT, "training/work/p14");
fs.rmSync(OUT, { recursive: true, force: true });
const walk = (d, acc = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); e.isDirectory() ? walk(f, acc) : f.endsWith(".ts") && !f.endsWith(".test.ts") && acc.push(f); } return acc; };
for (const f of walk(path.join(ROOT, "src/lib"))) {
  const dest = path.join(OUT, path.relative(ROOT, f).replace(/\.ts$/, ".mjs"));
  const js = ts.transpileModule(fs.readFileSync(f, "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/from "(\.[^"]*)\.ts"/g, 'from "$1.mjs"').replaceAll("import.meta.dirname", JSON.stringify(path.dirname(f)));
  fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, js);
}
if (process.env.CLEAR_Z) { const f = path.join(OUT, "src/lib/basketball/benchmark-analysis.mjs"); fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace(/export const CLEAR_Z = [0-9.]+;/, `export const CLEAR_Z = ${Number(process.env.CLEAR_Z)};`)); }
const lib = (n) => import(path.join(OUT, "src/lib", n + ".mjs"));
const { buildInsights, nextAction } = await lib("basketball/insights");
const { summarizePatterns } = await lib("review/shot-scene");

const TRIALS = Number(process.argv[process.argv.indexOf("--trials") + 1]) || 3000;
let seed = 20261017;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const norm = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
const binom = (n, p) => { let k = 0; for (let i = 0; i < n; i++) if (rnd() < p) k++; return k; };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const pc = (k, n) => Math.round((1000 * k) / n) / 10;

let uid = 0;
const tracking = (makes, attempts) => ({ v: 1, source: "camera", shot_session_id: "s" + ++uid, camera_attempts: attempts, camera_makes: makes, flipped: 0, added_by_hand: 0, rule_version: "v4", model_version: "ball6", adjusted: null });
const day = (week, d = 0) => new Date(Date.UTC(2026, 9, 1 + 7 * (week - 1) + d)).toISOString();
const bmRow = (key, week, makes, attempts) => ({
  logId: "l" + ++uid, workoutSessionId: "w" + uid, at: day(week), week, day: 4, drillName: { free_throw: "Free Throw Reset", catch_and_shoot: "Catch-and-Shoot off the Pin-Down", beat_the_clock: "Beat the Clock Finisher" }[key], status: "completed",
  metrics: { type: "shooting", variant: "Benchmark v1", category: { free_throw: "stationary", catch_and_shoot: "catch_and_shoot", beat_the_clock: "pressure_challenge" }[key], category_basis: "drill_definition", makes, attempts, target: null, tracking: tracking(makes, attempts),
    benchmark: { protocol: key + "@v1", conditions: key === "catch_and_shoot" ? { pass_from: "partner" } : null, conditions_complete: true, clock_complete: key === "beat_the_clock" ? true : null, redo: 0 } },
});
const drillRow = (name, week, makes, attempts) => ({
  logId: "l" + ++uid, workoutSessionId: "w" + uid, at: day(week, 1), week: null, day: null, drillName: name, status: "completed",
  metrics: { type: "shooting", variant: "Right side", category: "stationary", category_basis: "drill_definition", makes, attempts, target: null, tracking: tracking(makes, attempts) },
});
// A player whose true rate is p on average and wobbles from day to day by SD points (an assumption, varied, never measured).
const dayRate = (p, sd) => clamp(p + (sd / 100) * norm(), 0.02, 0.98);
const verdictOf = (ins) => (ins.evidence !== "clear" ? 0 : /is up/.test(ins.headline) ? 1 : -1);
const out = { trials: TRIALS, seed: 20261017, assumptions: { dayToDaySdPoints: [0, 3, 5], note: "no real day-to-day data exists yet; these are stated assumptions" } };

// ---- S1: one benchmark comparison ----------------------------------------------------------------------------------------------
out.s1 = [];
for (const sd of [0, 3, 5]) for (const p of [0.4, 0.5, 0.6, 0.7]) {
  let up = 0, down = 0;
  for (let t = 0; t < TRIALS; t++) {
    const rows = [bmRow("free_throw", 1, 0, 30), bmRow("free_throw", 3, 0, 30)];
    for (const r of rows) { r.metrics.makes = binom(30, dayRate(p, sd)); r.metrics.tracking.camera_makes = r.metrics.makes; }
    const ins = buildInsights(rows).find((i) => i.id === "bm-prev-free_throw" || i.id === "bm-change-free_throw");
    const v = ins ? verdictOf(ins) : 0; if (v > 0) up++; else if (v < 0) down++;
  }
  out.s1.push({ sd, p, falseUp: pc(up, TRIALS), falseDown: pc(down, TRIALS), either: pc(up + down, TRIALS) });
}

// ---- S2-S4: the screen as it is built -------------------------------------------------------------------------------------------
function screen(sd, withDrills) {
  let anyBench = 0, anyDrill = 0, any = 0, benchStage = [0, 0], firstOnly = 0, anyDown = 0;
  for (let t = 0; t < TRIALS; t++) {
    const base = { free_throw: 0.45 + 0.3 * rnd(), catch_and_shoot: 0.4 + 0.3 * rnd(), beat_the_clock: 0.35 + 0.3 * rnd() };
    const bench = [];
    for (const wk of [1, 3, 6]) for (const k of Object.keys(base)) {
      const n = k === "beat_the_clock" ? 20 + Math.floor(26 * rnd()) : 30;
      bench.push(bmRow(k, wk, binom(n, dayRate(base[k], sd)), n));
    }
    const drills = [];
    if (withDrills) for (const name of ["Elbow Pull-Up", "Wing Catch-and-Shoot", "Free Throw Reset"]) { const b = 0.35 + 0.35 * rnd(); for (let w = 1; w <= 6; w++) { const n = 8 + Math.floor(9 * rnd()); drills.push(drillRow(name, w, binom(n, dayRate(b, sd)), n)); } }
    const clearOf = (rows, kinds) => buildInsights(rows).filter((i) => kinds.includes(i.kind) && i.evidence === "clear");
    const after3 = clearOf(bench.filter((r) => r.week <= 3), ["benchmark"]);
    const after6 = clearOf(bench, ["benchmark"]);
    const dr = clearOf([...bench, ...drills], ["drill"]);
    if (after3.length) benchStage[0]++; if (after6.length) benchStage[1]++;
    if (after6.length) anyBench++; if (dr.length) anyDrill++;
    if (after6.length || dr.length) any++;
    if ([...after6, ...dr].some((i) => verdictOf(i) < 0)) anyDown++;
    if (after6.some((i) => /since your first/.test(i.headline))) firstOnly++;
  }
  return { sd, withDrills, benchmarkClearAfterWeek3: pc(benchStage[0], TRIALS), benchmarkClearAfterWeek6: pc(anyBench, TRIALS), drillClear: pc(anyDrill, TRIALS), anyClearOnScreen: pc(any, TRIALS), anyClearDecline: pc(anyDown, TRIALS), firstVsLatestClear: pc(firstOnly, TRIALS) };
}
out.screen = [];
for (const sd of [0, 3, 5]) out.screen.push(screen(sd, true));

// ---- S6: how often a real improvement is called clear (the cost of being stricter) ---------------------------------------------
out.s6 = [];
for (const sd of [0, 5]) for (const [p1, p2] of [[0.5, 0.6], [0.5, 0.65], [0.5, 0.7], [0.5, 0.8]]) {
  let clear = 0;
  for (let t = 0; t < TRIALS; t++) {
    const rows = [bmRow("free_throw", 1, binom(30, dayRate(p1, sd)), 30), bmRow("free_throw", 3, binom(30, dayRate(p2, sd)), 30)];
    const ins = buildInsights(rows).find((i) => i.kind === "benchmark" && i.id.startsWith("bm-"));
    if (ins && verdictOf(ins) > 0) clear++;
  }
  out.s6.push({ sd, from: p1, to: p2, calledClear: pc(clear, TRIALS) });
}

// ---- S5: which side the misses were seen on ------------------------------------------------------------------------------------
const shotAt = (seq, made, xBw) => {
  const w = 24, pts = [];
  for (let i = 0; i < 10; i++) pts.push([i * 67, xBw * w, (60 - i * 8) , w, 90]);
  return { v: 1, id: "h" + seq, sessionKey: "k", playerId: "p", seq, made, detectedMade: made, flagged: false, tMs: 0, tracked: true, rim: { x: 0, y: 0 }, scale: 1, ballWidthPx: w, ballWidthSource: "shot", points: pts, gaps: [], events: [], rimHardwareBoxes: 0, rimHardwareNearby: 0, quality: { level: "tracked", reasons: [] }, fingerprint: null, savedAt: 0, bytes: 0 };
};
out.s5 = [];
for (const angle of [0, 15, 30]) for (const meanShortM of [0, 0.15, 0.3]) for (const nMiss of [8, 12, 20, 40]) {
  let strong = 0, towardCamera = 0, other = 0;
  const th = (angle * Math.PI) / 180;
  for (let t = 0; t < TRIALS; t++) {
    const shots = [];
    for (let i = 0; i < 12; i++) shots.push(shotAt(i, true, 0.3 * norm()));
    for (let i = 0; i < nMiss; i++) {
      const lat = 0.24 * norm(), depth = -meanShortM + 0.35 * norm();
      shots.push(shotAt(100 + i, false, (lat * Math.cos(th) + depth * Math.sin(th)) / 0.24));
    }
    const s = summarizePatterns(shots).side;
    if (s && s.strong) { strong++; if (s.lean === "left") towardCamera++; else other++; }
  }
  out.s5.push({ cameraAngleDeg: angle, meanShortM, misses: nMiss, strongLeanShown: pc(strong, TRIALS), leanLeft: pc(towardCamera, TRIALS), leanRight: pc(other, TRIALS) });
}

// Declared "straight behind": the player's idea of straight is not exact. Actual angle ~ N(0, 5 degrees), misses mostly short.
out.s5Behind = [];
for (const nMiss of [8, 12, 20, 40]) {
  let strong = 0;
  for (let t = 0; t < TRIALS; t++) {
    const th = ((5 * norm()) * Math.PI) / 180, shots = [];
    for (let i = 0; i < 12; i++) shots.push(shotAt(i, true, 0.3 * norm()));
    for (let i = 0; i < nMiss; i++) { const lat = 0.24 * norm(), depth = -0.15 + 0.35 * norm(); shots.push(shotAt(100 + i, false, (lat * Math.cos(th) + depth * Math.sin(th)) / 0.24)); }
    const s = summarizePatterns(shots, "behind").side; if (s && s.strong) strong++;
  }
  out.s5Behind.push({ misses: nMiss, strongLeanShown: pc(strong, TRIALS) });
}

// ---- C5: next-step rule cases ----------------------------------------------------------------------------------------------------
const lessonFor = () => null;
const now = new Date(Date.UTC(2026, 9, 20));
const nx = (rows) => { const n = nextAction({ rows, now, benchmarkWorkoutHref: "/w", lessonFor }); return n ? { label: n.label, why: n.why } : null; };
const incomplete = bmRow("free_throw", 3, 12, 20); // 20 of 30 shots: ran, but not a full benchmark
out.nextStep = {
  ranYesterday: nx([bmRow("free_throw", 3, 20, 30), bmRow("catch_and_shoot", 3, 18, 30), bmRow("beat_the_clock", 3, 15, 30)].map((r) => ({ ...r, at: new Date(now.getTime() - 86400000).toISOString() }))),
  incompleteRunOnly: nx([incomplete]),
};
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "results" + (process.env.OUT_SUFFIX ?? "") + ".json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.s1.filter((r) => r.p === 0.5), null, 0));
console.table(out.screen); console.table(out.s6);
console.table(out.s5.filter((r) => r.misses === 20 || r.misses === 8));
console.log(JSON.stringify(out.nextStep, null, 1));
