import type { LibraryPlay } from "./library";
import type { PlayEditRow } from "./play-edits-store";

/** A library play with one override layered on top — the base entry is never mutated. */
export function applyEdit(base: LibraryPlay, edit: PlayEditRow | null | undefined): LibraryPlay {
  if (!edit) return base;
  return { ...base, name: edit.name, vs: edit.vs, about: edit.about, keys: edit.keys, frames: edit.frames };
}

/**
 * A play resolved through every layer, in priority order: the hardcoded library entry, then a
 * corrected shared baseline if one exists (hoops.play_library_overrides), then the viewing team's own
 * edit if it has one (hoops.play_edits) — a team's deliberate local variant still wins even after
 * someone fixes the shared default, so correcting the baseline never silently erases it.
 */
export function resolvePlay(base: LibraryPlay, master: PlayEditRow | null | undefined, teamEdit: PlayEditRow | null | undefined): LibraryPlay {
  return applyEdit(applyEdit(base, master), teamEdit);
}

/** The whole library resolved through both layers for one team, same order and ids, so a renamed play still sorts and links the same way. */
export function mergeLibraryWithEdits(plays: LibraryPlay[], masters: PlayEditRow[], teamEdits: PlayEditRow[]): LibraryPlay[] {
  const masterById = new Map(masters.map((e) => [e.libraryPlayId, e]));
  const teamById = new Map(teamEdits.map((e) => [e.libraryPlayId, e]));
  return plays.map((p) => resolvePlay(p, masterById.get(p.id), teamById.get(p.id)));
}
