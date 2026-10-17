import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { BENCHMARKS, BENCHMARK_HONESTY, BENCHMARK_WEEKS, BENCHMARK_WORKOUT_NAME, benchmarkForEntry, benchmarkGoal, checkConditions, conditionsKey, describeConditions, isBenchmarkLabel, protocolFromId, protocolId } from "./benchmarks.ts";
import { drillSetLabel } from "./drill-context.ts";
import { shootingProfile, trackingGoal } from "./drill-shooting.ts";
import { resolvePrescription } from "./prescription.ts";

const SQL = path.join(import.meta.dirname, "../../../supabase");
const read = (f: string) => fs.readFileSync(path.join(SQL, f), "utf8");
const $hl = (s: string) => [...s.matchAll(/\$hl\$([\s\S]*?)\$hl\$/g)].map((m) => m[1]);

// Pinned fingerprints: changing ANY text or number of a protocol changes its hash. A protocol that has been used can only change by becoming a new version.
const PINNED: Record<string, string> = { "free_throw@v1": "0f363d42e8a77134", "catch_and_shoot@v1": "cc96800910ab8a52", "beat_the_clock@v1": "13011441c30ca571" };

test("three protocols, each one fixed attempts or one fixed clock, each a variation of a real shooting drill", () => {
  assert.deepEqual(BENCHMARKS.map((b) => b.key), ["free_throw", "catch_and_shoot", "beat_the_clock"]);
  for (const b of BENCHMARKS) {
    assert.equal(Number(b.attempts !== null) + Number(b.clockSeconds !== null), 1, `${b.key}: exactly one of attempts or clock`);
    const profile = shootingProfile({ name: b.drillName, skill_tags: ["shooting"] });
    assert.ok(profile.trackable && profile.basis === "defined", `${b.drillName} is a defined, trackable drill`);
    assert.equal(profile.category, b.category, `${b.key}: the benchmark keeps its drill's skill category`);
    assert.match(b.variantLabel, new RegExp(`^Benchmark v${b.version}\\b`), "the label says it is a benchmark and which version");
    assert.ok(b.instructions.length >= 5 && b.spot.length > 10 && b.difficulty.length > 5);
    assert.ok(drillSetLabel({ drillName: b.drillName, variant: b.variantLabel }).length <= 60, `${b.key}: the shot set label is not cut off`);
    // The workout entry's prescription IS the protocol.
    const shots = b.entry.sets && b.entry.reps ? b.entry.sets * b.entry.reps : null;
    assert.equal(shots, b.attempts, `${b.key}: sets x reps equals the attempts`);
    assert.equal(b.entry.seconds, b.clockSeconds);
  }
  const ids = BENCHMARKS.map(protocolId);
  assert.deepEqual(ids, ["free_throw@v1", "catch_and_shoot@v1", "beat_the_clock@v1"]);
  assert.equal(new Set(ids).size, 3);
});

test("the catch-and-shoot benchmark states the one condition that changes its meaning; the others have none", () => {
  const cs = protocolFromId("catch_and_shoot@v1")!;
  assert.deepEqual(cs.conditions.map((c) => c.key), ["pass_from"]);
  assert.ok(BENCHMARKS.filter((b) => b.key !== "catch_and_shoot").every((b) => b.conditions.length === 0));
  assert.deepEqual(checkConditions(cs, { pass_from: "partner" }), { conditions: { pass_from: "partner" }, complete: true });
  assert.deepEqual(checkConditions(cs, { pass_from: "robot" }), { conditions: null, complete: false }, "an unknown answer is refused, not guessed");
  assert.deepEqual(checkConditions(cs, null), { conditions: null, complete: false });
  assert.deepEqual(checkConditions(cs, { pass_from: "self", extra: "x" }), { conditions: { pass_from: "self" }, complete: true });
  assert.deepEqual(checkConditions(BENCHMARKS[0], { anything: "x" }), { conditions: null, complete: true });
  assert.equal(conditionsKey({ b: "2", a: "1" }), "a=1&b=2");
  assert.equal(describeConditions(cs, { pass_from: "partner" }), "A partner");
  assert.equal(describeConditions(cs, null), "conditions not recorded");
});

test("an entry is a benchmark only when drill, label and prescription are exactly the protocol", () => {
  const ft = BENCHMARKS[0];
  const exact = { drillName: ft.drillName, variantLabel: ft.variantLabel, sets: 3, reps: 10, seconds: null };
  assert.equal(benchmarkForEntry(exact)?.key, "free_throw");
  assert.equal(benchmarkForEntry({ ...exact, reps: 12 }), null, "an edited prescription is just a drill");
  assert.equal(benchmarkForEntry({ ...exact, drillName: "Elbow Pull-Up" }), null);
  assert.equal(benchmarkForEntry({ ...exact, variantLabel: "Benchmark v2" }), null, "an unknown version is not this benchmark");
  assert.equal(benchmarkForEntry({ ...exact, variantLabel: null }), null);
  assert.equal(benchmarkForEntry({ ...exact, levels: ["advanced"] }), null, "a level-specific entry is not the same test for everyone");
  assert.equal(benchmarkForEntry({ ...exact, levelTargets: { beginner: { sets: 1, reps: 1 } } }), null);
  assert.equal(benchmarkForEntry({ drillName: "Free Throw Reset", variantLabel: null, sets: 2, reps: 2, seconds: null }), null, "the ordinary drill is untouched");
  assert.equal(isBenchmarkLabel("Benchmark v1 · both wings"), true);
  assert.equal(isBenchmarkLabel("Right wing"), false);
  assert.deepEqual(benchmarkGoal(BENCHMARKS[2]), { kind: "time", target: 90 });
  assert.deepEqual(benchmarkGoal(BENCHMARKS[1]), { kind: "shots", target: 30 });
});

test("a benchmark is never stepped up by the program week or scaled by level; every other entry still is", () => {
  for (const b of BENCHMARKS) {
    const entry = { id: "e", drill_id: "d", sort_order: 1, block: b.entry.block, variant_label: b.variantLabel, levels: [], level_targets: { advanced: { sets: 9, reps: 9 } }, target_sets: b.entry.sets, target_reps: b.entry.reps, target_duration_seconds: b.entry.seconds };
    const want = { sets: b.entry.sets, reps: b.entry.reps, durationSeconds: b.entry.seconds };
    for (const level of ["beginner", "intermediate", "advanced"] as const) for (const step of [-1, 0, 2, 4]) assert.deepEqual(resolvePrescription(entry, level, step), want, `${b.key} ${level} step ${step}`);
    assert.deepEqual(trackingGoal(resolvePrescription(entry, "advanced", 4)), { kind: b.attempts ? "shots" : "time", target: b.attempts ?? b.clockSeconds! });
  }
  const normal = { id: "e", drill_id: "d", sort_order: 1, block: "main", variant_label: "Right wing", levels: [], level_targets: {}, target_sets: 3, target_reps: 10, target_duration_seconds: null };
  assert.equal(resolvePrescription(normal, "intermediate", 4).reps, 14, "a normal entry still scales with the week");
});

test("the workout seed says exactly what the protocols say", () => {
  const s = read("seed_0024_shooting_benchmarks.sql");
  assert.ok($hl(s).includes(BENCHMARK_WORKOUT_NAME));
  const rows = [...s.matchAll(/\(\$hl\$([^$]+)\$hl\$,\s*(\d+),\s*\$hl\$(\w+)\$hl\$,\s*\$hl\$([^$]+)\$hl\$,\s*(null::int|\d+),\s*(null::int|\d+),\s*(null::int|\d+)\)/g)];
  assert.equal(rows.length, 3);
  const n = (x: string) => (x.startsWith("null") ? null : Number(x));
  for (const b of BENCHMARKS) {
    const r = rows.find((m) => m[1] === b.drillName)!;
    assert.ok(r, `${b.drillName} is in the seed`);
    assert.deepEqual({ sort: Number(r[2]), block: r[3], label: r[4], sets: n(r[5]), reps: n(r[6]), secs: n(r[7]) }, { sort: b.entry.sortOrder, block: b.entry.block, label: b.variantLabel, sets: b.entry.sets, reps: b.entry.reps, secs: b.entry.seconds }, b.key);
  }
  assert.match(s, /'\{\}'::text\[\], '\{\}'::jsonb/, "no levels and no per-level targets");
  assert.doesNotMatch(s, /update hoops|delete from|drop /i, "adds only");
  assert.doesNotMatch([...s.matchAll(/--.*$/gm)].map((m) => m[0]).join("\n"), /'/, "no apostrophes in comments");
  assert.doesNotMatch(s.replace(/\$hl\$[\s\S]*?\$hl\$/g, "").replace(/--.*$/gm, "").replace(/'\{\}'::(text\[\]|jsonb)/g, "").replace(/array\[[^\]]*\]/g, ""), /'/, "text is dollar quoted");
});

test("the program seed adds a fourth day to exactly weeks 1, 3 and 6 and changes nothing else", () => {
  const s = read("seed_0025_benchmark_days_in_shot_builder.sql");
  const weeks = [...s.matchAll(/^\s*\((\d+), \$hl\$/gm)].map((m) => Number(m[1]));
  assert.deepEqual(weeks, [...BENCHMARK_WEEKS]);
  assert.match(s, /select p\.id, v\.week_number, 4, w\.id, 0, v\.week_number = 6/, "day 4, never stepped up, week 6 marked as the lighter week");
  assert.doesNotMatch(s, /update hoops|delete from|drop /i);
  assert.match(s, /where not exists/);
});

test("the unique-index migration matches the logical identity of a workout result and never deletes", () => {
  const m = read("migrations/0023_one_log_per_workout_entry.sql");
  assert.match(m, /create unique index if not exists session_logs_one_per_entry\s+on hoops\.session_logs \(session_id, workout_drill_id\)\s+where workout_drill_id is not null;/);
  const code = m.replace(/--.*$/gm, "");
  assert.doesNotMatch(code, /\bdelete\b|\btruncate\b|\bupdate\b|drop /i, "no data is changed or removed");
  assert.match(code, /raise exception/, "it stops on duplicates");
  const rollback = read("rollback/0023_drop_one_log_per_workout_entry.sql");
  assert.match(rollback, /drop index if exists hoops\.session_logs_one_per_entry;/);
  assert.doesNotMatch(rollback.replace(/--.*$/gm, ""), /delete|update|truncate/i);
  assert.match(read("checks/0023_before.sql"), /having count\(\*\) > 1/);
});

test("the film fix looks every identifier up by exact title or name, links only where there is no link, and never touches an address", () => {
  const f = read("fix_0026_film_links_for_shooting.sql");
  const code = f.replace(/--.*$/gm, "");
  for (const t of ["Playing Without the Ball", "Curry: Feet Ready Before the Ball Arrives", "Creating Separation Off the Bounce", "Catch-and-Shoot off the Pin-Down", "Wing Step-Back"]) assert.ok($hl(f).includes(t), t);
  assert.doesNotMatch(code, /\burl\b/i, "no web address is read or written");
  assert.doesNotMatch(code, /insert into|delete from/i);
  assert.match(code, /<> 1/, "each must match exactly one row");
  assert.match(code, /if v_current is null then/, "only fills an empty link");
  assert.doesNotMatch(code, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i, "no identifier is typed in");
});

test("the words every benchmark screen uses never claim more than the camera counts", () => {
  assert.match(BENCHMARK_HONESTY.counted, /attempts and makes/);
  assert.match(BENCHMARK_HONESTY.notMeasured, /Footwork.*not measured/);
  assert.match(BENCHMARK_HONESTY.notGame, /do not show how the same shots go in a game/);
  for (const b of BENCHMARKS) assert.doesNotMatch(JSON.stringify(b), /verif|proves?\b|game[- ]ready|will improve/i, b.key);
});

test("a protocol cannot be changed without becoming a new version", () => {
  const hash = (b: unknown) => crypto.createHash("sha256").update(JSON.stringify(b)).digest("hex").slice(0, 16);
  const now = Object.fromEntries(BENCHMARKS.map((b) => [protocolId(b), hash(b)]));
  if (Object.keys(PINNED).length === 0) { console.log("PIN THESE:", JSON.stringify(now)); }
  assert.deepEqual(now, PINNED, "a protocol's text or numbers changed: that is a new version (bump version, keep the old one defined)");
});
