/**
 * The app's calibration scoring must pair shots exactly as the offline
 * exams did, or a calibration number and an exam number mean different
 * things. The python side is the alignment code of training/tools/38,
 * cut from the file itself and run on the same lists.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { align, type Outcome } from "./calibration.ts";

const root = path.resolve(import.meta.dirname, "../../..");
const hasPython = spawnSync("python3", ["--version"]).status === 0;

/** tools/38's alignment block, run on given lists; returns [cameraIndex, truthIndex, kind] steps. */
function pythonAlign(camera: Outcome[], truth: Outcome[]) {
  const src = fs.readFileSync(path.join(root, "training/tools/38-align-score.py"), "utf8");
  const block = src.slice(src.indexOf("N, M, NEG ="), src.indexOf("path.reverse()") + "path.reverse()".length);
  const program = [
    "import json, sys",
    "camera, T = json.load(sys.stdin)",
    "C = [(i + 1, c, 0) for i, c in enumerate(camera)]",
    block,
    "print(json.dumps(path))",
  ].join("\n");
  const out = spawnSync("python3", ["-c", program], { input: JSON.stringify([camera, truth]), encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr);
  return JSON.parse(out.stdout) as [number, number, string][];
}

function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

test("same length: one to one, in order", () => {
  const r = align(["make", "miss", "make"], ["make", "make", "make"]);
  assert.equal(r.method, "one_to_one");
  assert.deepEqual([r.shots, r.agreed, r.cameraMakes, r.trueMakes, r.extra, r.unseen], [3, 2, 2, 3, 0, 0]);
});

test("different lengths: paired exactly as tools/38 pairs them", { skip: !hasPython && "python3 not found" }, () => {
  const rnd = prng(7);
  for (let k = 0; k < 120; k += 1) {
    const truth = Array.from({ length: 3 + Math.floor(rnd() * 25) }, () => (rnd() < 0.5 ? "make" : "miss") as Outcome);
    // The camera's list: the truth with mistakes, extra counts and missed shots.
    const camera: Outcome[] = [];
    for (const t of truth) {
      if (rnd() < 0.1) continue;
      camera.push(rnd() < 0.15 ? (t === "make" ? "miss" : "make") : t);
      if (rnd() < 0.08) camera.push(rnd() < 0.5 ? "make" : "miss");
    }
    if (camera.length === truth.length) camera.push("miss");
    const r = align(camera, truth);
    const py = pythonAlign(camera, truth);
    const mine = r.perShot.map((s) =>
      s.kind === "match" ? "match" : s.kind === "extra" ? "skip" : "unseen"
    );
    assert.deepEqual(mine, py.map((p) => p[2]), `case ${k}`);
    assert.equal(r.matched + r.unseen, truth.length);
    assert.equal(r.matched + r.extra, camera.length);
  }
});
