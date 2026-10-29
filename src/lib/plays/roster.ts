/** Adding or removing a player from the roster — applied to every frame in the play at once, since who's on the court isn't something that changes frame to frame, only when you're building the play. Capped at the five offense/defense ids the court already has; "removed" just means absent from this play, never a sixth id. */
import type { Point } from "./geometry";
import type { DefenseId, Frame, OffenseId } from "./types";

export function currentOffenseIds(frames: Frame[]): OffenseId[] {
  return frames[0]?.offense.map((o) => o.id) ?? [];
}

export function currentDefenseIds(frames: Frame[]): DefenseId[] {
  return frames[0]?.defense.map((d) => d.id) ?? [];
}

function offenseSpawn(id: OffenseId): Point {
  const n = Number(id.slice(1));
  return { x: 8 + (n - 1) * 8.5, y: 30 };
}

function defenseSpawn(id: DefenseId): Point {
  const n = Number(id.slice(1));
  return { x: 8 + (n - 1) * 8.5, y: 24 };
}

/**
 * Drops an offensive player from every frame. Refuses to go below one offensive player, since the
 * ball always needs a holder. Any defender guarding him, and the ball itself if he was holding it,
 * hand off to another offensive player still on the court — whichever one comes first, since the
 * coach can always reassign it by hand afterward.
 */
export function removeOffense(frames: Frame[], id: OffenseId): Frame[] {
  const ids = currentOffenseIds(frames);
  if (ids.length <= 1 || !ids.includes(id)) return frames;
  const fallback = ids.find((o) => o !== id)!;
  return frames.map((f) => ({
    ...f,
    offense: f.offense.filter((o) => o.id !== id),
    defense: f.defense.map((d) => (d.man === id ? { ...d, man: fallback } : d)),
    ballHolder: f.ballHolder === id ? fallback : f.ballHolder,
  }));
}

/** Adds an offensive player back at a default spot in every frame. No-op if already on court or the roster is already full. */
export function addOffense(frames: Frame[], id: OffenseId): Frame[] {
  const ids = currentOffenseIds(frames);
  if (ids.includes(id) || ids.length >= 5) return frames;
  const pos = offenseSpawn(id);
  return frames.map((f) => ({ ...f, offense: [...f.offense, { id, pos }] }));
}

/** Drops a defender from every frame. Defense can go all the way to zero — an offense-only walkthrough is a real use case. */
export function removeDefense(frames: Frame[], id: DefenseId): Frame[] {
  if (!currentDefenseIds(frames).includes(id)) return frames;
  return frames.map((f) => ({ ...f, defense: f.defense.filter((d) => d.id !== id) }));
}

/** Adds a defender back at a default spot in every frame, guarding the frame's own first offensive player. No-op if already on court or the roster is already full. */
export function addDefense(frames: Frame[], id: DefenseId): Frame[] {
  const ids = currentDefenseIds(frames);
  if (ids.includes(id) || ids.length >= 5) return frames;
  const pos = defenseSpawn(id);
  return frames.map((f) => {
    const man = f.offense[0]?.id;
    if (!man) return f;
    return { ...f, defense: [...f.defense, { id, man, coverage: "manual" as const, manualPos: pos }] };
  });
}
