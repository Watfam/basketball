import test from "node:test";
import assert from "node:assert/strict";
import { cardDetail, cardEyebrow, countingName, drillName, effectiveLabel, goalName, otherRecent, GOAL_HELP } from "./shoot-setup.ts";

test("the card says what Start will do, in plain words", () => {
  assert.equal(cardDetail({ camera: true, goal: null, six: { pct: 53, sessions: 2 }, name: "Random" }), "Camera · no goal · last 2 sets 53%");
  assert.equal(cardDetail({ camera: false, goal: { kind: "shots", target: 50 }, six: null, name: "" }), "Tap counter · 50 shots");
  assert.equal(cardDetail({ camera: null, goal: { kind: "makes", target: 10 }, six: { pct: 66.7, sessions: 1 }, name: "x" }), "Make 10 · last set 66.7%", "no counting choice shown when the camera switch is off");
  assert.equal(countingName(true), "Camera"); assert.equal(countingName(false), "Tap counter");
  assert.equal(goalName(null), "No goal"); assert.equal(goalName({ kind: "streak", target: 5 }), "5 in a row");
  assert.equal(drillName("  "), "Shooting"); assert.equal(drillName(" Free throws "), "Free throws");
});

test("the drill to go again with: the pick, else the last one used, else none", () => {
  const recent = [{ label: "Random", goal: null }, { label: "Free throws", goal: { kind: "shots" as const, target: 25 } }];
  assert.equal(effectiveLabel(null, recent), "Random");
  assert.equal(effectiveLabel("Mid-range", recent), "Mid-range");
  assert.equal(effectiveLabel("", recent), "", "a player who picked 'no name' keeps it");
  assert.equal(effectiveLabel(null, []), null, "a new player has no drill yet");
});

test("the card's heading follows what the player did", () => {
  assert.equal(cardEyebrow(false, true), "Go again"); assert.equal(cardEyebrow(true, true), "Your setup"); assert.equal(cardEyebrow(false, false), "Your setup");
});

test("recent setups other than the one on the card", () => {
  const recent = [{ label: "Random", goal: null }, { label: "Free throws", goal: { kind: "shots" as const, target: 25 } }, { label: "random", goal: { kind: "shots" as const, target: 50 } }];
  assert.deepEqual(otherRecent(recent, "Random", null).map((r) => r.label), ["Free throws", "random"]);
  assert.equal(otherRecent(recent, "Free throws", { kind: "shots", target: 25 }).length, 2);
  assert.equal(otherRecent([], "x", null).length, 0);
});

test("every goal kind has a plain sentence", () => {
  for (const k of ["shots", "makes", "time", "streak"] as const) assert.match(GOAL_HELP[k], /^Ends /);
});
