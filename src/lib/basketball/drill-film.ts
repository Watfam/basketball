import { isWatchableUrl } from "./film.ts";

/**
 * Which Film Room lesson goes with a drill, from what the app already has. Nothing is added to the Film Room and no lesson is duplicated:
 *  - "linked": the lesson row's own drill_id points at this drill (hoops.film_resources.drill_id), the relationship the Film Room already keeps;
 *  - "related": the drill has no linked lesson, but a shooting lesson teaches the same named skill (pull-up, step-back, catch-and-shoot,
 *    free throw, form). It is shown as related, never as the drill's own lesson.
 * The video address is the household's own link when one was attached (hoops.film_links), else the lesson's address. A lesson with no address
 * says so; an address is never invented.
 */
export type Lesson = {
  id: string;
  title: string;
  url: string | null;
  watch_for: string[] | null;
  notes?: string | null;
  skill_tags?: string[] | null;
  drill_id?: string | null;
  sort_order?: number | null;
};

const SKILL_TERMS: { drill: RegExp; lesson: RegExp }[] = [
  { drill: /pull-?up/i, lesson: /pull-?up/i },
  { drill: /step-?back/i, lesson: /step-?back|separation/i },
  { drill: /catch[- ]and[- ]shoot|pin-?down/i, lesson: /catch[- ]and[- ]shoot|pin-?down|off the catch/i },
  { drill: /free[- ]?throw/i, lesson: /free[- ]?throw/i },
  { drill: /form shooting/i, lesson: /release|form shooting/i },
];

export function lessonForDrill(drill: { id: string; name: string }, lessons: Lesson[]): { lesson: Lesson; basis: "linked" | "related" } | null {
  const order = (a: Lesson, b: Lesson) => (a.sort_order ?? 0) - (b.sort_order ?? 0);
  const linked = lessons.filter((l) => l.drill_id === drill.id).sort(order)[0];
  if (linked) return { lesson: linked, basis: "linked" };
  for (const t of SKILL_TERMS) {
    if (!t.drill.test(drill.name)) continue;
    const hit = lessons.filter((l) => (l.skill_tags ?? []).includes("shooting") && t.lesson.test(`${l.title}`)).sort(order)[0];
    if (hit) return { lesson: hit, basis: "related" };
  }
  return null;
}

/** The household's own link wins; otherwise the lesson's. Only a watchable address is ever returned. */
export function lessonUrl(lesson: Pick<Lesson, "id" | "url">, householdLinks: ReadonlyMap<string, string>): string | null {
  const own = householdLinks.get(lesson.id);
  if (own && isWatchableUrl(own)) return own;
  return lesson.url && isWatchableUrl(lesson.url) ? lesson.url : null;
}
