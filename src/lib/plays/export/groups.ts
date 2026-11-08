import type { PlayCategory } from "../library";

/**
 * The fixed, top-level section order every playbook view in this app groups categories into —
 * Offense, then Situations, then Defense, always, regardless of any play-level reordering within a
 * section. Shared by the export picker's own selection UI and both export renderers (HTML and PDF)
 * so a section can't silently drift out of sync between "what the picker shows you" and "what
 * actually ships" the way the old BLOB/SLOB flattening bug did.
 */
export const EXPORT_GROUPS: { label: string; categories: PlayCategory[] }[] = [
  { label: "Offense", categories: ["man", "zone"] },
  { label: "Situations", categories: ["blob", "slob", "fullCourt", "late"] },
  { label: "Defense", categories: ["defense"] },
];

/**
 * Partitions plays into the fixed section order above, preserving each play's existing relative
 * order within its own section — this is a stable partition, not a re-sort, so a coach's own
 * "Selected, in this order" arrangement still controls the order WITHIN a section even though
 * sections themselves are always hard-grouped. A section with nothing selected in it is omitted
 * entirely rather than printed empty.
 */
export function groupPlaysBySection<T extends { category: PlayCategory }>(plays: T[]): { label: string; plays: T[] }[] {
  return EXPORT_GROUPS.map((g) => ({ label: g.label, plays: plays.filter((p) => g.categories.includes(p.category)) })).filter((g) => g.plays.length > 0);
}
