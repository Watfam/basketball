import { test } from "node:test";
import assert from "node:assert/strict";
import { createAxis } from "./kalman.mjs";
import { createMotion, interpolate, MODEL_NAMES } from "./motion.mjs";

const parab = (n, step = 1) => Array.from({ length: n }, (_, i) => { const f = i * step; return { f, x: 100 + 3 * f, y: 60 + 0.5 * f * f - 8 * f }; });
const feed = (m, pts) => { m.init(pts[0], pts[0].f); for (const p of pts.slice(1)) m.update(p, p.f); };

test("an order-2 axis recovers a constant velocity and its uncertainty shrinks", () => {
  const ax = createAxis(2, 0.05, 1);
  ax.init(0, 0);
  const first = ax.state().varPos;
  for (let f = 1; f <= 20; f += 1) ax.update(5 * f, f);
  assert.ok(Math.abs(ax.state().vel - 5) < 0.2);
  assert.ok(Math.abs(ax.predict(23).pos - 115) < 1.5);
  assert.ok(ax.state().varPos < first);
});

test("a prediction further ahead is less certain than a near one", () => {
  const ax = createAxis(3, 0.005, 1);
  ax.init(0, 0); for (let f = 1; f <= 10; f += 1) ax.update(f * f * 0.5, f);
  assert.ok(ax.predict(16).varPos > ax.predict(11).varPos);
});

test("on an exact parabola ca and bal predict well and cv does not", () => {
  const pts = parab(30);
  const err = {};
  for (const name of ["cv", "ca", "bal"]) { const m = createMotion(name, { q3: 0.0005, R: 1 }); feed(m, pts.slice(0, 20)); const p = m.predict(24); err[name] = Math.hypot(p.x - pts[24].x, p.y - pts[24].y); }
  assert.ok(err.ca < 1.5 && err.bal < 1.5, JSON.stringify(err));
  assert.ok(err.cv > 5, JSON.stringify(err));
});

test("bal has no sideways acceleration: a sideways swerve is not followed as hard as by ca", () => {
  const pts = Array.from({ length: 16 }, (_, f) => ({ f, x: 100 + 0.4 * f * f, y: 50 + 4 * f }));
  const e = {};
  for (const name of ["ca", "bal"]) { const m = createMotion(name); feed(m, pts.slice(0, 12)); const p = m.predict(14); e[name] = p.ax; }
  assert.ok(e.bal === 0 && Math.abs(e.ca) > 0.05);
});

test("hyb weights the model that explains the recent points and stays between them", () => {
  const m = createMotion("hyb", { q3: 0.0005, R: 1 }); feed(m, parab(25));
  const p = m.predict(28);
  assert.ok(p.weights.bal > p.weights.cv);
  const cv = createMotion("cv", { R: 1 }); feed(cv, parab(25));
  assert.ok(Math.hypot(p.x - parab(30)[28].x, p.y - parab(30)[28].y) < Math.hypot(cv.predict(28).x - parab(30)[28].x, cv.predict(28).y - parab(30)[28].y));
});

test("every model runs at 15 fps (gaps of 2 reference frames) and gives finite output", () => {
  for (const name of MODEL_NAMES) { const m = createMotion(name); feed(m, parab(20, 2)); const p = m.predict(44); assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && p.varX > 0, name); }
});

test("interpolation uses both sides, never mutates its inputs, and the quadratic models are exact on a parabola", () => {
  const r = parab(12), before = r.slice(2, 6), after = r.slice(8, 12), copy = JSON.stringify([before, after]);
  for (const name of ["ca", "bal"]) { const p = interpolate(name, 4, before, after, 6); assert.ok(Math.hypot(p.x - r[6].x, p.y - r[6].y) < 1e-6, name); }
  assert.ok(Math.hypot(interpolate("cv", 4, before, after, 6).y - r[6].y, 0) > 0.5);
  assert.equal(JSON.stringify([before, after]), copy);
  assert.equal(interpolate("ca", 4, before.slice(0, 1), [], 6), null);
});
