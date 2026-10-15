import test from "node:test";
import assert from "node:assert/strict";
import { DEFINITIVE_FAILURES, drillSetLabel, isId, parseContext, parsePending, pendingKey, sameDrill, trackingPath, workoutReturnPath } from "./drill-context.ts";
import { linkedShotSessionIds, buildTrackedMetrics } from "./drill-tracking.ts";
import { parseDraft } from "./shot-draft.ts";

const W = "11111111-1111-4111-8111-111111111111", E = "22222222-2222-4222-8222-222222222222", S = "33333333-3333-4333-8333-333333333333", P = "44444444-4444-4444-8444-444444444444";
const ctx = { workoutSessionId: W, workoutDrillId: E, drillName: "Elbow Pull-Up", variant: "Right side", goal: { kind: "shots" as const, target: 30 } };

test("the way back is built from ids, so it can only ever lead to this player's own workout, on the drill just tracked", () => {
  assert.equal(workoutReturnPath(P, ctx), `/players/${P}/sessions/${W}?tracked=${E}`);
  assert.equal(trackingPath(P, W, E), `/players/${P}/shooting?workout=${W}&entry=${E}`);
  assert.ok(isId(W)); for (const bad of ["", "abc", "../../etc", W + "x", "javascript:alert(1)", null, 5]) assert.ok(!isId(bad as string), String(bad));
  assert.equal(parseContext({ ...ctx, workoutSessionId: "https://evil.example" }), null, "an address is not an id");
});

test("a drill context survives the round trip through the phone's draft, tolerates rubbish, and names the saved set after the drill", () => {
  const draft = parseDraft(JSON.stringify({ v: 1, sessionId: null, label: drillSetLabel(ctx), startedAt: "2026-10-16T10:00:00Z", shots: [], zone: null, context: ctx, rev: 1, syncedRev: 0 }));
  assert.deepEqual(parseContext(draft?.context), ctx); assert.equal(draft?.label, "Elbow Pull-Up · Right side");
  assert.equal(drillSetLabel({ drillName: "Free Throw Reset", variant: null }), "Free Throw Reset"); assert.ok(drillSetLabel({ drillName: "x".repeat(200), variant: "y" }).length <= 60);
  for (const bad of [null, undefined, 5, "x", {}, { ...ctx, drillName: "" }, { ...ctx, workoutDrillId: "nope" }]) assert.equal(parseContext(bad), null);
  assert.deepEqual(parseContext({ ...ctx, goal: { kind: "shots", target: -4 } })?.goal, null, "a bad goal is dropped, not trusted");
  assert.ok(parseDraft(JSON.stringify({ v: 1, sessionId: null, label: "x", startedAt: "2026-10-16T10:00:00Z", shots: [], zone: null, rev: 1, syncedRev: 0 }))?.context === undefined, "an ordinary set has no context");
  assert.ok(sameDrill(ctx, { ...ctx })); assert.ok(!sameDrill(ctx, { ...ctx, workoutDrillId: P })); assert.ok(!sameDrill(null, ctx));
});

test("a result waiting to be attached is only believed for the right player, and only definitive failures drop it", () => {
  const raw = JSON.stringify({ playerId: P, shotSessionId: S, context: ctx });
  assert.equal(parsePending(raw, P)?.shotSessionId, S); assert.equal(parsePending(raw, "other"), null); assert.equal(parsePending("{bad", P), null); assert.equal(parsePending(null, P), null);
  assert.equal(pendingKey(P), `hl:drill-pending:${P}`);
  for (const c of ["no_workout", "closed", "no_entry", "not_trackable", "no_shots", "bad_input"]) assert.ok(DEFINITIVE_FAILURES.has(c)); assert.ok(!DEFINITIVE_FAILURES.has("error"), "a network error is retried");
});

test("shot sets that belong to a workout drill are identified so they are not counted twice as activity", () => {
  const m = buildTrackedMetrics({ drill: { name: "Elbow Pull-Up" }, variant: null, goal: null, shots: [{ made: true, source: "camera", detected_made: true }], shotSessionId: S });
  assert.deepEqual([...linkedShotSessionIds([{ metrics: m }, { metrics: { type: "reps" } }, { metrics: { skipped: true } }, { metrics: null }])], [S]);
});
