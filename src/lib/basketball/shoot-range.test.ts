import test from "node:test";
import assert from "node:assert/strict";
import { resolveShootRange, shootHref } from "./shoot-range.ts";

const NOW = new Date(2026, 9, 21, 15);
const SEASON = new Date(2026, 7, 1);
const at = (y: number, m: number, d: number) => new Date(y, m, d, 12).toISOString();

test("no range in the address: the season, exactly as before", () => {
  const r = resolveShootRange({}, SEASON, NOW);
  assert.equal(r.sel, null); assert.deepEqual(r.keep, {}); assert.equal(r.readFrom, SEASON);
  assert.equal(r.inRange(at(2026, 8, 1)), true); assert.equal(r.inRange(at(2026, 6, 30)), false);
  assert.match(r.label, /^This season, since/);
});

test("7 days and 4 weeks narrow the sets shown but are read from the season start (the setup card still needs the season)", () => {
  const w = resolveShootRange({ range: "7d" }, SEASON, NOW);
  assert.equal(w.inRange(at(2026, 9, 18)), true); assert.equal(w.inRange(at(2026, 9, 5)), false); assert.equal(w.readFrom, SEASON); assert.deepEqual(w.keep, { range: "7d" });
  const four = resolveShootRange({ range: "4w" }, SEASON, NOW);
  assert.equal(four.inRange(at(2026, 9, 1)), true); assert.equal(four.inRange(at(2026, 8, 1)), false); assert.equal(four.label, "Last 4 weeks");
});

test("a range that reaches back past the season is read that far; all time reads everything", () => {
  const early = new Date(2026, 8, 10);
  assert.ok(resolveShootRange({ range: "12w" }, new Date(2026, 8, 20), early).readFrom! < new Date(2026, 8, 20));
  const all = resolveShootRange({ range: "all" }, SEASON, NOW);
  assert.equal(all.readFrom, null); assert.equal(all.inRange(at(2020, 0, 1)), true);
});

test("one week from Today's chart (from and to) is kept on every link", () => {
  const r = resolveShootRange({ from: "2026-10-12", to: "2026-10-18" }, SEASON, NOW);
  assert.equal(r.sel!.key, "custom"); assert.deepEqual(r.keep, { from: "2026-10-12", to: "2026-10-18" });
  assert.equal(r.inRange(at(2026, 9, 14)), true); assert.equal(r.inRange(at(2026, 9, 19)), false); assert.equal(r.inRange(at(2026, 9, 11)), false);
  assert.equal(r.inRange(new Date(2026, 9, 18, 23, 30).toISOString()), true, "the whole last day counts");
  assert.equal(shootHref("p", { drill: "Free throws" }, r.keep), "/players/p/shooting?from=2026-10-12&to=2026-10-18&drill=Free+throws");
});

test("links: the range is kept, can be replaced, and the bare link has no question mark", () => {
  assert.equal(shootHref("p", {}, {}), "/players/p/shooting");
  assert.equal(shootHref("p", {}, { range: "4w" }), "/players/p/shooting?range=4w");
  assert.equal(shootHref("p", { range: "all" }, {}), "/players/p/shooting?range=all");
});

test("a bad range falls back like Progress does, and a repeated parameter uses the first", () => {
  assert.equal(resolveShootRange({ range: "nonsense" }, SEASON, NOW).sel!.key, "12w");
  assert.equal(resolveShootRange({ range: ["4w", "all"] }, SEASON, NOW).sel!.key, "4w");
});
