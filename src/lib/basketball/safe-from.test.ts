import test from "node:test";
import assert from "node:assert/strict";
import { safeFrom } from "./safe-from.ts";

test("only a path inside this player's own area is followed", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.equal(safeFrom(`/players/${id}/progress?view=shooting&range=all`, id), `/players/${id}/progress?view=shooting&range=all`);
  for (const bad of [undefined, null, "", "https://evil.example/x", "//evil.example", "/players/other/progress", `/players/${id}//evil.example`, `/players/${id}/..\\evil`, "javascript:alert(1)", `/players/${id}/a\nb`, "/login"]) assert.equal(safeFrom(bad as string, id), null, String(bad));
});
