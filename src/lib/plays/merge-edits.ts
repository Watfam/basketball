import type { LibraryPlay } from "./library";
import type { PlayEditRow } from "./play-edits-store";

/** A library play with one team's saved edit (if any) layered on top — the base entry is never mutated. */
export function applyEdit(base: LibraryPlay, edit: PlayEditRow | null | undefined): LibraryPlay {
  if (!edit) return base;
  return { ...base, name: edit.name, vs: edit.vs, about: edit.about, keys: edit.keys, frames: edit.frames };
}

/** The whole library with a team's edits merged in, same order and ids, so a renamed play still sorts and links the same way. */
export function mergeLibraryWithEdits(plays: LibraryPlay[], edits: PlayEditRow[]): LibraryPlay[] {
  const byId = new Map(edits.map((e) => [e.libraryPlayId, e]));
  return plays.map((p) => applyEdit(p, byId.get(p.id)));
}
