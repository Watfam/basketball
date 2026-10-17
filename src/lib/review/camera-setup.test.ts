import { test } from "node:test";
import assert from "node:assert/strict";
import { compareSetup, compareShots, framingGroups, loadHistory, parseSession, phonePosition, retainSession, setSessionSetup, validSetup } from "./history-core.ts";
import { memoryBackend } from "./history-memory.ts";
import { syntheticSession } from "./selftest.ts";
import type { CameraSetup, HistorySession } from "./history-types.ts";

const T = 1_760_000_000_000;
const setup = (position: CameraSetup["position"], moved: CameraSetup["moved"] = "no"): CameraSetup => ({ v: 1, position, moved });
const sess = (key: string, s?: CameraSetup | null): HistorySession => ({ v: 1, sessionKey: key, playerId: "p", sessionId: null, label: null, startedAt: "2026-10-01T10:00:00.000Z", savedAt: T, shots: 5, withTracking: 5, framing: { rimX: 0.5, rimY: 0.3, scale: 1, ballWidthPx: 24 }, bytes: 1, setup: s });

test("silence never blocks a comparison; a stated move or a stated difference does", () => {
  assert.equal(compareSetup(undefined, undefined).comparable, true);
  assert.equal(compareSetup(setup("behind"), undefined).comparable, true);
  assert.equal(compareSetup(setup("behind"), setup("unsure")).comparable, true, "not sure is the same as silence");
  assert.equal(compareSetup(setup("behind"), setup("behind")).comparable, true);
  const moved = compareSetup(setup("behind", "yes"), setup("behind"));
  assert.equal(moved.comparable, false); assert.match(moved.reasons[0], /phone moved during one of these sets/);
  const diff = compareSetup(setup("behind"), setup("side"));
  assert.equal(diff.comparable, false); assert.match(diff.reasons[0], /placed differently/);
});

test("sets are grouped by placement as well as by framing, and a set with a moved phone stands alone", () => {
  const g = framingGroups([sess("a", setup("behind")), sess("b"), sess("c", setup("side")), sess("d", setup("behind", "yes"))]);
  assert.deepEqual(g.map((x) => x.map((s) => s.sessionKey)), [["a", "b"], ["c"], ["d"]]);
  assert.equal(framingGroups([sess("a"), sess("b")]).length, 1, "older sets with no answer still group exactly as before");
});

test("two shots from sets with different phone placement are reported as not comparable, with the reason", () => {
  const mk = (key: string) => ({ v: 1 as const, id: `${key}#1`, sessionKey: key, playerId: "p", seq: 1, made: true, detectedMade: true, flagged: false, tMs: 0, tracked: false, rim: null, scale: null, ballWidthPx: null, ballWidthSource: null, points: [], gaps: [], events: [], rimHardwareBoxes: 0, rimHardwareNearby: 0, quality: { level: "none" as const, reasons: [] }, fingerprint: null, savedAt: 0, bytes: 0 });
  const framing = { rimX: 0.5, rimY: 0.3, scale: 1, ballWidthPx: 24 };
  const v = compareShots({ shot: mk("a"), framing, setup: setup("behind") }, { shot: mk("b"), framing, setup: setup("side") });
  assert.equal(v.comparable, false); assert.ok(v.reasons.some((r) => /placed differently/.test(r)));
});

test("what is known about a group's phone place: behind only if every set said so, side if any said so", () => {
  assert.equal(phonePosition([]), "unsure");
  assert.equal(phonePosition([{ setup: setup("behind") }, { setup: setup("behind") }]), "behind");
  assert.equal(phonePosition([{ setup: setup("behind") }, {}]), "unsure");
  assert.equal(phonePosition([{ setup: setup("behind") }, { setup: setup("side") }]), "side");
});

test("the answer is saved with the sets, touches nothing else, survives a reload, and a damaged answer never loses a set", async () => {
  const b = memoryBackend();
  for (const k of ["a", "b"]) await retainSession(b, { ...syntheticSession(4, k, 1), playerId: "p" }, T);
  const before = JSON.stringify([...b.shots.values()]);
  const keys = [...b.sessions.keys()];
  assert.deepEqual(await setSessionSetup(b, [keys[0]], setup("behind", "no")), { updated: 1 });
  assert.equal(JSON.stringify([...b.shots.values()]), before, "no shot row is touched");
  const h = await loadHistory(b, "p");
  assert.equal(h.sessions.find((s) => s.sessionKey === keys[0])!.setup!.position, "behind"); assert.equal(h.sessions.find((s) => s.sessionKey === keys[1])!.setup, undefined);
  assert.deepEqual(await setSessionSetup(b, [keys[0]], { v: 1, position: "nowhere" } as unknown as CameraSetup), { updated: 0 }, "an invalid answer is refused");
  const damaged = { ...sess("z"), setup: { v: 9, position: 5 } };
  const p = parseSession(damaged); assert.ok(p.ok); assert.equal(p.ok && p.value.setup, null);
  assert.equal(validSetup({ v: 1, position: "side", moved: "yes" }), true); assert.equal(validSetup(null), false);
});
