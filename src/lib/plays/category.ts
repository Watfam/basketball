/**
 * Pulled out of library.ts on purpose — it's tiny and has zero dependency on the ~2500-line play
 * database, so anything bundled standalone (like the playbook export's player-runtime.ts, esbuilt
 * into a lightweight IIFE for the exported HTML page) can depend on just this without dragging the
 * whole LIBRARY_PLAYS array in. Importing PLAY_CATEGORY_LABEL straight from library.ts once did
 * exactly that — an 8x bundle-size jump (18 KB -> 140 KB) for a small label lookup. library.ts
 * re-exports both names below, so nothing that already imports them from "./library" needs to change.
 */
export type PlayCategory = "man" | "zone" | "blob" | "slob" | "fullCourt" | "late" | "defense";

export const PLAY_CATEGORY_LABEL: Record<PlayCategory, string> = {
  man: "Man",
  zone: "Zone",
  blob: "BLOB",
  slob: "SLOB",
  fullCourt: "Press break",
  late: "Late game",
  defense: "Defense",
};
