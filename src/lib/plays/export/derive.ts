import type { LibraryPlay } from "../library";
import type { DefenseType, SetType } from "./types";

export function deriveSetType(category: LibraryPlay["category"]): SetType {
  return category === "blob" || category === "slob" ? "blobSlob" : "other";
}

/** Category first (exact for "man"/"zone" plays), then a whole-word scan of `vs` for the rest — see DefenseType's own doc comment for why `null` is a legitimate answer, not a gap. */
export function deriveDefenseType(category: LibraryPlay["category"], vs: string): DefenseType {
  if (category === "man") return "man";
  if (category === "zone") return "zone";
  if (/\bMan\b/.test(vs)) return "man";
  if (/\bZone\b/.test(vs)) return "zone";
  return null;
}
