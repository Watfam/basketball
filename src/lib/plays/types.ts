import type { Coverage } from "./coverage";
import type { Point } from "./geometry";

export const COURT_WIDTH = 50;
/** True NFHS regulation length (84 ft) — not the 94 ft NBA/NCAA length. */
export const COURT_LENGTH = 84;
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
  /** Set by nextFrame() for a player who arrived here along a drawn line — the path to animate during playback. Absent means no animated path (a straight interpolation, or no movement at all). */
  arrivals?: Partial<Record<OffenseId | DefenseId, Point[]>>;
  /** Set by nextFrame() when a pass decided the new ball holder — the path the ball itself travels during playback. */
  ballArrival?: Point[];
};

function offense(id: OffenseId, x: number, y: number): OffensePlayer {
  return { id, pos: { x, y } };
}
function defense(id: DefenseId, man: OffenseId, coverage: Coverage, manualPos?: Point): DefensePlayer {
  return { id, man, coverage, manualPos };
}

/**
 * "Run and jump: sideline trap" — the preloaded example play, six frames. Originally authored for a
 * 94 ft court; every y (never x — the width is unchanged) is scaled by 84/94 to fit the true 84 ft
 * NFHS length while keeping the play's shape and spacing. The hoop/lane/arc themselves are NOT
 * scaled — they're fixed regulation sizes independent of overall court length.
 */
export const EXAMPLE_PLAY: Frame[] = [
  {
    // 1. Inbound
    offense: [offense("O1", 17, 71.49), offense("O2", 35, 69.7), offense("O3", 33, 85.61), offense("O4", 8, 51.83), offense("O5", 36, 26.81)],
    defense: [
      defense("X1", "O1", "softDeny"),
      defense("X2", "O2", "softDeny"),
      defense("X3", "O3", "manual", { x: 25, y: 64.34 }),
      defense("X4", "O4", "softDeny"),
      defense("X5", "O5", "loose"),
    ],
    ballHolder: "O3",
    lines: [
      { id: "l1", type: "cut", color: "offense", points: [{ x: 17, y: 71.49 }, { x: 10, y: 69.7 }, { x: 6, y: 76.85 }] },
      { id: "l2", type: "pass", color: "offense", points: [{ x: 33, y: 85.61 }, { x: 6, y: 76.85 }] },
    ],
    note: "Soft deny the inbound. Allow the catch only below the free throw line, toward the corner — never the middle.",
  },
  {
    // 2. Corner catch
    offense: [offense("O1", 6, 76.85), offense("O2", 35, 69.7), offense("O3", 32, 82.21), offense("O4", 8, 51.83), offense("O5", 36, 26.81)],
    defense: [
      defense("X1", "O1", "onBall"),
      defense("X2", "O2", "bigHelp"),
      defense("X3", "O3", "smallHelp"),
      defense("X4", "O4", "loose"),
      defense("X5", "O5", "loose"),
    ],
    ballHolder: "O1",
    lines: [
      { id: "l3", type: "cut", color: "offense", points: [{ x: 32, y: 82.21 }, { x: 26, y: 73.28 }, { x: 22, y: 62.55 }] },
      { id: "l4", type: "dribble", color: "offense", points: [{ x: 6, y: 76.85 }, { x: 5, y: 65.23 }] },
    ],
    note: "On the catch everyone is full man. X3 gets level with the ball on the inbounder.",
    arrivals: { O1: [{ x: 17, y: 71.49 }, { x: 10, y: 69.7 }, { x: 6, y: 76.85 }] },
    ballArrival: [{ x: 33, y: 85.61 }, { x: 6, y: 76.85 }],
  },
  {
    // 3. Sideline dribble
    offense: [offense("O1", 5, 65.23), offense("O2", 36, 64.34), offense("O3", 22, 62.55), offense("O4", 8, 50.04), offense("O5", 36, 26.81)],
    defense: [
      defense("X1", "O1", "cutOff"),
      defense("X2", "O2", "bigHelp"),
      defense("X3", "O3", "smallHelp"),
      defense("X4", "O4", "fullDeny"),
      defense("X5", "O5", "loose"),
    ],
    ballHolder: "O1",
    lines: [],
    note: "Cut him off up the sideline. The trap comes from the side.",
    arrivals: { O3: [{ x: 32, y: 82.21 }, { x: 26, y: 73.28 }, { x: 22, y: 62.55 }] },
    ballArrival: [{ x: 6, y: 76.85 }, { x: 5, y: 65.23 }],
  },
  {
    // 4. The jump
    offense: [offense("O1", 5, 63.45), offense("O2", 36, 64.34), offense("O3", 21, 58.98), offense("O4", 8, 50.04), offense("O5", 36, 26.81)],
    defense: [
      defense("X1", "O1", "cutOff"),
      defense("X2", "O2", "bigHelp"),
      defense("X3", "O1", "trap"),
      defense("X4", "O4", "fullDeny"),
      defense("X5", "O5", "loose"),
    ],
    ballHolder: "O1",
    lines: [],
    note: "We never trap down from up the floor. Come from the side, knees together, hands high — no reaching.",
  },
  {
    // 5. Dead ball
    offense: [offense("O1", 5, 63.45), offense("O2", 36, 64.34), offense("O3", 21, 58.98), offense("O4", 8, 50.04), offense("O5", 36, 26.81)],
    defense: [
      defense("X3", "O1", "onBall"),
      defense("X1", "O3", "fullDeny"),
      defense("X2", "O2", "softDeny"),
      defense("X4", "O4", "fullDeny"),
      defense("X5", "O5", "fullDeny"),
    ],
    ballHolder: "O1",
    lines: [],
    note: "Dead ball: the jumper stays on the ball. The original ball defender leaves for the most dangerous open man.",
  },
  {
    // 6. Half court
    offense: [offense("O1", 12, 26.81), offense("O2", 40, 25.02), offense("O3", 25, 30.38), offense("O4", 45, 5.36), offense("O5", 18, 8.94)],
    defense: [
      defense("X3", "O1", "onBall"),
      defense("X1", "O3", "fullDeny"),
      defense("X2", "O2", "bigHelp"),
      defense("X4", "O4", "bigHelp"),
      defense("X5", "O5", "fullDeny"),
    ],
    ballHolder: "O1",
    lines: [],
    note: "Into the half court set.",
  },
];
