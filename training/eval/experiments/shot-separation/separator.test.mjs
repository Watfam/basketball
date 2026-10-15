import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "./run-pipelines.mjs";

test("arrival:false reproduces the round-2 machine exactly on real clips (both rates)", async () => {
  for (const [id, thin] of [["IMG_4872", 1], ["IMG_4873", 2], ["IMG_4851", 1]]) {
    const a = await run(id, thin, "tracks"), b = await run(id, thin, "separator_round2_check");
    assert.equal(JSON.stringify(a.counted.map((c) => [c.first, c.last, c.v4, c.zoneSightings])), JSON.stringify(b.counted.map((c) => [c.first, c.last, c.v4, c.zoneSightings])), `${id} @${thin}`);
  }
});
