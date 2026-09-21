/**
 * Film Room domain types and ranking.
 *
 * The organising idea is that film is a lesson, not a link: every entry
 * carries what to watch for, and the app's job is to put the right lesson
 * in front of a player at a moment when it will land — next to the drill
 * they're about to run, or on the day their program calls for study.
 */

export const FILM_KINDS = [
  { value: "technique", label: "Technique", blurb: "How the movement is actually executed" },
  { value: "pro_study", label: "Pro Film", blurb: "Watching someone good do it live" },
  { value: "iq", label: "Game IQ", blurb: "Reads and decisions, not moves" },
  { value: "mentality", label: "Mentality", blurb: "The part between the ears" },
] as const;

export type FilmKind = (typeof FILM_KINDS)[number]["value"];

export const FILM_KIND_LABELS: Record<string, string> = Object.fromEntries(
  FILM_KINDS.map((k) => [k.value, k.label])
);

export type Trainer = {
  id: string;
  name: string;
  handle: string | null;
  youtube_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  website_url: string | null;
  bio: string | null;
  specialty: string[] | null;
};

export type FilmResource = {
  id: string;
  title: string;
  url: string | null;
  kind: string | null;
  difficulty: string | null;
  skill_tags: string[] | null;
  position_tags: string[] | null;
  watch_for: string[] | null;
  notes: string | null;
  duration_seconds: number | null;
  drill_id: string | null;
  trainer_id: string | null;
  added_by_household_id: string | null;
  sort_order: number | null;
};

export const SKILL_LABELS: Record<string, string> = {
  ball_handling: "Ball Handling",
  shooting: "Shooting",
  defense: "Defense",
  athleticism: "Athleticism",
};

/**
 * Orders film toward what this player most needs: their genuinely weak
 * skills first, then their position, then unwatched over already-seen.
 * Reorders, never filters — the same rule the workout feed follows.
 */
export function rankFilm<T extends FilmResource>(
  playerType: {
    primary_position?: string | null;
    ratings?: Partial<Record<string, number>>;
  },
  film: T[],
  watchedIds: Set<string>,
  weaknessThreshold: number
): T[] {
  const ratings = playerType.ratings ?? {};
  const position = playerType.primary_position ?? null;

  return [...film]
    .map((f, index) => {
      let score = 0;

      for (const skill of f.skill_tags ?? []) {
        const value = ratings[skill];
        if (value !== undefined && value < weaknessThreshold) score += 3;
      }

      if (position && (f.position_tags ?? []).includes(position)) score += 2;

      // Mentality and IQ pieces aren't tied to a weak rating, so without
      // a nudge they'd always sink below technique work. They're the
      // pieces most likely to actually change how a kid plays.
      if (f.kind === "mentality" || f.kind === "iq") score += 1;

      // Seen it already — still available, just not first.
      if (watchedIds.has(f.id)) score -= 4;

      return { film: f, index, score };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.film.sort_order ?? 0) - (b.film.sort_order ?? 0) ||
        a.index - b.index
    )
    .map((s) => s.film);
}

/** "12 min" — only when a duration was recorded. */
export function durationLabel(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.round(seconds / 60);
  return minutes < 1 ? "<1 min" : `${minutes} min`;
}

/**
 * Whether a link is safe to render as a watch button.
 *
 * Curated lessons ship without URLs on purpose, and household-added ones
 * are typed in by hand, so this guards both the "no link yet" case and a
 * malformed or non-http paste (javascript: most of all).
 */
export function isWatchableUrl(url: string | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
