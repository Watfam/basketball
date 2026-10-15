import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { REPLAY_CRITERIA, judgeReplay, runReplayTest, type ReplayReport } from "./replaytest.ts";
import { LIVE_ONLY } from "./phonetest.ts";
import { loadHistory, retainSession, usage } from "./history-core.ts";
import { memoryBackend } from "./history-memory.ts";
import { syntheticSession } from "./selftest.ts";

const crit = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "../../../training/eval/experiments/iphone-readiness/criteria-replay.json"), "utf8"));
const T = 5_000_000;
const fakeCtx = () => new Proxy({}, { get: () => () => undefined, set: () => true }) as unknown as CanvasRenderingContext2D;

test("replay criteria in code equal the criteria registered first; the live-only list equals the registered list", () => {
  assert.equal(crit.checks.R2_read.limit_ms, REPLAY_CRITERIA.readMs); assert.equal(crit.checks.R3_draw.limit_p95_ms, REPLAY_CRITERIA.drawP95Ms);
  assert.equal(crit.checks.R4_analyse.limit_ms, REPLAY_CRITERIA.analyseMs); assert.equal(crit.checks.R7_clips.limit_p95_ms, REPLAY_CRITERIA.clipFrameP95Ms);
  assert.match(crit.what_a_replay_can_and_cannot_show.synthetic, /fewer than 20 shots/); assert.equal(REPLAY_CRITERIA.minRealShots, 20);
  assert.equal(new Set(LIVE_ONLY.map((l) => l.id)).size, 8);
  for (const l of LIVE_ONLY) assert.ok(l.how.length > 20 && l.why.length > 20, l.id);
  const listed = crit.live_only_list as string; assert.ok(/counting speed/.test(listed) && /counted shots equal/.test(listed) && /battery and heat/.test(listed) && /paths captured/.test(listed) && /clips saved by the live camera/.test(listed) && /storage surviving days/.test(listed) && /Home Screen/.test(listed) && /hand-held/.test(listed));
});

test("with too little saved history the test uses made-up data, says so on every row, and never gives a plain pass", async () => {
  const real = memoryBackend(); await retainSession(real, { ...syntheticSession(5, "x", 1), playerId: "p" }, T);
  const before = JSON.stringify([...real.sessions.values(), ...real.shots.values()]);
  const r = await runReplayTest(real, () => {}, { canvas: fakeCtx, now: T });
  assert.equal(r.source, "synthetic"); assert.equal(r.realStoreUnchanged, true);
  assert.equal(JSON.stringify([...real.sessions.values(), ...real.shots.values()]), before, "the real store is byte-identical");
  const checks = judgeReplay(r);
  assert.ok(checks.every((c) => c.label.startsWith("Replayed data:")));
  for (const c of checks) assert.ok(c.verdict !== "pass", `${c.id} must not be a plain pass on made-up data`);
  // The logic checks must pass; the timing checks depend on how busy the machine is, so they may be pass_synthetic or fail but never a plain pass.
  for (const id of ["R5_roundtrip", "R6_delete", "R8_nowrite"]) assert.equal(checks.find((c) => c.id === id)!.verdict, "pass_synthetic", id);
  assert.ok(checks.filter((c) => c.id !== "R7_clips").every((c) => c.value.includes("made-up")), JSON.stringify(checks.map((c) => [c.id, c.verdict])));
  assert.equal(checks.find((c) => c.id === "R7_clips")!.verdict, "not_measured");
});

test("with enough real saved paths it replays them, checks the round trip and delete-undo in a copy, and leaves the real store alone", async () => {
  const real = memoryBackend();
  for (let i = 1; i <= 3; i += 1) await retainSession(real, { ...syntheticSession(30, `real:${i}`, i), playerId: "kid", sessionKey: `kid:${i}`, label: `set ${i}` }, T);
  const u0 = await usage(real); assert.ok(u0.shots >= 90);
  const r = await runReplayTest(real, () => {}, { canvas: fakeCtx, now: T, clips: { ids: async () => ["a"], frames: async () => [{ t: 0, blob: new Blob(["x"]) }, { t: 66, blob: new Blob(["y"]) }], decode: async () => undefined } });
  assert.equal(r.source, "real"); assert.equal(r.data.sessions, 3); assert.ok(r.data.withPath >= 80);
  assert.equal(r.roundtrip.ok, true, r.roundtrip.detail); assert.equal(r.delete.ok, true, r.delete.detail); assert.equal(r.realStoreUnchanged, true);
  assert.deepEqual(r.clips && [r.clips.n, r.clips.frames], [1, 2]);
  const checks = judgeReplay(r);
  for (const id of ["R5_roundtrip", "R6_delete", "R7_clips", "R8_nowrite"]) assert.equal(checks.find((c) => c.id === id)!.verdict, "pass", id);
  assert.ok(checks.every((c) => c.verdict === "pass" || c.verdict === "fail"), "real data is never labelled synthetic or unmeasured here");
  assert.equal((await loadHistory(real)).shots.length, u0.shots);
});

test("a failing round trip or a changed real store is reported as a failure", () => {
  const base: ReplayReport = { v: 1 as const, at: "x", userAgent: "t", source: "real" as const, data: { sessions: 1, shots: 30, withPath: 30 }, read_ms: 5, draw: { n: 30, p95_ms: 1, median_ms: 1 }, analyse_ms: 5, roundtrip: { ok: true, detail: "" }, delete: { ok: true, detail: "" }, clips: null, realStoreUnchanged: true, totalMs: 1 };
  const v = (r: ReplayReport) => Object.fromEntries(judgeReplay(r).map((c) => [c.id, c.verdict]));
  assert.equal(v({ ...base, roundtrip: { ok: false, detail: "x" } }).R5_roundtrip, "fail");
  assert.equal(v({ ...base, delete: { ok: false, detail: "x" } }).R6_delete, "fail");
  assert.equal(v({ ...base, realStoreUnchanged: false }).R8_nowrite, "fail");
  assert.equal(v({ ...base, read_ms: 4000 }).R2_read, "fail"); assert.equal(v({ ...base, analyse_ms: 4000 }).R4_analyse, "fail");
  assert.equal(v({ ...base, draw: { n: 3, p95_ms: 90, median_ms: 50 } }).R3_draw, "fail");
  assert.equal(v({ ...base, draw: null }).R3_draw, "not_measured");
});
