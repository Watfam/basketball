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

/** Strips rows with no label — an empty line left in the list shouldn't save. */
export function cleanBlocks(blocks: PracticeBlock[]): PracticeBlock[] {
  return blocks
    .filter((b) => b.label.trim().length > 0)
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

/** Matches typed text against the shared drill library for the link suggestion. */
export function matchDrillName(
  query: string,
  drills: { id: string; name: string }[]
): { id: string; name: string } | null {
  const q = query.trim().toLowerCase();
  if (q.length < 3) return null;
  return drills.find((d) => d.name.toLowerCase().includes(q) || q.includes(d.name.toLowerCase())) ?? null;
}
