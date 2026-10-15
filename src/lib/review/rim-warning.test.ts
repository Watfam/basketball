import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { K_MIN, RIM_RADIUS, RIM_WARNING_KEY, RIM_WARNING_TEXT, RIM_WARNING_THRESHOLDS, assessRimReading, rimWarningEnabled, shotRimShare } from "./rim-warning.ts";
import { JARGON } from "./plain.ts";
import type { ReviewBox, ReviewRecord } from "./types.ts";

const ROOT = path.join(import.meta.dirname, "../../..");
const RIM = { x: 192, y: 190 };
const box = (dx: number, dy: number, occ: boolean): ReviewBox => ({ x1: RIM.x + dx - 6, y1: RIM.y + dy - 6, x2: RIM.x + dx + 6, y2: RIM.y + dy + 6, score: 0.5, occ });
/** A record of 45 looked-at frames; `flagged` of them carry a flagged box at (dx, dy) from the rim. */
function rec(id: string, flagged: number, { dx = -12, dy = 2, ran = 45, occ = true }: { dx?: number; dy?: number; ran?: number; occ?: boolean } = {}): ReviewRecord {
  const frames = Array.from({ length: ran }, (_, i) => ({ t: -1000 + i * 66, ran: true, boxes: i < flagged ? [box(dx, dy, occ)] : [] }));
  return { v: 1, shotId: id, replayId: id, firstMs: 1000, rim: RIM, scale: 1, frames };
}
const deepFreeze = <T,>(o: T): T => { if (o && typeof o === "object") { Object.freeze(o); for (const v of Object.values(o as object)) deepFreeze(v); } return o; };

test("thresholds in the code equal the ones derived from the development clips and frozen before evaluation", () => {
  const th = JSON.parse(fs.readFileSync(path.join(ROOT, "training/eval/experiments/rim-warning/thresholds.json"), "utf8"));
  assert.deepEqual(RIM_WARNING_THRESHOLDS, { tShot: th.tShot, tFrac: th.tFrac });
  const crit = JSON.parse(fs.readFileSync(path.join(ROOT, "training/eval/experiments/rim-warning/criteria.json"), "utf8"));
  assert.match(crit.statistic.per_record, /RIM_RADIUS = 60/); assert.equal(RIM_RADIUS, 60); assert.match(crit.statistic.set_rule, /K_MIN = 2/); assert.equal(K_MIN, 2);
});

test("the share is the fraction of looked-at frames with a flagged box near the rim; far boxes, unflagged boxes and skipped frames do not count", () => {
  assert.equal(shotRimShare(rec("a", 0)), 0); assert.equal(shotRimShare(rec("a", 45)), 1); assert.ok(Math.abs(shotRimShare(rec("a", 9))! - 0.2) < 1e-9);
  assert.equal(shotRimShare(rec("far", 45, { dx: 200 })), 0, "a flagged box far from the rim is not the rim effect");
  assert.equal(shotRimShare(rec("plain", 45, { occ: false })), 0, "an unflagged ball is just a ball");
  const skipped = rec("s", 10); for (let i = 20; i < 45; i += 1) skipped.frames[i].ran = false;
  assert.ok(Math.abs(shotRimShare(skipped)! - 10 / 20) < 1e-9, "frames the camera did not look at are not in the denominator");
  assert.equal(shotRimShare({ ...rec("e", 0), frames: [] }), null, "a record with no looked-at frames has no share");
});

test("the set rule: needs at least two affected shots AND a big enough share of the set; empty records are not guessed at", () => {
  const th = { tShot: 0.25, tFrac: 0.2 };
  const clean = Array.from({ length: 10 }, (_, i) => rec(`c${i}`, 0));
  assert.deepEqual(assessRimReading([], th).reason, "no_records");
  assert.equal(assessRimReading(clean, th).warn, false);
  assert.equal(assessRimReading([rec("x", 30), ...clean], th).reason, "too_few_affected");
  assert.equal(assessRimReading([rec("x", 30), rec("y", 30), ...clean, ...Array.from({ length: 10 }, (_, i) => rec(`d${i}`, 0))], th).reason, "affected_share_too_small");
  const w = assessRimReading([rec("x", 30), rec("y", 20), ...clean.slice(0, 6)], th);
  assert.equal(w.warn, true); assert.deepEqual(w.affected.map((a) => a.shotId), ["x", "y"]); assert.equal(w.measured, 8);
  assert.equal(assessRimReading([rec("x", 30), rec("y", 20), ...clean.slice(0, 6), { ...rec("e", 0), frames: [] }], th).measured, 8, "an empty record is neither measured nor counted as affected");
  assert.equal(assessRimReading([rec("x", 30), rec("y", 30)], null).reason, "thresholds_not_set");
  assert.equal(assessRimReading([rec("x", 9), rec("y", 9)], { tShot: 0.25, tFrac: 0.2 }).warn, false, "20% is below the 25% shot threshold");
});

test("it is display only: a pure function that cannot change records, shots, counts or detections", () => {
  const records = deepFreeze([rec("x", 30), rec("y", 30), rec("z", 0)]);
  const before = JSON.stringify(records);
  const a = assessRimReading(records, { tShot: 0.25, tFrac: 0.2 }); // would throw in strict mode if it tried to write to a frozen input
  assert.equal(JSON.stringify(records), before); assert.equal(a.warn, true);
  assert.equal(JSON.stringify(assessRimReading(records, { tShot: 0.25, tFrac: 0.2 })), JSON.stringify(a), "deterministic");
});

test("the flag is off unless storage holds '1' for the warning AND shot review is on", () => {
  const store = (o: Record<string, string>) => (k: string) => o[k] ?? null;
  assert.equal(rimWarningEnabled(store({})), false);
  assert.equal(rimWarningEnabled(store({ [RIM_WARNING_KEY]: "1" })), false, "needs shot review on, which supplies the records");
  assert.equal(rimWarningEnabled(store({ "hl:session-review": "1" })), false);
  assert.equal(rimWarningEnabled(store({ "hl:session-review": "1", [RIM_WARNING_KEY]: "true" })), false);
  assert.equal(rimWarningEnabled(store({ "hl:session-review": "1", [RIM_WARNING_KEY]: "1" })), true);
  assert.equal(rimWarningEnabled(() => { throw new Error("storage blocked"); }), false);
});

test("static: nothing in the counting path imports or depends on the warning, and with the flag off the entry never reads records or assesses", () => {
  const vision = path.join(ROOT, "src/lib/vision");
  for (const f of fs.readdirSync(vision)) { if (!f.endsWith(".ts")) continue; const src = fs.readFileSync(path.join(vision, f), "utf8"); assert.ok(!/rim-warning|rimWarning|RimWarning/.test(src), `${f} must not know about the warning`); }
  for (const f of ["use-camera-counter.ts"]) assert.ok(!/rim-warning/.test(fs.readFileSync(path.join(vision, f), "utf8")));
  const entry = fs.readFileSync(path.join(ROOT, "src/components/session-review-entry.tsx"), "utf8");
  const effect = entry.slice(entry.indexOf("useEffect(() => {"), entry.indexOf("}, [rimOn, on, key]"));
  assert.match(effect, /if \(!rimOn \|\| !on \|\| shots\.length === 0\) return;/, "the effect returns before reading anything when the flag is off");
  assert.ok(effect.indexOf("if (!rimOn") < effect.indexOf("getReviewRecords") && effect.indexOf("if (!rimOn") < effect.indexOf("assessRimReading"));
  const mod = fs.readFileSync(path.join(ROOT, "src/lib/review/rim-warning.ts"), "utf8");
  assert.ok(!/localStorage\.setItem|indexedDB|fetch\(|saveReviewRecord|retainSession|\.push\(|\.splice\(|\.sort\(/.test(mod), "the module has no write path");
  const banner = fs.readFileSync(path.join(ROOT, "src/components/rim-warning-banner.tsx"), "utf8");
  assert.ok(!/save|delete|retain|setFlag|localStorage/i.test(banner.replace(/aria-label="[^"]*"/g, "")), "the banner only displays");
});

test("the words are plain, claim no verified cause, and say nothing was changed", () => {
  const all = `${RIM_WARNING_TEXT.headline} ${RIM_WARNING_TEXT.body}`;
  assert.ok(!JARGON.test(all), all); assert.match(all, /may be reading part of the rim/); assert.match(all, /could be low/); assert.match(all, /Nothing has been changed/); assert.match(all, /add any missed shot by hand/);
  assert.ok(!/because|caused|the model|detector|phantom/i.test(all));
});

test("the stored evaluation matches what the report says (registered criteria, frozen thresholds, not independent validation)", () => {
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, "training/eval/experiments/rim-warning/results.json"), "utf8"));
  assert.deepEqual(r.thresholds, { tShot: 0.25, tFrac: 0.2 }); assert.match(r.caveat, /NOT independent validation/);
  assert.equal(r.summary.C1_false_warnings_whole_clips.k, 0); assert.equal(r.summary.C1_false_warnings_whole_clips.n, 7);
  assert.equal(r.summary.C2_missed_warning_IMG_4873.warned, true);
  assert.equal(r.summary.C3_shot_level.pass, false, "C3 failed and is reported as failed");
  assert.equal(r.summary.C3_shot_level.phantom_clip.k, 2); assert.equal(r.summary.C3_shot_level.phantom_clip.n, 3);
});
