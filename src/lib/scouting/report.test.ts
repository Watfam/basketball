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
