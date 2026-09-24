/**
 * Practice plan domain types.
 *
 * A plan is a title, an optional date, and an ordered list of blocks
 * stored as JSONB — deliberately not a normalized child table, since a
 * block is only ever read or written as part of its whole plan and never
 * queried on its own. Same reasoning as workouts.player_type_tags
 * elsewhere in this schema.
 */

export type PracticeBlock = {
  label: string;
  minutes: number;
  notes: string;
};

export function totalMinutes(blocks: PracticeBlock[]): number {
  return blocks.reduce((sum, b) => sum + (Number.isFinite(b.minutes) ? b.minutes : 0), 0);
}

/** A fresh block for the builder — always start at zero minutes, not undefined. */
export function emptyBlock(): PracticeBlock {
  return { label: "", minutes: 0, notes: "" };
}

/** Strips blocks with no label — an empty row left in the builder shouldn't save. */
export function cleanBlocks(blocks: PracticeBlock[]): PracticeBlock[] {
  return blocks
    .filter((b) => b.label.trim().length > 0)
    .map((b) => ({ label: b.label.trim(), minutes: Math.max(0, b.minutes || 0), notes: b.notes.trim() }));
}
