/**
 * The Film Room library's search and filters: a word from the title, a pro or a trainer's name, a skill, a kind of lesson, or one specific pro or trainer.
 */
export type FilmLite = {
  id: string;
  title: string;
  kind: string | null;
  skill_tags: string[];
  pro_player_name: string | null;
  trainer_id: string | null;
  trainer_name: string | null;
  duration_seconds: number | null;
};

export type FilmFilters = { q: string; skill: string | null; kind: string | null; who: string | null };
export const NO_FILM_FILTERS: FilmFilters = { q: "", skill: null, kind: null, who: null };
export const hasFilmFilters = (f: FilmFilters) => Boolean(f.q.trim() || f.skill || f.kind || f.who);

/** "who" is "pro:<name>" or "trainer:<id>". */
export function whoOptions(films: FilmLite[]): { value: string; label: string; kind: "Pro" | "Trainer" }[] {
  const pros = new Map<string, string>(), trainers = new Map<string, string>();
  for (const f of films) {
    if (f.pro_player_name) pros.set(f.pro_player_name, f.pro_player_name);
    if (f.trainer_id && f.trainer_name) trainers.set(f.trainer_id, f.trainer_name);
  }
  return [
    ...[...pros.values()].sort((a, b) => a.localeCompare(b)).map((n) => ({ value: `pro:${n}`, label: n, kind: "Pro" as const })),
    ...[...trainers.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => ({ value: `trainer:${id}`, label: n, kind: "Trainer" as const })),
  ];
}

export function matchesFilm(f: FilmLite, x: FilmFilters): boolean {
  const q = x.q.trim().toLowerCase();
  if (q) {
    const hay = `${f.title} ${f.pro_player_name ?? ""} ${f.trainer_name ?? ""}`.toLowerCase();
    if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  if (x.skill && !f.skill_tags.includes(x.skill)) return false;
  if (x.kind && f.kind !== x.kind) return false;
  if (x.who) {
    if (x.who.startsWith("pro:") && f.pro_player_name !== x.who.slice(4)) return false;
    if (x.who.startsWith("trainer:") && f.trainer_id !== x.who.slice(8)) return false;
    if (!x.who.startsWith("pro:") && !x.who.startsWith("trainer:")) return false;
  }
  return true;
}

export const filterFilm = (list: FilmLite[], x: FilmFilters) => list.filter((f) => matchesFilm(f, x));

export function filmOptionCounts(list: FilmLite[], x: FilmFilters, dim: "skill" | "kind" | "who", options: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const o of options) out[o] = list.filter((f) => matchesFilm(f, { ...x, [dim]: o })).length;
  return out;
}
