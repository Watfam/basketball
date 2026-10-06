/**
 * The app's make/miss rule must give exactly the calls the offline tools
 * gave, or the measured accuracy (training/README.md) says nothing about it.
 *
 *   npm test
 *
 * 1. Parity: generated scenes go through this code and through the real
 *    training/tools/40-score-rules.py, and every call must match. Needs
 *    python3; skipped without it.
 * 2. The exam clips, from training/fixtures/dets5-4839.json and dets5-4840.json
 *    (ball-5 detections made by tools/22: box positions only, no pictures),
 *    must score as reported: V1 22/28 and 26/32, V2 26/28 and 28/32.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { REFERENCE_FPS, RULE, createShotCounter, inZone, type Box, type ShotCall } from "./shotRules.ts";

type Det = Box & { f: number };

const root = path.resolve(import.meta.dirname, "../../..");
const tool40 = path.join(root, "training/tools/40-score-rules.py");
const hasPython = spawnSync("python3", ["--version"]).status === 0;

/** Run detections through the app's counter, one frame at a time. */
function runCounter(dets: Det[], rim: { x: number; y: number }, frames: number): ShotCall[] {
  const counter = createShotCounter(rim);
  const byFrame = new Map<number, Box[]>();
  for (const d of dets) byFrame.set(d.f, [...(byFrame.get(d.f) ?? []), d]);
  const calls: ShotCall[] = [];
  for (let f = 0; f < frames; f += 1) calls.push(...counter.push((f * 1000) / REFERENCE_FPS, byFrame.get(f) ?? []));
  calls.push(...counter.flush());
  return calls;
}

/** Shot candidates exactly as training/tools/23-shot-candidates.mjs groups them. */
function tool23Candidates(dets: Det[], rim: { x: number; y: number }) {
  const hits = dets.filter((d) => inZone(d, rim)).sort((a, b) => a.f - b.f);
  const cands: { start: number; end: number; n: number }[] = [];
  for (const h of hits) {
    const c = cands[cands.length - 1];
    // Tool 23's own 40, not RULE.gapFrames, so a change to RULE shows up.
    if (c && h.f - c.end <= 40) {
      c.end = h.f;
      c.n += 1;
    } else cands.push({ start: h.f, end: h.f, n: 1 });
  }
  return cands.filter((c) => c.n >= 2);
}

/** Run the real python scorer; returns its V1 and V2 call per candidate. */
function runTool40(dets: Det[], cands: object[], rim: { x: number; y: number }, truth: string[]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shotrules-"));
  const file = (name: string, data: unknown) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, JSON.stringify(data));
    return p;
  };
  const out = spawnSync(
    "python3",
    [
      tool40,
      file("dets.json", { detections: dets }),
      file("cands.json", cands),
      String(rim.x),
      String(rim.y),
      file("truth.json", { results: truth }),
    ],
    { encoding: "utf8" }
  );
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(out.status, 0, out.stderr);
  const rows = out.stdout
    .split("\n")
    .map((l) => l.match(/^\s*(\d+)\s+[\d.]+s\s+(make|miss)\s+(make|miss)\s+(make|miss)/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({ v1: m[2], v2: m[3] }));
  return { rows, stdout: out.stdout };
}

/** Small seeded generator, so a failure can be replayed. */
function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * A made-up session around a rim at (192, 190): shots of every kind the
 * rule has to tell apart (clean makes, rim bounces beside the net, balls
 * dropping in front of the hoop and so looking bigger, slow roll-ins,
 * sightings that stop), plus detections elsewhere in the window and
 * spacings near the 40- and 70-frame edges.
 */
function scene(seed: number) {
  const rnd = prng(seed);
  const rim = { x: 192, y: 190 };
  const dets: Det[] = [];
  const ball = (f: number, x: number, y: number, w: number) => dets.push({ f, x1: x - w / 2, y1: y - w / 2, x2: x + w / 2, y2: y + w / 2 });
  let f = 5 + Math.floor(rnd() * 20);
  const shots = 6 + Math.floor(rnd() * 10);
  for (let i = 0; i < shots; i += 1) {
    const w = 16 + rnd() * 10;
    // Approach and time at the rim.
    const atRim = 1 + Math.floor(rnd() * 12);
    for (let k = 0; k < atRim; k += 1) {
      if (rnd() < 0.25) continue; // missed sighting
      ball(f + k, rim.x + (rnd() - 0.5) * 120, rim.y + (rnd() - 0.6) * 100, w + (rnd() - 0.5) * 4);
    }
    // What happens below: any mix, deliberately close to every threshold.
    const delay = Math.floor(rnd() * 80);
    const drops = Math.floor(rnd() * 10);
    const grow = rnd() < 0.3 ? 1 + rnd() * 0.6 : 1;
    for (let k = 0; k < drops; k += 1) {
      ball(f + delay + k, rim.x + (rnd() - 0.5) * 110, rim.y + 20 + rnd() * 60, (w + 6 * rnd()) * grow);
    }
    // Clutter: a second ball or a false box elsewhere.
    if (rnd() < 0.3) ball(f + Math.floor(rnd() * 60), rnd() * 416, rnd() * 416, 10 + rnd() * 30);
    // Gap to the next shot: sometimes inside 40 frames, sometimes inside 70.
    f += atRim + [20, 38, 40, 41, 55, 69, 70, 71, 120, 300][Math.floor(rnd() * 10)];
  }
  return { rim, dets, frames: f + 120 };
}

test("matches 40-score-rules.py call for call on generated scenes", { skip: !hasPython && "python3 not found" }, () => {
  let shots = 0;
  for (let seed = 1; seed <= 150; seed += 1) {
    const { rim, dets, frames } = scene(seed);
    const cands = tool23Candidates(dets, rim);
    const app = runCounter(dets, rim, frames).filter((c) => c.counted);
    assert.equal(app.length, cands.length, `seed ${seed}: shot count`);
    assert.deepEqual(
      app.map((c) => c.first),
      cands.map((c) => c.start),
      `seed ${seed}: shot starts`
    );
    if (!cands.length) continue;
    const { rows } = runTool40(dets, cands, rim, cands.map(() => "make"));
    assert.equal(rows.length, cands.length, `seed ${seed}: python rows`);
    rows.forEach((r, i) => {
      assert.equal(app[i].v1, r.v1, `seed ${seed} shot ${i + 1}: V1`);
      assert.equal(app[i].v2, r.v2, `seed ${seed} shot ${i + 1}: V2`);
    });
    shots += cands.length;
  }
  assert.ok(shots > 500, `only ${shots} shots generated`);
});

test("a lone zone sighting is reported but not counted", () => {
  const calls = runCounter([{ f: 10, x1: 182, y1: 180, x2: 202, y2: 200 }], { x: 192, y: 190 }, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].counted, false);
  assert.equal(calls[0].n, 0);
});

test("a call waits for the 70-frame window, and a slower camera gives the same calls", () => {
  const rim = { x: 192, y: 190 };
  const dets: Det[] = [
    { f: 100, x1: 182, y1: 180, x2: 202, y2: 200 },
    { f: 102, x1: 182, y1: 182, x2: 202, y2: 202 },
    { f: 160, x1: 182, y1: 225, x2: 202, y2: 245 }, // below the net after 60 frames: V2 make, V1 miss
  ];
  const counter = createShotCounter(rim);
  const byFrame = new Map(dets.map((d) => [d.f, [d]]));
  let decidedAt = -1;
  // Every second frame only, as a 15 fps phone would see it.
  for (let f = 0; f < 300 && decidedAt < 0; f += 2) {
    const calls = counter.push((f * 1000) / REFERENCE_FPS, byFrame.get(f) ?? []);
    if (calls.length) {
      decidedAt = f;
      assert.equal(calls[0].v1, "miss");
      assert.equal(calls[0].v2, "make");
    }
  }
  assert.ok(decidedAt >= 100 + RULE.windowV2 - 1, `decided too early, at frame ${decidedAt}`);
  assert.ok(decidedAt <= 102 + RULE.gapFrames + RULE.windowV2, `decided too late, at frame ${decidedAt}`);
});

test("worth a look: on the exam clips, 5 of the 6 wrong calls flagged, 11 of 60 shots in all (in-sample)", () => {
  let wrong = 0;
  let caught = 0;
  let flagged = 0;
  let total = 0;
  for (const clip of ["4839", "4840"]) {
    const dets = (JSON.parse(fs.readFileSync(path.join(root, `training/fixtures/dets5-${clip}.json`), "utf8")) as { detections: Det[] }).detections;
    const truth = (JSON.parse(fs.readFileSync(path.join(root, `training/labels/IMG_${clip}-truth.json`), "utf8")) as { results: string[] }).results;
    const calls = runCounter(dets, { x: 192, y: 190 }, Math.max(...dets.map((d) => d.f)) + 200).filter((c) => c.counted);
    calls.forEach((c, i) => {
      total += 1;
      if (c.flagged) flagged += 1;
      if (c.v2 !== truth[i]) {
        wrong += 1;
        if (c.flagged) caught += 1;
      }
    });
  }
  assert.deepEqual({ wrong, caught, flagged, total }, { wrong: 6, caught: 5, flagged: 11, total: 60 });
});

const exams = [
  { clip: "4839", rim: { x: 192, y: 190 }, v1: 22, v2: 26, shots: 28 },
  { clip: "4840", rim: { x: 192, y: 190 }, v1: 26, v2: 28, shots: 32 },
];
for (const exam of exams) {
  const detsFile = path.join(root, `training/fixtures/dets5-${exam.clip}.json`);
  test(`exam clip IMG_${exam.clip}: V1 ${exam.v1}/${exam.shots}, V2 ${exam.v2}/${exam.shots}`, { skip: !fs.existsSync(detsFile) && `${detsFile} not present` }, () => {
    const dets = (JSON.parse(fs.readFileSync(detsFile, "utf8")) as { detections: Det[] }).detections;
    const truth = (JSON.parse(fs.readFileSync(path.join(root, `training/labels/IMG_${exam.clip}-truth.json`), "utf8")) as { results: string[] }).results;
    const frames = Math.max(...dets.map((d) => d.f)) + 200;
    const calls = runCounter(dets, exam.rim, frames).filter((c) => c.counted);
    assert.equal(calls.length, exam.shots);
    assert.equal(calls.filter((c, i) => c.v1 === truth[i]).length, exam.v1);
    assert.equal(calls.filter((c, i) => c.v2 === truth[i]).length, exam.v2);
  });
}
