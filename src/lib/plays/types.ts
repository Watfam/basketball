import type { Coverage } from "./coverage";
import type { Point } from "./geometry";

export const COURT_WIDTH = 50;
export const COURT_LENGTH = 94;
/** The hoop this defense is guarding — at the top of the court. */
export const DEFENDED_HOOP: Point = { x: 25, y: 5.25 };

export type OffenseId = "O1" | "O2" | "O3" | "O4" | "O5";
export type DefenseId = "X1" | "X2" | "X3" | "X4" | "X5";

export const OFFENSE_IDS: OffenseId[] = ["O1", "O2", "O3", "O4", "O5"];
export const DEFENSE_IDS: DefenseId[] = ["X1", "X2", "X3", "X4", "X5"];

export type OffensePlayer = { id: OffenseId; pos: Point };
export type DefensePlayer = { id: DefenseId; man: OffenseId; coverage: Coverage; manualPos?: Point };

export type LineType = "pass" | "cut" | "dribble" | "screen";
export type LineColor = "offense" | "defense" | "black";

export type DrawnLine = {
  id: string;
  type: LineType;
  color: LineColor;
  /** 2 points for a straight line, 3+ for a curve (rendered with Catmull-Rom). */
  points: Point[];
};

export type Frame = {
  offense: OffensePlayer[];
  defense: DefensePlayer[];
  ballHolder: OffenseId;
  lines: DrawnLine[];
  note: string;
};

function offense(id: OffenseId, x: number, y: number): OffensePlayer {
  return { id, pos: { x, y } };
}
function defense(id: DefenseId, man: OffenseId, coverage: Coverage, manualPos?: Point): DefensePlayer {
  return { id, man, coverage, manualPos };
}

/** Frame one of "Run and jump: sideline trap" — the preloaded example play. */
export const EXAMPLE_FRAME: Frame = {
  offense: [offense("O1", 17, 80), offense("O2", 35, 78), offense("O3", 33, 95.8), offense("O4", 8, 58), offense("O5", 36, 30)],
  defense: [
    defense("X1", "O1", "softDeny"),
    defense("X2", "O2", "softDeny"),
    defense("X3", "O3", "manual", { x: 25, y: 72 }),
    defense("X4", "O4", "softDeny"),
    defense("X5", "O5", "loose"),
  ],
  ballHolder: "O3",
  lines: [
    { id: "l1", type: "cut", color: "offense", points: [{ x: 17, y: 80 }, { x: 10, y: 78 }, { x: 6, y: 86 }] },
    { id: "l2", type: "pass", color: "offense", points: [{ x: 33, y: 95.8 }, { x: 6, y: 86 }] },
  ],
  note: "Soft deny the inbound. Allow the catch only below the free throw line, toward the corner — never the middle.",
};
