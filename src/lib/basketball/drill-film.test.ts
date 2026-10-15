import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { lessonForDrill, lessonUrl, type Lesson } from "./drill-film.ts";

const SEEDS = path.join(import.meta.dirname, "../../../supabase");
/** The lessons and their drill mapping exactly as the seeds write them. */
function seedLessons(): { lesson: Lesson; drillName: string | null }[] {
  const s = fs.readFileSync(path.join(SEEDS, "seed_0005_film_room.sql"), "utf8");
  const body = s.slice(s.indexOf("from (values"), s.indexOf(") as v(title"));
  const rows = body.split(/\n\s*\(\s*\n?\s*\$hl\$/).slice(1);
  return rows.map((r, i) => {
    const title = r.split("$hl$")[0];
    const last = r.trim().split("\n").filter((l) => /\d+\s*$/.test(l) || /\d+\s*\)/.test(l)).pop() ?? "";
    const m = last.match(/(?:\$hl\$(.*?)\$hl\$|null),\s*(?:\$hl\$(.*?)\$hl\$|null),\s*(\d+)/);
    const skills = r.match(/array\[((?:\$hl\$[a-z_]+\$hl\$,?\s*)+)\]/)?.[1].match(/\$hl\$([a-z_]+)\$hl\$/g)?.map((x) => x.replace(/\$hl\$/g, "")) ?? [];
    return { lesson: { id: `L${i}`, title, url: null, watch_for: [], skill_tags: skills, drill_id: null, sort_order: m ? Number(m[3]) : i }, drillName: m?.[2] ?? null };
  });
}

test("the seeds' own lesson-to-drill relationships are read, and a lesson is linked through its drill_id", () => {
  const rows = seedLessons(); const byTitle = new Map(rows.map((r) => [r.lesson.title, r]));
  assert.equal(byTitle.get("Building a Repeatable Release")?.drillName, "Form Shooting Progression");
  assert.equal(byTitle.get("Footwork Into the Pull-Up")?.drillName, "Off-the-Dribble Pull-Up Series");
  assert.equal(byTitle.get("Creating Separation Off the Bounce")?.drillName, "Wing Step-Back");
  // Give each lesson the id of its drill, the way the database does.
  const ids: Record<string, string> = { "Form Shooting Progression": "d-form", "Off-the-Dribble Pull-Up Series": "d-otd", "Wing Step-Back": "d-sb" };
  const lessons = rows.map((r) => ({ ...r.lesson, drill_id: r.drillName ? ids[r.drillName] ?? `d-${r.drillName}` : null }));
  const f = lessonForDrill({ id: "d-sb", name: "Wing Step-Back" }, lessons); assert.deepEqual([f?.basis, f?.lesson.title], ["linked", "Creating Separation Off the Bounce"]);
  const g = lessonForDrill({ id: "d-form", name: "Form Shooting Progression" }, lessons); assert.deepEqual([g?.basis, g?.lesson.title], ["linked", "Building a Repeatable Release"]);
});

test("drills with no linked lesson get a RELATED lesson only when the same named skill is taught, and never a made-up one", () => {
  const rows = seedLessons(), ids: Record<string, string> = { "Form Shooting Progression": "d-form", "Off-the-Dribble Pull-Up Series": "d-otd", "Wing Step-Back": "d-sb" };
  const lessons = rows.map((r) => ({ ...r.lesson, drill_id: r.drillName ? ids[r.drillName] ?? null : null }));
  const elbow = lessonForDrill({ id: "d-elbow", name: "Elbow Pull-Up" }, lessons);
  assert.deepEqual([elbow?.basis, elbow?.lesson.title], ["related", "Footwork Into the Pull-Up"]);
  const oneHand = lessonForDrill({ id: "d-1h", name: "One-Hand Form Shooting" }, lessons);
  assert.deepEqual([oneHand?.basis, oneHand?.lesson.title], ["related", "Building a Repeatable Release"]);
  for (const name of ["Catch-and-Shoot off the Pin-Down", "Free Throw Reset", "Beat the Clock Finisher", "Pound Dribble Series", "Attack Cone Series"]) assert.equal(lessonForDrill({ id: `d-${name}`, name }, lessons), null, `${name} has no lesson in the Film Room yet`);
  assert.equal(lessonForDrill({ id: "x", name: "Elbow Pull-Up" }, []), null);
  assert.equal(lessonForDrill({ id: "x", name: "Elbow Pull-Up" }, lessons.map((l) => ({ ...l, skill_tags: ["defense"] }))), null, "a lesson from another skill is never offered");
});

test("a linked lesson beats a related one, and the household's own video link beats the lesson's; no address is ever invented", () => {
  const a: Lesson = { id: "a", title: "Footwork Into the Pull-Up", url: null, watch_for: [], skill_tags: ["shooting"], drill_id: "d-other" };
  const b: Lesson = { id: "b", title: "Anything", url: "https://www.youtube.com/watch?v=abc", watch_for: [], skill_tags: ["shooting"], drill_id: "d-elbow" };
  assert.equal(lessonForDrill({ id: "d-elbow", name: "Elbow Pull-Up" }, [a, b])?.lesson.id, "b");
  assert.equal(lessonUrl(a, new Map()), null);
  assert.equal(lessonUrl(a, new Map([["a", "https://youtu.be/xyz"]])), "https://youtu.be/xyz");
  assert.equal(lessonUrl(b, new Map([["b", "https://youtu.be/xyz"]])), "https://youtu.be/xyz", "the household link wins");
  assert.equal(lessonUrl(b, new Map([["b", "javascript:alert(1)"]])), "https://www.youtube.com/watch?v=abc", "an unwatchable override is ignored");
  assert.equal(lessonUrl({ id: "c", url: "not a url" }, new Map()), null);
});
