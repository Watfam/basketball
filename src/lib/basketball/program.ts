/**
 * Program progress — turning "which scheduled days have been completed"
 * into "you are on week 2, day 3."
 *
 * The structural shift this supports: a player following a program is on
 * a plan that moves, not picking from a menu that doesn't. The next
 * session is decided by the schedule, not by a ranking.
 */

export type ProgramDay = {
  id: string;
  week_number: number;
  day_number: number;
  workout_id: string;
  volume_step: number;
  is_deload: boolean;
  note: string | null;
};

export type ProgramForRanking = {
  id: string;
  focus_areas: string[] | null;
  player_type_tags: { positions?: string[]; style_tags?: string[] } | null;
  level: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  ball_handling: "Ball Handling",
  shooting: "Shooting",
  defense: "Defense",
  athleticism: "Athleticism",
};

/**
 * Reorders (never filters) the programs on offer, on the same principle
 * as the workout feed: a block aimed at a genuine weak spot outranks one
 * that isn't, but a player who wants to work on something else can still
 * pick it.
 */
export function rankPrograms<T extends ProgramForRanking>(
  playerType: {
    primary_position?: string | null;
    style_tags?: string[];
    ratings?: Partial<Record<string, number>>;
  },
  level: string | null,
  programs: T[],
  weaknessThreshold: number
): T[] {
  const ratings = playerType.ratings ?? {};
  const styleTags = new Set(playerType.style_tags ?? []);
  const position = playerType.primary_position ?? null;

  return [...programs]
    .map((program, index) => {
      let score = 0;

      for (const area of program.focus_areas ?? []) {
        const value = ratings[area];
        if (value !== undefined && value < weaknessThreshold) score += 3;
      }

      const tags = program.player_type_tags ?? {};
      if (position && tags.positions?.includes(position)) score += 2;
      for (const tag of tags.style_tags ?? []) {
        if (styleTags.has(tag)) score += 1;
      }
      if (level && program.level === level) score += 1;

      return { program, index, score };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((s) => s.program);
}

/** The one-line "why this block" shown on an offered program. */
export function explainProgram(
  playerType: {
    primary_position?: string | null;
    style_tags?: string[];
    ratings?: Partial<Record<string, number>>;
  },
  program: ProgramForRanking,
  weaknessThreshold: number
): string {
  const ratings = playerType.ratings ?? {};

  const weakestFocus = (program.focus_areas ?? [])
    .filter((area) => {
      const value = ratings[area];
      return value !== undefined && value < weaknessThreshold;
    })
    .sort((a, b) => (ratings[a] ?? 0) - (ratings[b] ?? 0))[0];

  if (weakestFocus) {
    return `Built around ${CATEGORY_LABELS[weakestFocus] ?? weakestFocus} — your focus area`;
  }

  const tags = program.player_type_tags ?? {};
  const position = playerType.primary_position ?? null;
  if (position && tags.positions?.includes(position)) return "Written for your position";

  const styleTags = new Set(playerType.style_tags ?? []);
  if ((tags.style_tags ?? []).some((t) => styleTags.has(t))) return "Matches how you play";

  return "Rounds out your game";
}

export type ProgramProgress = {
  /** The next unfinished day, or null once every day is done. */
  nextDay: ProgramDay | null;
  completedDayIds: Set<string>;
  completedCount: number;
  totalCount: number;
  /** 0-1, for the progress ring on the program card. */
  ratio: number;
  isComplete: boolean;
  /** Days grouped by week, ascending — drives the week-by-week view. */
  weeks: { weekNumber: number; days: ProgramDay[] }[];
};

export function computeProgramProgress(
  days: ProgramDay[],
  completedDayIds: Iterable<string>
): ProgramProgress {
  const completed = new Set(completedDayIds);

  const ordered = [...days].sort(
    (a, b) => a.week_number - b.week_number || a.day_number - b.day_number
  );

  // The first day not yet done, in schedule order — so skipping ahead one
  // day doesn't strand the ones behind it.
  const nextDay = ordered.find((d) => !completed.has(d.id)) ?? null;

  const weekMap = new Map<number, ProgramDay[]>();
  ordered.forEach((d) => {
    const list = weekMap.get(d.week_number) ?? [];
    list.push(d);
    weekMap.set(d.week_number, list);
  });

  const weeks = [...weekMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([weekNumber, list]) => ({ weekNumber, days: list }));

  const completedCount = ordered.filter((d) => completed.has(d.id)).length;

  return {
    nextDay,
    completedDayIds: completed,
    completedCount,
    totalCount: ordered.length,
    ratio: ordered.length === 0 ? 0 : completedCount / ordered.length,
    isComplete: ordered.length > 0 && completedCount === ordered.length,
    weeks,
  };
}
