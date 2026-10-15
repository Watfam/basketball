// Preserves the shot-separation test cases from Phase 5 (see KNOWN-ISSUE.md). These are facts about stored results, so they cannot drift silently:
// if a future change regenerates results/diagnostic-all.json and these cases move, this test fails and the change must say why.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const dir = path.dirname(new URL(import.meta.url).pathname);
const d = JSON.parse(fs.readFileSync(path.join(dir, "results/diagnostic-all.json"), "utf8"));

test("case 1: IMG_4872 has two real shots 58 frames apart (3301 and 3359) that the tracked family merges and the shipped grouping keeps apart", () => {
  const t = d.reference.IMG_4872.times; assert.ok(t.includes(3301) && t.includes(3359)); assert.equal(3359 - 3301, 58);
  for (const fps of ["30fps", "15fps"]) {
    assert.equal(d.per_clip.IMG_4872[fps].baseline_legacy.merged_predictions, 0);
    assert.equal(d.per_clip.IMG_4872[fps].tracks.merged_predictions, 1, "the cv_nearest tracked pipeline merges the pair");
    assert.equal(d.per_clip.IMG_4872[fps].tracks.merged_references, 2);
    assert.equal(d.per_clip.IMG_4872[fps].candidate_arrival.merged_predictions, 1, "the Phase-5 candidate did not fix it");
  }
});

test("case 2: IMG_4873 (far shooter, rim-hardware phantoms): the shipped grouping merges 16-17 real shots into 4 predictions; the Kalman round-2 pipeline separates all 22", () => {
  const b30 = d.per_clip.IMG_4873["30fps"], b15 = d.per_clip.IMG_4873["15fps"];
  assert.equal(b30.baseline_legacy.merged_predictions, 4); assert.equal(b30.baseline_legacy.merged_references, 17); assert.equal(b30.baseline_legacy.matched, 5);
  assert.equal(b15.baseline_legacy.merged_predictions, 4); assert.equal(b15.baseline_legacy.merged_references, 16);
  assert.equal(b30.tracks_kalman_round2.matched, 22); assert.equal(b30.tracks_kalman_round2.merged_predictions, 0);
  assert.equal(d.reference.IMG_4873.count, 22);
});

test("case 3: IMG_4851 has one written shot no pipeline finds, so its outcomes are ambiguous and flagged", () => {
  assert.deepEqual(d.ambiguous_clips, ["IMG_4851"]); assert.equal(d.reference.IMG_4851.count, 17); assert.equal(d.reference.IMG_4851.written, 18);
});

test("pooled over eight clips the shipped grouping merges 17 references into 4 predictions and loses none", () => {
  const p = d.pooled["30fps"].baseline_legacy;
  assert.equal(p.merged_predictions, 4); assert.equal(p.merged_references, 17); assert.equal(p.missing, 0); assert.equal(p.references, 177);
});
