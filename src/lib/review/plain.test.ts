import test from "node:test";
import assert from "node:assert/strict";
import { CONFIDENCE, JARGON, plainStatement, MIN_EACH, angleSentence, coverageSentence, crossingSentence, frameStatus, makesVersusMisses, plainMissing, plainReason, plainReasons, shotSummary, type OutcomeRow } from "./plain.ts";
import { assessTrail } from "./quality.ts";
import { buildTrail } from "./trail.ts";
import { fingerprint } from "./fingerprint.ts";
import type { ReviewBox, ReviewRecord } from "./types.ts";

const STEP = 1000 / 15, RIM = { x: 192, y: 190 };
const arcAt = (f: number) => ({ x: 192 + 2 * f, y: 30 + 0.178 * (f + 30) ** 2 });
const box = (x: number, y: number): ReviewBox => ({ x1: x - 12, y1: y - 12, x2: x + 12, y2: y + 12, score: 0.85, occ: false });
function record(drop: (f: number) => boolean = () => false, extra: (f: number) => ReviewBox[] = () => []): ReviewRecord {
  const frames = [];
  for (let t = -1000; t <= 2000; t += STEP) { const f = (t * 29.97) / 1000, boxes: ReviewBox[] = []; if (f >= -29 && f <= 12 && !drop(f)) { const p = arcAt(f); boxes.push(box(p.x, p.y)); } boxes.push(...extra(f)); frames.push({ t, ran: true, boxes }); }
  return { v: 1, shotId: "s", replayId: "s", firstMs: 1000, rim: RIM, scale: 1, frames };
}

test("every reason the analysis can give reads in plain words, with no engineering terms", () => {
  const cases: ReviewRecord[] = [
    record(),
    record((f) => f > -20 && f < -14),                                   // long gap: pieces
    record((f) => f > -9 && f < -7),                                     // one-frame gap: filled in
    record(() => false, (f) => (f > -6 && f < 4 ? [box(arcAt(f).x + 18, arcAt(f).y)] : [])), // second ball close
    record((f) => f > -29, () => []),                                    // almost nothing
    record(() => true, () => []),                                        // nothing
    record(() => true, (f) => (f > -10 && f < 10 ? [{ ...box(RIM.x - 8, RIM.y - 6), occ: true }] : [])), // rim hardware only
  ];
  const seen = new Set<string>();
  for (const r of cases) {
    const trail = buildTrail(r), fp = trail.hasTrail ? fingerprint(trail) : null, q = assessTrail(trail, fp);
    for (const reason of q.reasons) { const p = plainReason(reason); seen.add(`${reason} => ${p}`); assert.ok(!JARGON.test(p), `jargon in: ${p} (from: ${reason})`); assert.notEqual(p, reason, `a known sentence was not rewritten: ${reason}`); }
  }
  assert.ok(seen.size >= 5, `the fixtures should exercise several reasons, got ${seen.size}: ${[...seen].join("\n")}`);
  assert.deepEqual(plainReasons(["No tracking data was kept for this shot.", "No tracking data was kept for this shot."]).length, 1);
});

test("unknown sentences pass through, tidied, and every confidence level and missing-data code is jargon-free", () => {
  assert.equal(plainReason("something new"), "Something new.");
  for (const c of Object.values(CONFIDENCE)) { assert.ok(!JARGON.test(c.label) && !JARGON.test(c.sentence), c.label); }
  for (const k of ["no_observed_descending_crossing", "bracket_too_wide", "fewer_than_3_descending_points_in_band", "band_not_descending", "fewer_than_2_descending_steps", "fewer_than_6_points_before_rim_level", "fewer_than_4_observed_points_after_closest_approach", "no_observed_point_near_rim", "no_closest_approach", "fewer_than_2_observed_points", "flat_vertical_fit", "degenerate_fit", "no_points", "made_up_code", undefined]) { const t = plainMissing(k); assert.ok(t.length > 10 && !JARGON.test(t), String(k)); }
  for (const k of ["none_kept", "hidden", "not_looking", "seen", "estimated", "unclear", "rim_part", "not_seen"] as const) assert.ok(!JARGON.test(frameStatus(k)), k);
});

test("a shot is described by what the camera saw, with the picture's left and right, and never says why it went in", () => {
  assert.match(crossingSentence({ rim_level_x_bw: 0.1 })!, /dead centre/);
  assert.match(crossingSentence({ rim_level_x_bw: 0.6 })!, /0\.6 ball to the right of the rim's centre, as the picture shows it/);
  assert.match(crossingSentence({ rim_level_x_bw: -2.2 })!, /2\.2 balls to the left/);
  assert.equal(crossingSentence({ rim_level_x_bw: null }), null);
  assert.match(angleSentence({ approach_direction_deg: 3 })!, /straight down/);
  assert.match(angleSentence({ approach_direction_deg: -20 })!, /left of the picture/);
  const s = shotSummary({ level: "tracked", m: { rim_level_x_bw: 0.6, approach_direction_deg: 20, rim_interaction_observed: true } });
  assert.ok(!JARGON.test(s) && !/because|should|good form|bad form|better|worse|fix/i.test(s), s);
  assert.equal(shotSummary({ level: "none", m: null }), CONFIDENCE.none.sentence);
  assert.match(shotSummary({ level: "partial", m: { rim_level_x_bw: null } }), /not enough to say where/);
});

const rows = (mk: number[], ms: number[]): OutcomeRow[] => [...mk.map((x) => ({ made: true, level: "tracked" as const, x })), ...ms.map((x) => ({ made: false, level: "tracked" as const, x }))];

test("makes against misses: no numbers below five of each; with enough it still says chance is possible; unreliable paths never count", () => {
  const few = makesVersusMisses(rows([0.2, 0.3, 0.1], [1, 2, 1.5, 1.1, 0.9, 1.2]));
  assert.equal(few.enough, false); assert.equal(few.makes.medianAbs, null); assert.match(few.sentence, /Not enough to compare yet/); assert.match(few.sentence, new RegExp(`at least ${MIN_EACH}`));
  const ok = makesVersusMisses(rows([0.2, 0.3, 0.1, 0.4, 0.25, 0.3], [1, 2, 1.5, 1.1, 0.9]));
  assert.equal(ok.enough, true); assert.ok(Math.abs(ok.makes.medianAbs! - 0.275) < 1e-9); assert.equal(ok.misses.medianAbs, 1.1);
  assert.ok(ok.chance !== null && ok.chance > 0 && ok.chance < 1); assert.match(ok.sentence, /not why/); assert.ok(!JARGON.test(ok.sentence));
  // identical groups: the gap is exactly what shuffling gives, and the sentence must not suggest a pattern
  const same = makesVersusMisses(rows([1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6]));
  assert.ok(same.chance! > 0.9); assert.match(same.sentence, /common by chance/);
  // a large, clean separation is not described as chance
  const big = makesVersusMisses(rows([0.1, 0.2, 0.15, 0.3, 0.25, 0.2, 0.1, 0.3], [2, 2.5, 3, 2.2, 2.8, 3.1, 2.6, 2.4]));
  assert.ok(big.chance! < 0.01); assert.match(big.sentence, /bigger gap than mixing/); assert.ok(!/common by chance/.test(big.sentence));
  assert.equal(makesVersusMisses(rows([0.1, 0.2, 0.15, 0.3, 0.25], [2, 2.5, 3, 2.2, 2.8])).chance, makesVersusMisses(rows([0.1, 0.2, 0.15, 0.3, 0.25], [2, 2.5, 3, 2.2, 2.8])).chance, "deterministic");
  const withBad: OutcomeRow[] = [...rows([0.2, 0.3, 0.1, 0.4, 0.25], [1, 2, 1.5, 1.1]), { made: false, level: "unreliable", x: 0.1 }, { made: false, level: "none", x: null }, { made: false, level: "partial", x: null }];
  const r = makesVersusMisses(withBad); assert.equal(r.misses.n, 4); assert.equal(r.enough, false);
  assert.match(coverageSentence(12, 9, 6), /12 shots: 9 with a path, 6 clear/); assert.match(coverageSentence(3, 0, 0), /none with a saved path/);
});

test("pattern statements are put in everyday words without changing their numbers", () => {
  const raw = "In framing 1 (3 sessions), where the ball was observed at rim height varied by about 0.80 ball widths (spread of 65 shots in 3 sessions; image-horizontal).";
  const p = plainStatement(raw);
  assert.ok(!JARGON.test(p), p); assert.match(p, /^In this camera setup, where the ball was observed/); assert.match(p, /0\.80 ball widths/); assert.match(p, /65 shots in 3 sessions; sideways in the picture/);
  const c = plainStatement("Sessions are grouped when the camera showed the hoop the same size and in the same place. That cannot detect a different camera angle, which changes image-horizontal positions.");
  assert.ok(!JARGON.test(c), c); assert.match(c, /^Sets are grouped/);
  assert.equal(plainStatement("In framing 2 (1 session), the latest"), "In this camera setup, the latest");
});

test("the makes-against-misses sentence never presents a make/miss gap as a finding about technique", () => {
  const s = makesVersusMisses(rows([0.1, 0.2, 0.15, 0.3, 0.25, 0.2], [2, 2.5, 3, 2.2, 2.8, 3.1])).sentence;
  assert.match(s, /Misses are mostly balls that were not over the rim/); assert.match(s, /not why/);
});
