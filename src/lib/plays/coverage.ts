import { add, clampDistanceTo, distance, scale, sub, unit, type Point } from "./geometry";

export const COVERAGES = [
  "auto",
  "onBall",
  "cutOff",
  "trap",
  "fullDeny",
  "softDeny",
  "loose",
  "smallHelp",
  "bigHelp",
  "jumpLane",
  "manual",
] as const;

export type Coverage = (typeof COVERAGES)[number];

export const COVERAGE_LABEL: Record<Coverage, string> = {
  auto: "Auto",
  onBall: "On ball",
  cutOff: "Cut off",
  trap: "Trap",
  fullDeny: "Full deny",
  softDeny: "Soft deny",
  loose: "Loose",
  smallHelp: "Small help",
  bigHelp: "Big help",
  jumpLane: "Jump the lane",
  manual: "Manual",
};

export const COVERAGE_CUE: Record<Coverage, string> = {
  auto: "Reads man and ball on its own.",
  onBall: "Chest to the ball, between him and the rim.",
  cutOff: "Beat him to the spot. Turn him back into the trap.",
  trap: "Come from the side. Knees together, hands high, no reaching.",
  fullDeny: "Hand and foot in the lane.",
  softDeny: "Upcourt, inside shoulder. Let him catch where we want.",
  loose: "A step and a half off in the lane. Take the lob away.",
  smallHelp: "One step to the ball. See man and ball.",
  bigHelp: "Split the court. Bait the long pass.",
  jumpLane: "Read the passer's eyes. Go get it.",
  manual: "Placed by hand.",
};

const MID_X = 25;

/** Is this man on the same half of the floor (relative to the x = 25 midline) as the ball — the "strong side"? */
export function isBallSide(man: Point, ball: Point): boolean {
  return Math.sign(man.x - MID_X || 1) === Math.sign(ball.x - MID_X || 1);
}

/**
 * Where a defender stands, given his man (M), the ball (B) and the hoop
 * he's defending (H). `manHasBall` short-circuits Auto's first branch
 * without relying on float equality between M and B.
 */
export function computeCoveragePosition(
  coverage: Coverage,
  man: Point,
  ball: Point,
  hoop: Point,
  manHasBall: boolean,
  manual?: Point
): Point {
  if (coverage === "manual") return manual ?? man;

  const dBallToHoop = unit(sub(hoop, ball));
  const dB = distance(man, ball);
  const u = unit(sub(ball, man)); // man -> ball
  const h = unit(sub(hoop, man)); // man -> hoop

  switch (coverage) {
    case "onBall":
      return add(ball, scale(dBallToHoop, 2.6));

    case "cutOff": {
      const base = add(ball, scale(dBallToHoop, 3.2));
      const sidewaysSign = Math.sign(ball.x - MID_X) || 1;
      return add(base, { x: sidewaysSign * 1.1, y: 0 });
    }

    case "trap": {
      const towardMiddle = Math.sign(MID_X - ball.x) || 1;
      return { x: ball.x + towardMiddle * 3.1, y: ball.y };
    }

    case "fullDeny":
      return add(add(man, scale(u, Math.min(1.7, Math.max(0, dB - 2)))), scale(h, 0.6));

    case "softDeny":
      return add(add(man, scale(u, Math.min(1.8, Math.max(0, dB - 2)))), scale(h, 2.2));

    case "loose":
      return add(add(man, scale(u, Math.min(3.2, Math.max(0, dB - 2)))), scale(h, 1.2));

    case "smallHelp":
      return add(add(man, scale(u, Math.min(7, 0.3 * dB))), scale(h, 1.5));

    case "bigHelp": {
      if (isBallSide(man, ball)) {
        return add(add(man, scale(u, Math.min(10, 0.45 * dB))), scale(h, 2));
      }
      const towardSide = Math.sign(man.x - MID_X) || 1;
      const target: Point = { x: MID_X + towardSide * 1.5, y: (man.y + ball.y) / 2 };
      return clampDistanceTo(man, target, 14);
    }

    case "jumpLane":
      return add(man, scale(u, Math.min(0.42 * dB, 10)));

    case "auto": {
      if (manHasBall) return add(ball, scale(dBallToHoop, 2.6));
      if (dB <= 15) return add(add(man, scale(u, Math.min(1.7, Math.max(0, dB - 2)))), scale(h, 0.6));
      if (isBallSide(man, ball)) return add(add(man, scale(u, Math.min(3.2, Math.max(0, dB - 2)))), scale(h, 1.2));
      {
        const towardSide = Math.sign(man.x - MID_X) || 1;
        const target: Point = { x: MID_X + towardSide * 1.5, y: (man.y + ball.y) / 2 };
        return clampDistanceTo(man, target, 14);
      }
    }

    default:
      return man;
  }
}
