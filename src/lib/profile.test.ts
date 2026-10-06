import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeProfile, parseProfile, profileHome } from "./profile.ts";
import { activePlayerTab, isImmersivePlayerRoute } from "./basketball/player-nav.ts";

const id = "bbbbbbbb-0000-0000-0000-000000000001";

test("a profile survives the cookie round trip", () => {
  for (const p of [{ kind: "player", playerId: id }, { kind: "coach", teamId: id }, { kind: "coach", teamId: null }] as const) {
    assert.deepEqual(parseProfile(encodeProfile(p)), p);
  }
});

test("a damaged or foreign cookie is ignored, not trusted", () => {
  for (const v of [undefined, "", "player:", "player:../../etc", "admin:" + id, "player:" + id + "x"]) {
    assert.equal(parseProfile(v), null, String(v));
  }
});

test("each profile has a home", () => {
  assert.equal(profileHome({ kind: "player", playerId: id }), `/players/${id}`);
  assert.equal(profileHome({ kind: "coach", teamId: id }), "/coach");
  assert.equal(profileHome({ kind: "coach", teamId: null }), "/coach");
});

test("the bottom bar lights the right tab and hides on full-screen screens", () => {
  const b = `/players/${id}`;
  assert.equal(activePlayerTab(b, id), "home");
  assert.equal(activePlayerTab(`${b}/shooting/abc`, id), "shoot");
  assert.equal(activePlayerTab(`${b}/film/sessions/x`, id), "film");
  assert.equal(activePlayerTab(`${b}/workouts`, id), "train");
  assert.equal(activePlayerTab(`${b}/assessments`, id), "me");
  assert.equal(activePlayerTab(b, id, "tab=profile"), "me");
  assert.equal(activePlayerTab(b, id, "from=coach"), "home");
  assert.equal(activePlayerTab("/teams/x", id), null);
  assert.equal(isImmersivePlayerRoute(`${b}/sessions/abc`), true);
  assert.equal(isImmersivePlayerRoute(`${b}/assessment`), true);
  assert.equal(isImmersivePlayerRoute(`${b}/sessions`), false);
  assert.equal(isImmersivePlayerRoute(`${b}/shooting`), false);
});
