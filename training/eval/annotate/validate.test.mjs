import { test } from "node:test";
import assert from "node:assert/strict";
import { validate } from "./validate.mjs";

const manifest = { frames: [{ id: "F001" }, { id: "F002" }] };
const ok = { annotator: { id: "x", kind: "y" }, frames: [
  { id: "F001", balls: [{ cx: 100, cy: 100, diameter: 24, visibility: "clear", confidence: "high" }], tags: ["in_flight"] },
  { id: "F002", balls: [], tags: ["no_ball_visible"] },
] };

test("a complete, valid annotation passes", () => assert.deepEqual(validate(manifest, ok), []));
test("a missing frame, an unknown frame and a duplicate are reported", () => {
  const bad = { ...ok, frames: [ok.frames[0], ok.frames[0], { id: "F009", balls: [] }] };
  const p = validate(manifest, bad).join("|");
  assert.match(p, /F001: annotated twice/);
  assert.match(p, /F009: not in the manifest/);
  assert.match(p, /F002: missing/);
});
test("a ball outside the picture, an implausible size or a bad enum is reported", () => {
  const bad = { ...ok, frames: [{ id: "F001", balls: [{ cx: 500, cy: 10, diameter: 200, visibility: "maybe", confidence: "high" }] }, ok.frames[1]] };
  const p = validate(manifest, bad).join("|");
  assert.match(p, /outside the 416/);
  assert.match(p, /not plausible/);
  assert.match(p, /visibility must be/);
});
test("the annotator must be identified", () => assert.ok(validate(manifest, { ...ok, annotator: {} }).length > 0));

test("events need a type, a frame, a visibility and, for a visible rim interaction, a known detail", () => {
  const good = { ...ok, events: [{ clip: "IMG_4874", frame: 100, type: "rim_interaction", visible: true, detail: "swish", outcome_seen: "make", confidence: "high" }, { clip: "IMG_4874", frame: 90, type: "release", visible: false, confidence: "medium" }, { clip: "IMG_4874", frame: 200, type: "no_shot", visible: false, confidence: "high" }] };
  assert.deepEqual(validate(manifest, good), []);
  const bad = { ...ok, events: [{ clip: "IMG_4874", frame: 100, type: "rim_interaction", visible: true, detail: "wobble", outcome_seen: "make", confidence: "high" }, { clip: "x", frame: "y", type: "dunk", confidence: "?" }] };
  const p = validate(manifest, bad).join("|");
  assert.match(p, /detail must be one of/);
  assert.match(p, /type must be one of/);
  assert.match(p, /visible must be true or false/);
});
