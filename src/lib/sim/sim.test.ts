import { test } from "node:test";
import assert from "node:assert/strict";
import { LIBRARY_PLAYS } from "@/lib/plays/library";
import { defaultScoutFrames } from "@/lib/scouting/frames";
import { parseScoutingNotes, type ScoutDiagram } from "@/lib/scouting/report";
import type { Point } from "@/lib/plays/geometry";
import { MAN_MODEL, scoutedModel, type DefenseModel } from "./defense-model";
import { simulateMatchup } from "./engine";
import { defensesFor, groupFor, runGrid } from "./matchup";
import { buildTimeline, DT } from "./timeline";

const play = (id: string) => LIBRARY_PLAYS.find((p) => p.id === id)!;

function fixed(label: string, at: (ball: Point) => Point[]): DefenseModel {
  return { id: label, label, kind: "zone", canTrap: false, anchors: (ball) => at(ball), distanceToExample: () => 0 };
}

const zoneDiagram: ScoutDiagram = { id: "z", section: "defense_half", title: "2-3 test zone", caption: "", frames: defaultScoutFrames("defense_half") };

test("a play becomes a timeline with its passes and catches", () => {
  const flex = play("flex");
  const tl = buildTimeline(flex.frames);
  assert.ok(tl.passes.length >= 2, "flex has passes");
  assert.equal(tl.catches.length, tl.passes.length);
  for (const p of tl.passes) assert.ok(p.endTick > p.startTick);
  const expected = Math.round(0.6 / DT) + Math.round(1.4 / DT) + (flex.frames.length - 2) * Math.round(1.0 / DT) + (flex.frames.length - 1) * Math.round(1.5 / DT);
  assert.equal(tl.ticks.length, expected);
});

test("the ball is never held by two players and is in the air only between a pass's ends", () => {
  const tl = buildTimeline(play("blob-box").frames);
  for (const t of tl.ticks) assert.equal(t.holder === null, t.flight !== null);
});

test("the same play against the same defense gives the same answer every time", () => {
  const a = simulateMatchup(play("flex").frames, MAN_MODEL, "half", "flex|man");
  const b = simulateMatchup(play("flex").frames, MAN_MODEL, "half", "flex|man");
  assert.equal(a.summary.ppp, b.summary.ppp);
  assert.deepEqual(a.replay.ticks[40], b.replay.ticks[40]);
});

test("nobody guarding is better for the offense than everybody on the ball", () => {
  const far = fixed("nobody home", () => Array.from({ length: 5 }, (_, i) => ({ x: 5 + i * 10, y: 80 })));
  const swarm = fixed("swarm", (ball) => Array.from({ length: 5 }, (_, i) => ({ x: ball.x + (i - 2) * 0.8, y: ball.y + 1.2 })));
  const open = simulateMatchup(play("flex").frames, far, "half", "t").summary;
  const smothered = simulateMatchup(play("flex").frames, swarm, "half", "t").summary;
  assert.ok(open.ppp > smothered.ppp + 0.3, `${open.ppp} vs ${smothered.ppp}`);
  assert.equal(open.pTurnover, 0);
});

test("a defender sitting on the passing lane picks it off far more often than one a long way off", () => {
  const frames = play("flex").frames;
  const tl = buildTimeline(frames);
  const pass = tl.passes[0];
  const mid = tl.ticks[Math.round((pass.startTick + pass.endTick) / 2)].ball;
  const onLane = fixed("lane", () => [mid, { x: 5, y: 80 }, { x: 15, y: 80 }, { x: 35, y: 80 }, { x: 45, y: 80 }]);
  const away = fixed("away", () => [{ x: 25, y: 80 }, { x: 5, y: 80 }, { x: 15, y: 80 }, { x: 35, y: 80 }, { x: 45, y: 80 }]);
  const hit = simulateMatchup(frames, onLane, "half", "lane").summary;
  const miss = simulateMatchup(frames, away, "half", "lane").summary;
  assert.ok(hit.pTurnover > miss.pTurnover + 0.1, `${hit.pTurnover} vs ${miss.pTurnover}`);
});

test("a scouted defense plays the other side of the floor as the mirror image of what was drawn", () => {
  const model = scoutedModel(zoneDiagram, "zone");
  const sample = zoneDiagram.frames[0];
  const holder = sample.offense.find((o) => o.id === sample.ballHolder)!.pos;
  const offense = { O1: { x: -20, y: 90 }, O2: { x: -20, y: 90 }, O3: { x: -20, y: 90 }, O4: { x: -20, y: 90 }, O5: { x: -20, y: 90 } };
  const here = model.anchors(holder, offense, null);
  const flipped = model.anchors({ x: 50 - holder.x, y: holder.y }, offense, null);
  for (const a of here) {
    const nearest = Math.min(...flipped.map((b) => Math.hypot(b.x - (50 - a.x), b.y - a.y)));
    assert.ok(nearest < 0.5, `a defender at (${a.x},${a.y}) has no mirror partner`);
  }
});

test("only plays that are our offense are tested, each against the defenses that fit its situation", () => {
  assert.equal(groupFor(play("blob-box")), "blob");
  assert.equal(groupFor(play("flex")), "half");
  assert.equal(groupFor(play("box-break")), "press");
  assert.equal(groupFor(play("press-221")), null);
  assert.equal(groupFor(play("run-jump")), null);
  const doc = { ...parseScoutingNotes(null), diagrams: [zoneDiagram] };
  assert.deepEqual(defensesFor("half", doc).map((d) => d.key), ["z", "man"]);
  assert.deepEqual(defensesFor("press", doc), []);
});

test("the grid has a cell for every play against every defense that applies", () => {
  const doc = { ...parseScoutingNotes(null), diagrams: [zoneDiagram] };
  const grid = runGrid([play("flex"), play("blob-box"), play("press-221")], doc);
  assert.equal(grid.rows.length, 2);
  assert.deepEqual(grid.rows.find((r) => r.play.id === "flex")!.cells.map((c) => c.defenseKey), ["z", "man"]);
  assert.deepEqual(grid.rows.find((r) => r.play.id === "blob-box")!.cells.map((c) => c.defenseKey), ["man"]);
});
