import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScoutingNotes, sectionLines, serializeScoutingNotes } from "./report";
import { defaultScoutFrames } from "./frames";

test("an older three-key note opens as a complete document", () => {
  const doc = parseScoutingNotes({ personnel: "Small and quick", tendencies: "Press a lot", game_plan: "Run the tip" });
  assert.equal(doc.sections.personnel, "Small and quick");
  assert.equal(doc.sections.tip, "");
  assert.deepEqual(doc.players, []);
  assert.deepEqual(doc.diagrams, []);
});

test("garbage in the column never throws", () => {
  for (const raw of [null, undefined, "x", 5, [], { players: "no", diagrams: [1, null, { section: "tip", frames: [] }] }]) {
    const doc = parseScoutingNotes(raw);
    assert.deepEqual(doc.diagrams, []);
  }
});

test("a document survives serialize then parse", () => {
  const doc = parseScoutingNotes({ headline: "H", players: [{ id: "a", number: "2", label: "Best" }] });
  doc.diagrams.push({ id: "d1", section: "defense_half", title: "T", caption: "", frames: defaultScoutFrames("defense_half") });
  const back = parseScoutingNotes(JSON.parse(JSON.stringify(serializeScoutingNotes(doc))));
  assert.equal(back.headline, "H");
  assert.equal(back.players[0].number, "2");
  assert.equal(back.diagrams.length, 1);
});

test("a diagram in a section that cannot hold one is dropped", () => {
  const frames = defaultScoutFrames("tip");
  assert.equal(parseScoutingNotes({ diagrams: [{ id: "x", section: "personnel", title: "", caption: "", frames }] }).diagrams.length, 0);
});

test("section lines drop bullets and blanks", () => {
  assert.deepEqual(sectionLines("- one\n\n * two\n3. three\nfour"), ["one", "two", "three", "four"]);
});

test("the new player and team fields survive a round trip, and bad values are dropped", () => {
  const doc = parseScoutingNotes({
    maxprepsUrl: "https://www.maxpreps.com/al/x/y/basketball/jv/stats/",
    teamStats: [{ id: "a", label: "Record", value: "4-0" }, { nope: 1 }],
    ball_screen: "Hedge hard",
    transition: "They leak out",
    players: [{ id: "p", number: "2", hand: "R", height: "5'9\"", grade: "Fr.", position: "G", stats: "16 PPG", ranking: "#6 in Alabama" }, { id: "q", number: "22", hand: "left" }],
  });
  const back = parseScoutingNotes(JSON.parse(JSON.stringify(serializeScoutingNotes(doc))));
  assert.equal(back.sections.ball_screen, "Hedge hard");
  assert.equal(back.sections.transition, "They leak out");
  assert.equal(back.teamStats.length, 1);
  assert.equal(back.teamStats[0].value, "4-0");
  assert.equal(back.maxprepsUrl, "https://www.maxpreps.com/al/x/y/basketball/jv/stats/");
  assert.equal(back.players[0].hand, "R");
  assert.equal(back.players[0].stats, "16 PPG");
  assert.equal(back.players[0].ranking, "#6 in Alabama");
  assert.equal(back.players[1].ranking, "");
  assert.equal(back.players[1].hand, "");
});
