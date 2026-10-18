import test from "node:test";
import assert from "node:assert/strict";
import { blocksFor, cleanSave, defaultName, draftWorkout, entryMinutes, totalMinutes, typicalPrescriptions, type BuilderDrill } from "./workout-builder.ts";

const drill = (id: string, skill: string[], difficulty: string | null, sets: number | null, reps: number | null, seconds: number | null): BuilderDrill => ({ id, name: `Drill ${id}`, description: null, skill_tags: skill, difficulty, sets, reps, seconds });

test("minutes: reps take a few seconds each, sets rest, every drill needs setting up", () => {
  assert.equal(entryMinutes({ sets: 3, reps: 10, seconds: null }), 3, "30 + 3 x (30 + 20) = 180 s");
  assert.equal(entryMinutes({ sets: 3, reps: null, seconds: 30 }), 3, "30 + 3 x 45 = 165 s");
  assert.equal(entryMinutes({ sets: null, reps: null, seconds: null }), 3, "no target: about three minutes");
  assert.equal(entryMinutes({ sets: 1, reps: 1, seconds: null }), 1, "never under a minute");
  assert.equal(totalMinutes([{ sets: 3, reps: 10, seconds: null }, { sets: 3, reps: null, seconds: 30 }]), 6);
});

test("the usual prescription for a drill is the most common one in the library, at the player's level, and benchmarks are left out", () => {
  const rows = [
    { drill_id: "a", variant_label: null, target_sets: 3, target_reps: 10, target_duration_seconds: null, level_targets: null },
    { drill_id: "a", variant_label: null, target_sets: 3, target_reps: 10, target_duration_seconds: null, level_targets: null },
    { drill_id: "a", variant_label: null, target_sets: 2, target_reps: 5, target_duration_seconds: null, level_targets: null },
    { drill_id: "b", variant_label: "Benchmark v1", target_sets: 1, target_reps: 25, target_duration_seconds: null, level_targets: null },
    { drill_id: "c", variant_label: null, target_sets: 3, target_reps: 8, target_duration_seconds: null, level_targets: { advanced: { sets: 4, reps: 12 } } },
  ];
  const m = typicalPrescriptions(rows, "advanced", (l) => Boolean(l && /benchmark/i.test(l)));
  assert.deepEqual(m.get("a"), { sets: 3, reps: 10, seconds: null });
  assert.equal(m.has("b"), false);
  assert.deepEqual(m.get("c"), { sets: 4, reps: 12, seconds: null });
});

test("a draft fits the time, uses the chosen skills, takes them in turn, and never repeats a drill", () => {
  const drills = [
    ...["s1", "s2", "s3", "s4", "s5", "s6"].map((id) => drill(id, ["shooting"], "intermediate", 3, 10, null)),
    ...["h1", "h2", "h3", "h4", "h5", "h6"].map((id) => drill(id, ["ball_handling"], "intermediate", 3, null, 30)),
    drill("d1", ["defense"], "intermediate", 3, 10, null),
  ];
  const d = draftWorkout({ minutes: 30, skills: ["shooting", "ball_handling"], level: "intermediate", drills });
  const total = totalMinutes(d);
  assert.ok(total >= 27 && total <= 33, `about 30 minutes, got ${total}`);
  assert.equal(new Set(d.map((e) => e.drillId)).size, d.length);
  assert.ok(d.every((e) => !e.drillId.startsWith("d")), "no defense drill");
  assert.deepEqual(d.slice(0, 2).map((e) => e.drillId[0]), ["s", "h"], "in turn across skills");
  assert.deepEqual(d.map((e) => e.block).filter((b) => b === "warmup").length, 1);
  assert.equal(d[d.length - 1].block, "finisher");
  const again = draftWorkout({ minutes: 30, skills: ["shooting", "ball_handling"], level: "intermediate", drills, shuffle: 2 });
  assert.notDeepEqual(again.map((e) => e.drillId), d.map((e) => e.drillId), "shuffle gives a different draft");
  assert.deepEqual(draftWorkout({ minutes: 30, skills: [], level: "beginner", drills }), []);
});

test("with too few drills for the time, it does more sets of what there is", () => {
  const few = ["a", "b", "c", "d", "e", "f"].map((id) => drill(id, ["shooting"], "intermediate", 3, 10, null));
  const d = draftWorkout({ minutes: 30, skills: ["shooting"], level: "intermediate", drills: few });
  assert.equal(d.length, 6);
  const total = totalMinutes(d);
  assert.ok(total >= 27 && total <= 33, `about 30 minutes, got ${total}`);
  assert.ok(d.every((e) => (e.sets ?? 0) <= 6));
});

test("drills closest to the player's level come first", () => {
  const drills = [drill("hard", ["shooting"], "advanced", 3, 10, null), drill("easy", ["shooting"], "beginner", 3, 10, null), drill("mid", ["shooting"], "intermediate", 3, 10, null)];
  assert.equal(draftWorkout({ minutes: 15, skills: ["shooting"], level: "beginner", drills })[0].drillId, "easy");
  assert.equal(draftWorkout({ minutes: 15, skills: ["shooting"], level: "advanced", drills })[0].drillId, "hard");
});

test("blocks: a warm-up first and a finisher last once there are three drills", () => {
  assert.deepEqual(blocksFor(1), ["main"]);
  assert.deepEqual(blocksFor(2), ["main", "main"]);
  assert.deepEqual(blocksFor(4), ["warmup", "main", "main", "finisher"]);
});

test("names", () => {
  const L = { shooting: "Shooting", ball_handling: "Ball handling" };
  assert.equal(defaultName(30, ["shooting"], L), "My 30 minute shooting workout");
  assert.equal(defaultName(45, ["shooting", "ball_handling"], L), "My 45 minute shooting and ball handling workout");
});

test("the server's check: a name, one to fifteen drills, sane numbers, known skills only", () => {
  const ok = cleanSave({ name: "  Mine  ", skills: ["shooting", "bogus"], entries: [{ drillId: "a", sets: 99, reps: 0, seconds: null, block: "weird" }] }, ["shooting"]);
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.value.name, "Mine");
    assert.deepEqual(ok.value.skills, ["shooting"]);
    assert.deepEqual([ok.value.entries[0].sets, ok.value.entries[0].reps, ok.value.entries[0].block], [10, 1, "main"]);
  }
  assert.equal(cleanSave({ name: "", skills: [], entries: [{ drillId: "a", sets: 1, reps: 1, seconds: null, block: "main" }] }, []).ok, false);
  assert.equal(cleanSave({ name: "x", skills: [], entries: [] }, []).ok, false);
  assert.equal(cleanSave({ name: "x", skills: [], entries: Array.from({ length: 16 }, () => ({ drillId: "a", sets: 1, reps: 1, seconds: null, block: "main" })) }, []).ok, false);
  assert.equal(cleanSave({ name: "x", skills: [], entries: [{ drillId: "", sets: 1, reps: 1, seconds: null, block: "main" }] }, []).ok, false);
});
