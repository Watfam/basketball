/**
 * Practice plan domain types.
 *
 * A plan is a title, an optional date, and an ordered list of blocks
 * stored as JSONB — deliberately not a normalized child table, since a
 * block is only ever read or written as part of its whole plan and never
 * queried on its own. Same reasoning as workouts.player_type_tags
 * elsewhere in this schema.
 *
 * minutes/notes/drillId are all optional on purpose. The first version of
 * this builder required all three per block and Matt's actual practice
 * notes (a flat list of drill names, nothing else) made clear that was
 * the wrong default — a coach writing a plan fast wants to type a name
 * and move to the next line, not fill out a form per drill.
 */

export type PracticeBlock = {
  label: string;
  minutes?: number;
  notes?: string;
  // Set when this block's name matched something in the shared drill
  // library — lets the session-player-style cues show up later without
  // the coach having to retype them.
  drillId?: string;
  // A group divider (Matt's blank-line-separated sections) rather than a
  // timed block — rendered differently, never counted in minutes or the
  // block count.
  isSection?: boolean;
};

export function totalMinutes(blocks: PracticeBlock[]): number {
  return blocks.reduce((sum, b) => sum + (b.isSection ? 0 : b.minutes ?? 0), 0);
}

export function emptyBlock(): PracticeBlock {
  return { label: "" };
}

/**
 * Strips rows with no label — an empty line left in the list shouldn't
 * save. Group headers are exempt: a header names the group that follows
 * it (see toRunnableSteps), not the row itself, so it's kept even blank
 * — dropping it would silently merge two groups back together.
 */
export function cleanBlocks(blocks: PracticeBlock[]): PracticeBlock[] {
  return blocks
    .filter((b) => b.isSection || b.label.trim().length > 0)
    .map((b) => ({
      label: b.label.trim(),
      ...(b.minutes ? { minutes: b.minutes } : {}),
      ...(b.notes?.trim() ? { notes: b.notes.trim() } : {}),
      ...(b.drillId ? { drillId: b.drillId } : {}),
      ...(b.isSection ? { isSection: true } : {}),
    }));
}

/**
 * Turns a pasted flat list — exactly how Matt already writes these in
 * Notes — into blocks. One drill per line; a blank line becomes a
 * section divider, matching the grouping he already uses instead of
 * forcing him to learn a new structure.
 *
 * Two blank lines in a row collapse to one divider rather than stacking
 * empty sections, and a divider never opens or closes the list — leading
 * and trailing blank lines are dropped.
 */
export function parsePastedList(text: string): PracticeBlock[] {
  const lines = text.split("\n").map((l) => l.trim());
  const blocks: PracticeBlock[] = [];

  lines.forEach((line) => {
    if (line === "") {
      const last = blocks[blocks.length - 1];
      if (blocks.length > 0 && !last.isSection) blocks.push({ label: "", isSection: true });
      return;
    }
    blocks.push({ label: line });
  });

  while (blocks.length > 0 && blocks[blocks.length - 1].isSection) blocks.pop();

  return blocks;
}

/**
 * A coach's own most-used drill names, ranked by how often they show up
 * across past plans for this team. Nothing to set up — it builds itself
 * from what's already been typed, so "Jump-Switch Mechanics" only ever
 * needs typing once before it's a tap away on every plan after.
 *
 * Deliberately separate from the shared hoops.drills library: "Celtic
 * drill," "4UP," "Cycle" are this coach's own shorthand, not something
 * that belongs in a library every other coach reads.
 */
export function frequentDrillNames(pastBlocks: PracticeBlock[][], limit = 8): string[] {
  const counts = new Map<string, number>();
  pastBlocks.forEach((blocks) => {
    blocks.forEach((b) => {
      if (b.isSection || !b.label.trim()) return;
      const key = b.label.trim();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name]) => name);
}

export type PracticeShapeKey = "standard" | "install" | "gameprep" | "recovery";

/**
 * Named percentage splits for the "Generate skeleton" quick-start. These
 * are structural shapes only — no drill names — because matching a
 * generic shape to a real drill needs the shared drill library tagged by
 * scheme concept (press, transition, half-court), and it isn't yet. A
 * wrong guess mid-practice is worse than a blank row, so the skeleton
 * only ever commits to names and minutes.
 */
export const PRACTICE_SHAPES: Record<
  PracticeShapeKey,
  { label: string; description: string; groups: { name: string; pct: number }[] }
> = {
  standard: {
    label: "Standard",
    description: "Warmup, skill work, team concepts, scrimmage",
    groups: [
      { name: "Warmup", pct: 0.1 },
      { name: "Ballhandling & Finishing", pct: 0.2 },
      { name: "Team Defense", pct: 0.25 },
      { name: "Team Offense", pct: 0.2 },
      { name: "Scrimmage", pct: 0.2 },
      { name: "Free Throws", pct: 0.05 },
    ],
  },
  install: {
    label: "Install Day",
    description: "Heavy on teaching one new concept",
    groups: [
      { name: "Warmup", pct: 0.1 },
      { name: "New Concept Walkthrough", pct: 0.35 },
      { name: "Team Defense Reps", pct: 0.25 },
      { name: "Live Reps", pct: 0.2 },
      { name: "Conditioning", pct: 0.1 },
    ],
  },
  gameprep: {
    label: "Game Prep",
    description: "Scouting-driven, ends live",
    groups: [
      { name: "Warmup", pct: 0.1 },
      { name: "Scout Defense", pct: 0.25 },
      { name: "Scout Offense", pct: 0.2 },
      { name: "Scrimmage — Game Situations", pct: 0.35 },
      { name: "Free Throws", pct: 0.1 },
    ],
  },
  recovery: {
    label: "Recovery",
    description: "Lighter load, shooting-heavy",
    groups: [
      { name: "Warmup", pct: 0.15 },
      { name: "Shooting", pct: 0.3 },
      { name: "Skill Stations", pct: 0.3 },
      { name: "Free Throws", pct: 0.15 },
      { name: "Cool-Down", pct: 0.1 },
    ],
  },
};

/**
 * Names + times only, generated instantly from a chosen shape and total
 * duration. Each group becomes a header row (its name) followed by one
 * blank timed row sized to that group's share of the total — a fast
 * starting skeleton the coach fills in or splits further, never a
 * finished plan.
 */
export function generateSkeleton(shape: PracticeShapeKey, totalMinutes: number): PracticeBlock[] {
  const groups = PRACTICE_SHAPES[shape].groups;
  const { blocks } = groups.reduce(
    (acc, group, i) => {
      const minutes =
        i === groups.length - 1 ? totalMinutes - acc.allocated : Math.round(group.pct * totalMinutes);
      return {
        allocated: acc.allocated + minutes,
        blocks: [...acc.blocks, { label: group.name, isSection: true }, { label: "", minutes }],
      };
    },
    { allocated: 0, blocks: [] as PracticeBlock[] }
  );
  return blocks;
}

export type RunnableStep = {
  label: string;
  minutes?: number;
  notes?: string;
  groupName: string | null;
};

/**
 * Flattens blocks into the steps Run Practice actually steps through —
 * group headers become context on the drills that follow them rather
 * than steps of their own, and empty rows drop out.
 */
export function toRunnableSteps(blocks: PracticeBlock[]): RunnableStep[] {
  const { steps } = blocks.reduce(
    (acc, block) => {
      if (block.isSection) {
        return { groupName: block.label.trim() || null, steps: acc.steps };
      }
      if (!block.label.trim()) return acc;
      const step: RunnableStep = {
        label: block.label,
        minutes: block.minutes,
        notes: block.notes,
        groupName: acc.groupName,
      };
      return { groupName: acc.groupName, steps: [...acc.steps, step] };
    },
    { groupName: null as string | null, steps: [] as RunnableStep[] }
  );
  return steps;
}

/** Matches typed text against the shared drill library for the link suggestion. */
export function matchDrillName(
  query: string,
  drills: { id: string; name: string }[]
): { id: string; name: string } | null {
  const q = query.trim().toLowerCase();
  if (q.length < 3) return null;
  return drills.find((d) => d.name.toLowerCase().includes(q) || q.includes(d.name.toLowerCase())) ?? null;
}
