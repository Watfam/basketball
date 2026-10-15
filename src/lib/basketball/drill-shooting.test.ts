import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CATEGORY_LABELS, CATEGORY_ORDER, WHAT_IS_MEASURED, shootingProfile, spotOf, trackingGoal } from "./drill-shooting.ts";

const SEEDS = path.join(import.meta.dirname, "../../../supabase");
/** Every drill row written in the seed SQL: name, description, skill tags. The real definitions, not a copy. */
function seedDrills() {
  const out = new Map<string, { name: string; skill_tags: string[]; description: string }>();
  for (const f of fs.readdirSync(SEEDS).filter((x) => x.startsWith("seed_") && x.endsWith(".sql"))) {
    const s = fs.readFileSync(path.join(SEEDS, f), "utf8");
    const re = /\(\s*(?:'((?:[^']|'')+)'|\$\$([\s\S]*?)\$\$)\s*,\s*(?:'((?:[^']|'')*)'|\$\$([\s\S]*?)\$\$)\s*,\s*array\[([^\]]*)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) { const name = (m[1] ?? m[2]).replace(/''/g, "'"); if (!out.has(name)) out.set(name, { name, description: (m[3] ?? m[4] ?? "").replace(/''/g, "'"), skill_tags: m[5].replace(/'/g, "").split(",").map((x) => x.trim()).filter(Boolean) }); }
  }
  return out;
}

test("every shooting drill that is actually written in the seeds has a hand-written profile, and the mapping is what the drill says it is", () => {
  const drills = seedDrills();
  const shooting = [...drills.values()].filter((d) => d.skill_tags.includes("shooting") && !/^Six-Week/.test(d.name));
  assert.ok(shooting.length >= 8, `found ${shooting.length} shooting drills in the seeds`);
  for (const d of shooting) assert.equal(shootingProfile(d).basis, "defined", `${d.name} needs an explicit entry`);
  const cat = (n: string) => shootingProfile(drills.get(n)).category;
  assert.equal(cat("Elbow Pull-Up"), "off_the_dribble");
  assert.equal(cat("Wing Step-Back"), "off_the_dribble");
  assert.equal(cat("Off-the-Dribble Pull-Up Series"), "off_the_dribble");
  assert.equal(cat("Catch-and-Shoot off the Pin-Down"), "catch_and_shoot");
  assert.equal(cat("Free Throw Reset"), "stationary");
  assert.equal(cat("Beat the Clock Finisher"), "pressure_challenge");
});

test("which drills are offered the camera: counting must mean something", () => {
  const drills = seedDrills(), t = (n: string) => shootingProfile(drills.get(n)).trackable;
  for (const n of ["Elbow Pull-Up", "Wing Step-Back", "Off-the-Dribble Pull-Up Series", "Catch-and-Shoot off the Pin-Down", "Free Throw Reset", "Beat the Clock Finisher"]) assert.equal(t(n), true, n);
  for (const n of ["One-Hand Form Shooting", "Form Shooting Progression", "Big Man Post-Up Footwork", "Pound Dribble Series", "Attack Cone Series"]) assert.equal(t(n), false, n);
  assert.match(shootingProfile(drills.get("One-Hand Form Shooting")).why, /mechanics/);
  assert.equal(shootingProfile(drills.get("Pound Dribble Series")).category, null, "a ball-handling drill has no shooting category");
});

test("nothing is claimed for categories no existing drill belongs to", () => {
  const used = new Set([...seedDrills().values()].map((d) => shootingProfile(d).category).filter(Boolean));
  for (const empty of ["movement", "change_of_direction", "decision"] as const) assert.ok(!used.has(empty), `${empty} has members now: update the report`);
  assert.deepEqual(CATEGORY_ORDER.length, 7); for (const c of CATEGORY_ORDER) assert.ok(CATEGORY_LABELS[c]);
});

test("a new drill with no entry is only trusted when it is tagged shooting and its name is clear; its basis says so", () => {
  const p = shootingProfile({ name: "Corner Catch-and-Shoot Series", skill_tags: ["shooting"] });
  assert.deepEqual([p.category, p.trackable, p.basis], ["catch_and_shoot", true, "keyword"]);
  assert.equal(shootingProfile({ name: "Corner Catch-and-Shoot Series", skill_tags: ["conditioning"] }).trackable, false, "the shooting tag is required");
  assert.equal(shootingProfile({ name: "Mystery Shooting Game", skill_tags: ["shooting"] }).trackable, false);
  assert.equal(shootingProfile({ name: "Lateral Form Shooting", skill_tags: ["shooting"] }).trackable, false, "form work is never offered");
  assert.equal(shootingProfile(null).trackable, false); assert.equal(shootingProfile(undefined).category, null);
});

test("the spot comes from the variant label and drill name, only for deciding what can be compared", () => {
  assert.deepEqual(spotOf("Catch-and-Shoot off the Pin-Down", "Right wing"), { family: "wing", side: "right" });
  assert.deepEqual(spotOf("Wing Step-Back", "Left wing"), { family: "wing", side: "left" });
  assert.deepEqual(spotOf("Elbow Pull-Up", "Right side"), { family: "elbow", side: "right" });
  assert.deepEqual(spotOf("Elbow Pull-Up", "Wing, off 2 dribbles"), { family: "wing", side: null });
  assert.deepEqual(spotOf("Beat the Clock Finisher", "Elbow, either side"), { family: "elbow", side: null });
  assert.deepEqual(spotOf("Beat the Clock Finisher", "Free throw line"), { family: "free_throw_line", side: null });
  assert.deepEqual(spotOf("Beat the Clock Finisher", "Three-point line"), { family: "three_point_line", side: null });
  assert.deepEqual(spotOf("Free Throw Reset", null), { family: "free_throw_line", side: null });
  assert.equal(spotOf("Something", null).family, "unspecified");
});

test("the goal comes from the drill's own prescription", () => {
  assert.deepEqual(trackingGoal({ sets: 3, reps: 10, durationSeconds: null }), { kind: "shots", target: 30 });
  assert.deepEqual(trackingGoal({ sets: 2, reps: 2, durationSeconds: null }), { kind: "shots", target: 4 });
  assert.deepEqual(trackingGoal({ sets: null, reps: null, durationSeconds: 90 }), { kind: "time", target: 90 });
  assert.deepEqual(trackingGoal({ sets: null, reps: 12, durationSeconds: null }), { kind: "shots", target: 12 });
  assert.equal(trackingGoal({ sets: null, reps: null, durationSeconds: null }), null);
  assert.equal(trackingGoal({ sets: 50, reps: 50, durationSeconds: null })!.target, 300, "capped at what a set can hold");
});

test("what is and is not measured is stated, and nothing unvalidated is claimed", () => {
  const by = Object.fromEntries(WHAT_IS_MEASURED.map((m) => [m.id, m.source]));
  assert.equal(by.attempts_makes, "camera"); assert.equal(by.corrections, "player"); assert.equal(by.kind_of_shot, "drill_definition"); assert.equal(by.clock, "timer");
  for (const id of ["footwork", "game_speed", "defender", "decision", "spot", "who"]) assert.equal(by[id], "not_measured", id);
  assert.match(WHAT_IS_MEASURED.find((m) => m.id === "defender")!.detail, /clock, not a defender/);
});
