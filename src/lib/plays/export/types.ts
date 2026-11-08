import type { Frame } from "../types";
import type { PlayCategory } from "../category";

/** A play's broad "set type" for the export's filter bar — the one axis that's 100% reliable off existing data (category), unlike man-vs-zone (see DefenseType below). */
export type SetType = "blobSlob" | "other";

/**
 * Man-vs-zone, derived from the play's own category first, then its `vs` text, falling back to
 * `null` when neither says — about a fifth of the library (plain BLOB/SLOB shapes, late-game calls,
 * a couple of defensive concepts) genuinely isn't drawn against one specific defense. A `null` play
 * is shown under either filter rather than hidden, since excluding it would be a false negative, not
 * a correct exclusion.
 */
export type DefenseType = "man" | "zone" | null;

export type ExportPlay = {
  id: string;
  name: string;
  category: PlayCategory;
  categoryLabel: string;
  setType: SetType;
  defenseType: DefenseType;
  vs: string;
  about: string;
  keys: string[];
  frames: Frame[];
};

export type ExportData = {
  generatedAt: string;
  team: { name: string; subtitle: string; logoDataUri: string; navy: string; gold: string; silver: string; paper: string; stripe: string };
  plays: ExportPlay[];
};
