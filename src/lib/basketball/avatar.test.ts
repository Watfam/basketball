import { test } from "node:test";
import assert from "node:assert/strict";
import { avatarTone, initials } from "./avatar.ts";

test("initials from first and last name, or the first two letters of one", () => {
  assert.equal(initials("Cameron Watford"), "CW");
  assert.equal(initials("  ethan  "), "ET");
  assert.equal(initials("Mary Jo Smith"), "MS");
  assert.equal(initials(""), "?");
});

test("a player keeps the same colour", () => {
  assert.equal(avatarTone("abc"), avatarTone("abc"));
});
