import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeRealSets, totalsOf, type RealSetShot } from "./real-sets.ts";

const session = (id: string, started: string, ended: string | null) => ({
  id,
  player_id: "p",
  started_at: started,
  ended_at: ended,
  label: null,
  attempts: 0,
  makes: 0,
  rule_version: "v4",
  model_version: "ball-6",
  rim_x: 0.5,
  rim_y: 0.3,
  is_test: false,
});

/** A set shaped like the 17:00 set on 2026-10-12: 31 camera shots, 19 called makes, 15 final, 5 ringed, 4 changed. */
function shotsLike(id: string): RealSetShot[] {
  return Array.from({ length: 31 }, (_, i) => {
    const calledMake = i < 19;
    const changed = i < 4; // four of the camera's makes were really misses
    return { session_id: id, source: "camera", made: calledMake && !changed, detected_made: calledMake, flagged: i < 5, added_by_hand: false };
  });
}

test("a set's numbers: ringed, changed in review, and the camera's makes against the final ones", () => {
  const [s] = summarizeRealSets([session("a", "2026-10-12T17:00:00Z", "2026-10-12T17:06:12Z")], shotsLike("a"));
  assert.equal(s.cameraShots, 31);
  assert.equal(s.ringed, 5);
  assert.equal(s.changed, 4);
  assert.equal(s.cameraSaidMakes, 19);
  assert.equal(s.finalMakes, 15);
  assert.equal(s.minutes, 6.2);
});

test("a shot added by hand is counted as added, not as a camera call, and a tap-only shot is never 'changed'", () => {
  const shots: RealSetShot[] = [
    { session_id: "a", source: "camera", made: true, detected_made: true, flagged: false, added_by_hand: false },
    { session_id: "a", source: "manual", made: false, detected_made: null, flagged: false, added_by_hand: true },
  ];
  const [s] = summarizeRealSets([session("a", "2026-10-12T17:00:00Z", null)], shots);
  assert.deepEqual([s.cameraShots, s.addedByHand, s.changed, s.minutes], [1, 1, 0, null]);
});

test("totals add the sets up", () => {
  const sets = summarizeRealSets(
    [session("a", "2026-10-12T17:00:00Z", null), session("b", "2026-10-12T17:08:00Z", null)],
    [...shotsLike("a"), ...shotsLike("b")]
  );
  const t = totalsOf(sets);
  assert.deepEqual([t.sets, t.cameraShots, t.ringed, t.changed, t.cameraSaidMakes, t.finalMakes], [2, 62, 10, 8, 38, 30]);
});
