import { test } from "node:test";
import assert from "node:assert/strict";
import { analyseGroup, analyseHistory, coverage, INTERPRETATION, lint, spearman, usableShot, BANNED, type Statement } from "./consistency.ts";
import type { HistorySession, HistoryShot } from "./history-types.ts";

function rng(seed: number) { let t = seed >>> 0; return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
const FR = { rimX: 0.5, rimY: 0.3, scale: 1, ballWidthPx: 24 };
const session = (i: number, framing = FR): HistorySession => ({ v: 1, sessionKey: `s${String(i).padStart(2, "0")}`, playerId: "p", sessionId: null, label: null, startedAt: `2026-10-${String(10 + i).padStart(2, "0")}T10:00:00Z`, savedAt: 1, shots: 0, withTracking: 0, framing, bytes: 0 });
function shot(sess: string, seq: number, made: boolean, x: number | null, over: Partial<HistoryShot> = {}): HistoryShot {
  return { v: 1, id: `${sess}#${seq}`, sessionKey: sess, playerId: "p", seq, made, detectedMade: made, flagged: false, tMs: seq * 1000, tracked: x !== null, rim: { x: 192, y: 190 }, scale: 1, ballWidthPx: 24, ballWidthSource: "shot", points: [], gaps: [], events: [], rimHardwareBoxes: 0, rimHardwareNearby: 0, quality: { level: x === null ? "none" : "tracked", reasons: [] }, fingerprint: x === null ? null : { schema: "shot-fingerprint/1", m: { rim_level_x_bw: x }, why: {}, path: {}, usable: true }, savedAt: 1, bytes: 500, ...over };
}
/** n sessions; per session shots drawn by gen(sessionIndex, k, rand) -> [made, x] */
function history(n: number, per: number, gen: (i: number, k: number, r: () => number) => [boolean, number | null], seed = 1, framing = FR) {
  const r = rng(seed), sessions = Array.from({ length: n }, (_, i) => session(i, framing)), shots: HistoryShot[] = [];
  sessions.forEach((s, i) => { for (let k = 0; k < per; k += 1) { const [m, x] = gen(i, k, r); shots.push(shot(s.sessionKey, k + 1, m, x)); } });
  return { sessions, shots };
}
const noise = (r: () => number, sd = 0.3) => (r() + r() + r() - 1.5) * sd * 2;
const get = (st: Statement[], id: string) => st.find((s) => s.id === id)!;

test("makes near the rim centre and misses far from it: supported, with sizes, interval, baseline and the limit sentence", () => {
  const { sessions, shots } = history(3, 16, (_, k, r) => (k % 2 ? [true, noise(r)] : [false, (r() < 0.5 ? -1 : 1) * (1.5 + r())]));
  const st = analyseGroup(sessions, shots, "framing 1"), v = get(st, "V4a");
  assert.equal(v.status, "supported"); assert.deepEqual(v.n, { make: 24, miss: 24 }); assert.ok(v.uncertainty.ci95 && v.uncertainty.ci95.lo > 0 && (v.uncertainty.p_adjusted ?? 1) < 0.05);
  assert.equal(v.interpretation_limit, INTERPRETATION); assert.match(v.comparison_baseline, /makes against its misses/); assert.equal(v.supporting_shot_ids.length, 48); assert.match(v.claim_observation!, /image-horizontal/);
});

test("abstains with the right reason: too few shots, too few sessions for a trend, a null effect, one session only", () => {
  const few = history(1, 6, (_, k, r) => [k % 2 === 0, noise(r)]), s1 = analyseGroup(few.sessions, few.shots, "g");
  assert.equal(get(s1, "V1").reason, "insufficient_n"); assert.equal(get(s1, "V4a").reason, "insufficient_n"); assert.equal(get(s1, "V2").reason, "too_few_sessions"); assert.equal(get(s1, "V3").reason, "too_few_sessions");
  const four = history(4, 12, (_, k, r) => [k % 2 === 0, noise(r)]);
  assert.equal(get(analyseGroup(four.sessions, four.shots, "g"), "V2").reason, "too_few_sessions", "4 sessions cannot reach p < 0.05 by permutation");
  const nul = history(6, 12, (_, k, r) => [r() < 0.5, noise(r)]), st = analyseGroup(nul.sessions, nul.shots, "g");
  assert.ok(st.filter((s) => s.id !== "V1").every((s) => s.status === "abstained"), JSON.stringify(st.map((s) => [s.id, s.status, s.reason])));
});

test("a steady rise in spread across seven sessions is reported as a trend in the OBSERVED position, with the correlation, session count and no claim about technique", () => {
  const { sessions, shots } = history(7, 12, (i, _k, r) => [r() < 0.5, noise(r, 0.1 + 0.5 * i)], 3), v2 = get(analyseGroup(sessions, shots, "framing 1"), "V2");
  assert.equal(v2.status, "supported", JSON.stringify(v2)); assert.equal(v2.sessions, 7); assert.ok(v2.uncertainty.effect! > 0.7); assert.match(v2.claim_observation!, /rose from session to session/);
  assert.doesNotMatch(v2.claim_observation!, BANNED); assert.match(v2.interpretation_limit, /does not identify a cause or show a change in how the shot was taken/);
});

test("the latest session against the earlier ones: a much wider latest session is reported, with an interval around the ratio", () => {
  const { sessions, shots } = history(3, 16, (i, _k, r) => [r() < 0.5, noise(r, i === 2 ? 1.4 : 0.2)], 5), v3 = get(analyseGroup(sessions, shots, "g"), "V3");
  assert.equal(v3.status, "supported", JSON.stringify(v3)); assert.ok(v3.uncertainty.effect! > 1.5 && v3.uncertainty.ci95!.lo > 1); assert.deepEqual(v3.n, { earlier: 32, latest: 16 });
});

test("sessions with different framings are never pooled: each framing is analysed on its own", () => {
  const a = history(2, 16, (_, k, r) => (k % 2 ? [true, noise(r)] : [false, 2 + r()]), 1), b = history(2, 16, (_, k, r) => (k % 2 ? [true, noise(r)] : [false, 2 + r()]), 2, { ...FR, scale: 1.9 });
  const sessB = b.sessions.map((s, i) => ({ ...s, sessionKey: `t${i}`, startedAt: `2026-11-0${i + 1}T10:00:00Z` })), shotsB = b.shots.map((s) => ({ ...s, sessionKey: s.sessionKey === "s00" ? "t0" : "t1", id: `t-${s.id}` }));
  const out = analyseHistory([...a.sessions, ...sessB], [...a.shots, ...shotsB]);
  assert.equal(out.groups.length, 2); assert.ok(out.groups.every((g) => g.sessions.length === 2)); assert.ok(out.groups.flatMap((g) => g.statements).every((s) => s.n.make === undefined || s.n.make <= 16));
});

test("only usable shots count: untracked, unreliable and unmeasurable shots are excluded and the availability is reported", () => {
  assert.equal(usableShot(shot("s", 1, true, null)), null); assert.equal(usableShot(shot("s", 1, true, 0.2, { quality: { level: "unreliable", reasons: [] } })), null);
  assert.equal(usableShot(shot("s", 1, true, 0.2, { fingerprint: { schema: "shot-fingerprint/1", m: { rim_level_x_bw: null }, why: {}, path: {}, usable: true } })), null);
  assert.equal(usableShot(shot("s", 1, true, 0.2, { fingerprint: { schema: "shot-fingerprint/1", m: { rim_level_x_bw: 0.2 }, why: {}, path: {}, usable: false } })), null);
  assert.equal(usableShot(shot("s", 1, true, 0.2)), 0.2);
  const { sessions, shots } = history(1, 20, (_, k, r) => (k < 8 ? [true, null] : [false, noise(r)])), cov = coverage(sessions, shots)[0];
  assert.equal(cov.shots, 20); assert.equal(cov.withMeasure, 12); assert.equal(cov.availability, 0.6); assert.equal(cov.quality.none, 8);
  assert.equal(get(analyseGroup(sessions, shots, "g"), "V1").measurement_quality.availability, 0.6);
});

test("placebo: with outcomes shuffled across shots, and session order shuffled, supported statements stay rare (false-claim rate under 10%)", () => {
  const { sessions, shots } = history(6, 14, (_, _k, r) => [r() < 0.5, noise(r)], 9);
  let claims = 0; const runs = 120, r = rng(77);
  for (let t = 0; t < runs; t += 1) {
    const labels = shots.map((s) => s.made); for (let i = labels.length - 1; i > 0; i -= 1) { const j = Math.floor(r() * (i + 1)); [labels[i], labels[j]] = [labels[j], labels[i]]; }
    const shuffled = shots.map((s, i) => ({ ...s, made: labels[i] })), st = analyseGroup(sessions, shuffled, `g${t}`).filter((s) => s.id !== "V1");
    if (st.some((s) => s.status === "supported")) claims += 1;
  }
  assert.ok(claims / runs <= 0.1, `false-claim rate ${claims}/${runs}`);
});

test("language lint: mechanical or evaluative words and bare left/right are rejected; determinism holds", () => {
  const bad = (text: string): Statement => ({ id: "V1", status: "abstained", group: "g", claim_observation: text, interpretation_limit: INTERPRETATION, supporting_shot_ids: [], measurement: "rim_level_x_bw", n: {}, sessions: 1, measurement_quality: { shots_in_group: 0, with_measurement: 0, availability: 0 }, uncertainty: { effect: null, ci95: null, p: null, p_adjusted: null }, comparison_baseline: "", caution: "" });
  for (const t of ["your form improved", "better release", "the ball went left", "fix your elbow", "a worse session"]) assert.throws(() => lint(bad(t)), t);
  assert.ok(Math.abs(spearman([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]) - 1) < 1e-9);
  const h = history(3, 16, (_, k, r) => (k % 2 ? [true, noise(r)] : [false, 2 + r()]), 4);
  assert.equal(JSON.stringify(analyseGroup(h.sessions, h.shots, "g")), JSON.stringify(analyseGroup(h.sessions, h.shots, "g")));
});
