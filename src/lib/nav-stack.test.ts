import test from "node:test";
import assert from "node:assert/strict";
import { popScreen, pushScreen, screenBefore, screenName } from "./nav-stack.ts";

test("screens are noted in order, and the same screen twice in a row is one", () => {
  let s: string[] = [];
  s = pushScreen(s, "/players/p"); s = pushScreen(s, "/players/p/workouts"); s = pushScreen(s, "/players/p/workouts");
  assert.deepEqual(s, ["/players/p", "/players/p/workouts"]);
});

test("going back drops the screen left, but never empties the list", () => {
  assert.deepEqual(popScreen(["/a", "/b", "/c"]), ["/a", "/b"]);
  assert.deepEqual(popScreen(["/a"]), ["/a"]);
  assert.deepEqual(popScreen([]), []);
});

test("the screen before is the last one that is not this one (a filter change is not a different screen)", () => {
  const s = ["/players/p/workouts", "/players/p/workouts/library", "/players/p/workouts/library?skill=shooting"];
  assert.equal(screenBefore(s, "/players/p/workouts/library?skill=shooting"), "/players/p/workouts");
  assert.equal(screenBefore(["/players/p/workouts"], "/players/p/workouts"), null, "nothing before: the app was opened here");
  assert.equal(screenBefore([], "/x"), null);
});

test("names for the Back button", () => {
  assert.equal(screenName("/players/abc"), "Today");
  assert.equal(screenName("/players/abc/workouts"), "Train");
  assert.equal(screenName("/players/abc/workouts/library?skill=defense"), "Workouts");
  assert.equal(screenName("/players/abc/workouts/build"), "Build");
  assert.equal(screenName("/players/abc/film?tab=library"), "Film room");
  assert.equal(screenName("/players/abc/film/sessions/s1"), "Film room");
  assert.equal(screenName("/players/abc/sessions"), "History");
  assert.equal(screenName("/players/abc/shooting"), "Shoot");
  assert.equal(screenName("/players/abc/sessions/s1"), null, "a workout in progress has no short name");
  assert.equal(screenName("/coach"), "Coach home");
  assert.equal(screenName("/teams/t1"), null);
});
