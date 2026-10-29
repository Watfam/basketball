/**
 * Starting alignments — not full plays, just a shape to drop onto a frame instead of placing five
 * players by hand every time. Offense sets give five spots; defensive shells give both the shell
 * itself and a generic entry alignment for the offense it's set against. Coordinates follow the same
 * convention as src/lib/plays/library.ts: the attacking hoop is DEFENDED_HOOP (25, 5.25), baseline at
 * y = 0, half court around y = 32-34.
 */
import type { DefenseId, Frame, OffenseId } from "./types";
import type { Point } from "./geometry";

export type Formation = {
  id: string;
  name: string;
  category: "offense" | "defense";
  description: string;
  offense: { id: OffenseId; pos: Point }[];
  /** Only set for a defensive shell — the man assignment here is a formality (coverage is always "manual"); the shell's own shape is what the position teaches, not who guards whom. */
  defense?: { id: DefenseId; pos: Point; man: OffenseId }[];
};

function o(id: OffenseId, x: number, y: number) {
  return { id, pos: { x, y } };
}
function d(id: DefenseId, man: OffenseId, x: number, y: number) {
  return { id, man, pos: { x, y } };
}

const FIVE_OUT_OFFENSE = [o("O1", 25, 32), o("O2", 44.5, 21), o("O3", 5.5, 21), o("O4", 47, 3.5), o("O5", 3, 3.5)];

export const FORMATIONS: Formation[] = [
  {
    id: "5-out",
    name: "5-Out",
    category: "offense",
    description: "Five spots on the perimeter, the lane completely open for a drive or a cut.",
    offense: FIVE_OUT_OFFENSE,
  },
  {
    id: "horns",
    name: "Horns",
    category: "offense",
    description: "Point at the top, two bigs at the elbows, shooters spotted up on the wings.",
    offense: [o("O1", 25, 33), o("O2", 19, 21), o("O3", 31, 21), o("O4", 6, 18), o("O5", 44, 18)],
  },
  {
    id: "box",
    name: "Box",
    category: "offense",
    description: "A point at the top, two at the elbows, two on the blocks — the standard zone/BLOB box.",
    offense: [o("O1", 25, 33), o("O2", 19, 21), o("O3", 31, 21), o("O4", 20, 8), o("O5", 30, 8)],
  },
  {
    id: "1-3-1-offense",
    name: "1-3-1",
    category: "offense",
    description: "Point, two wings and a high post across the middle, one more on the baseline.",
    offense: [o("O1", 25, 34), o("O2", 8, 20), o("O3", 42, 20), o("O4", 25, 19), o("O5", 25, 8)],
  },
  {
    id: "pistol",
    name: "Pistol",
    category: "offense",
    description: "Ball at the wing with a big up to screen, a shooter in the weak corner, a dunker spot underneath.",
    offense: [o("O1", 38, 26), o("O2", 30, 22), o("O3", 4, 4), o("O4", 10, 20), o("O5", 38, 7)],
  },
  {
    id: "floppy",
    name: "Floppy",
    category: "offense",
    description: "A double stack on one block for a shooter to curl off either side of, point up top.",
    offense: [o("O1", 25, 34), o("O2", 18, 7), o("O3", 18, 11), o("O4", 44, 22), o("O5", 44, 4)],
  },
  {
    id: "man-shell",
    name: "Man shell",
    category: "defense",
    description: "Base man-to-man shell off a 5-out spacing — on-ball pressure, every help defender a step off his man toward the ball.",
    offense: FIVE_OUT_OFFENSE,
    defense: [d("X1", "O1", 25, 27), d("X2", "O2", 40, 19), d("X3", "O3", 10, 19), d("X4", "O4", 42, 6), d("X5", "O5", 8, 6)],
  },
  {
    id: "2-3-zone",
    name: "2-3 Zone",
    category: "defense",
    description: "Two guards up top, three underneath — strong on the block and the post, soft at the wings.",
    offense: [o("O1", 25, 32), o("O2", 40, 21), o("O3", 10, 21), o("O4", 42, 5), o("O5", 8, 5)],
    defense: [d("X1", "O1", 17, 24), d("X2", "O2", 33, 24), d("X3", "O3", 10, 12), d("X4", "O4", 40, 12), d("X5", "O5", 25, 9)],
  },
  {
    id: "3-2-zone",
    name: "3-2 Zone",
    category: "defense",
    description: "Three across the top, two on the blocks — stronger on the perimeter, softer in the post.",
    offense: [o("O1", 25, 32), o("O2", 40, 21), o("O3", 10, 21), o("O4", 42, 5), o("O5", 8, 5)],
    defense: [d("X1", "O1", 25, 26), d("X2", "O2", 12, 20), d("X3", "O3", 38, 20), d("X4", "O4", 18, 9), d("X5", "O5", 32, 9)],
  },
  {
    id: "1-3-1-zone",
    name: "1-3-1 Zone",
    category: "defense",
    description: "A point of attack up top, a wall across the middle, one defender deep on the baseline.",
    offense: [o("O1", 25, 33), o("O2", 10, 22), o("O3", 40, 22), o("O4", 25, 18), o("O5", 25, 6)],
    defense: [d("X1", "O1", 25, 28), d("X2", "O2", 10, 16), d("X3", "O3", 40, 16), d("X4", "O4", 25, 14), d("X5", "O5", 25, 6)],
  },
];

/**
 * A new frame seeded from a formation, built against `base` (normally the currently active frame) so
 * it only places whoever is actually on the court right now — a player removed from the roster never
 * reappears just because a formation mentions him. Offense-category formations leave the defense
 * array untouched: whatever coverage formulas were already set keep reacting live to the new offense
 * positions on their own. Starts with no lines, an empty note, and no recorded arrivals — the straight
 * glide into it is exactly right since there's no drawn path to follow.
 */
export function formationFrame(formation: Formation, base: Frame): Frame {
  const presentOffense = new Set(base.offense.map((o) => o.id));
  const byFormationId = new Map(formation.offense.map((o) => [o.id, o.pos]));
  const offense = base.offense.map((o) => ({ ...o, pos: byFormationId.get(o.id) ?? o.pos }));

  let defense = base.defense;
  if (formation.category === "defense" && formation.defense) {
    const byId = new Map(formation.defense.map((d) => [d.id, d]));
    defense = base.defense.map((def) => {
      const fd = byId.get(def.id);
      if (!fd) return def;
      return { ...def, coverage: "manual" as const, manualPos: fd.pos, man: presentOffense.has(fd.man) ? fd.man : def.man };
    });
  }

  const ballHolder = presentOffense.has(base.ballHolder) ? base.ballHolder : (offense[0]?.id ?? base.ballHolder);

  return { offense, defense, ballHolder, lines: [], note: formation.description, arrivals: undefined, ballArrival: undefined };
}
