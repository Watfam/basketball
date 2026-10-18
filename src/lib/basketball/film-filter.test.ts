import test from "node:test";
import assert from "node:assert/strict";
import { filterFilm, filmOptionCounts, whoOptions, NO_FILM_FILTERS, hasFilmFilters, type FilmLite } from "./film-filter.ts";

const f = (id: string, title: string, kind: string | null, skills: string[], pro: string | null, trainer: [string, string] | null): FilmLite => ({ id, title, kind, skill_tags: skills, pro_player_name: pro, trainer_id: trainer?.[0] ?? null, trainer_name: trainer?.[1] ?? null, duration_seconds: null });
const list = [
  f("1", "Off-ball movement", "pro_study", ["shooting"], "Stephen Curry", null),
  f("2", "Footwork into the shot", "technique", ["shooting"], null, ["t1", "Reid Ouse"]),
  f("3", "Two-ball handle", "technique", ["ball_handling"], null, ["t2", "Micah Lancaster"]),
  f("4", "Reading the screen", "iq", ["ball_handling", "defense"], "Chris Paul", null),
];

test("search finds a word in the title, a pro or a trainer, every word needed", () => {
  assert.deepEqual(filterFilm(list, { ...NO_FILM_FILTERS, q: "curry" }).map((x) => x.id), ["1"]);
  assert.deepEqual(filterFilm(list, { ...NO_FILM_FILTERS, q: "reid" }).map((x) => x.id), ["2"]);
  assert.deepEqual(filterFilm(list, { ...NO_FILM_FILTERS, q: "ball handle" }).map((x) => x.id), ["3"]);
  assert.deepEqual(filterFilm(list, { ...NO_FILM_FILTERS, q: "zzz" }), []);
});

test("skill, kind and who combine", () => {
  assert.deepEqual(filterFilm(list, { ...NO_FILM_FILTERS, skill: "shooting" }).map((x) => x.id), ["1", "2"]);
  assert.deepEqual(filterFilm(list, { ...NO_FILM_FILTERS, skill: "shooting", kind: "technique" }).map((x) => x.id), ["2"]);
  assert.deepEqual(filterFilm(list, { ...NO_FILM_FILTERS, who: "pro:Chris Paul" }).map((x) => x.id), ["4"]);
  assert.deepEqual(filterFilm(list, { ...NO_FILM_FILTERS, who: "trainer:t2" }).map((x) => x.id), ["3"]);
  assert.equal(filterFilm(list, NO_FILM_FILTERS).length, 4);
  assert.equal(hasFilmFilters(NO_FILM_FILTERS), false);
  assert.equal(hasFilmFilters({ ...NO_FILM_FILTERS, q: " x " }), true);
});

test("people to pick from: pros and trainers, sorted, each once", () => {
  assert.deepEqual(whoOptions(list).map((o) => `${o.kind}:${o.label}`), ["Pro:Chris Paul", "Pro:Stephen Curry", "Trainer:Micah Lancaster", "Trainer:Reid Ouse"]);
});

test("option counts follow the other filters", () => {
  assert.deepEqual(filmOptionCounts(list, { ...NO_FILM_FILTERS, skill: "shooting" }, "kind", ["technique", "pro_study", "iq"]), { technique: 1, pro_study: 1, iq: 0 });
});
