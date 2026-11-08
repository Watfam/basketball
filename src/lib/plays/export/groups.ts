import { PLAY_CATEGORY_LABEL, type PlayCategory } from "../category";

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

export type ExportSubgroup<T> = { label: string; plays: T[] };
export type ExportSection<T> = {
  label: string;
  /** Whether a section's own sub-labels (e.g. "BLOB", "SLOB") are worth showing at all — only when the
   * section spans more than one real category to begin with, matching the picker's own established rule
   * (`group.categories.length > 1`). A section built from a single category (Defense) would just repeat
   * its own name as a redundant sub-header otherwise. */
  showSubLabels: boolean;
  subgroups: ExportSubgroup<T>[];
};

/**
 * Partitions plays into the fixed section order above, then further splits each section by its
 * EXACT category (BLOB vs SLOB vs Press break vs Late game, say) — same two-level grouping the main
 * Playbook browser and the export picker's own catalog already use, now shared so the actual shipped
 * output (HTML link, PDF) can't flatten "Situations" into one undifferentiated block the way the old
 * export-picker bug once did for its own selection UI (see project memory for that history). Both
 * levels are stable partitions, not re-sorts — a coach's own "Selected, in this order" arrangement
 * still controls the order WITHIN its category. A section or subgroup with nothing selected in it is
 * omitted entirely rather than printed empty.
 */
export function groupPlaysBySection<T extends { category: PlayCategory }>(plays: T[]): ExportSection<T>[] {
  return EXPORT_GROUPS.map((g) => {
    const subgroups = g.categories
      .map((cat) => ({ label: PLAY_CATEGORY_LABEL[cat], plays: plays.filter((p) => p.category === cat) }))
      .filter((sg) => sg.plays.length > 0);
    return { label: g.label, showSubLabels: g.categories.length > 1, subgroups };
  }).filter((g) => g.subgroups.length > 0);
}
