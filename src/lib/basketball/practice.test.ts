import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanBlocks, renamedDrills, withKeys, type PracticeBlock } from "./practice.ts";

let n = 0;
const fresh = () => `k${++n}`;

test("a renamed drill is found by its key, even after moving", () => {
  // Saved before keys existed: keyed by position when the form loads.
  const saved: PracticeBlock[] = [{ label: "Warm-up" }, { label: "Shell drill" }, { label: "Olympic shooting" }];
  const loaded = withKeys(saved, fresh, true);
  // Reordered, one renamed, one new drill added.
  const edited = withKeys(
    [loaded[2], { ...loaded[1], label: "Shell defense" }, { label: "Free throws" }, loaded[0]],
    fresh
  );
  assert.deepEqual(renamedDrills(saved, cleanBlocks(edited)), [{ from: "Shell drill", to: "Shell defense" }]);
});

test("a new drill never takes an old drill's history", () => {
  const saved: PracticeBlock[] = [{ label: "Warm-up" }];
  const edited = withKeys([{ label: "Different drill" }], fresh);
  assert.deepEqual(renamedDrills(saved, edited), []);
});

test("group headers and unchanged names are left alone", () => {
  const saved: PracticeBlock[] = [{ label: "Defense", isSection: true, key: "s" }, { label: "Shell", key: "a" }];
  const edited: PracticeBlock[] = [{ label: "D", isSection: true, key: "s" }, { label: "Shell", key: "a" }];
  assert.deepEqual(renamedDrills(saved, edited), []);
});
