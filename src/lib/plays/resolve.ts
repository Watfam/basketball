import { computeCoveragePosition } from "./coverage";
import type { Point } from "./geometry";
import { DEFENDED_HOOP, type DefenseId, type Frame, type OffenseId } from "./types";

export type ResolvedDefender = { id: DefenseId; man: OffenseId; pos: Point };

/**
 * Live defender positions — purely a function of the frame (and, during playback, the ball's actual
 * flight position rather than its eventual holder), never stored except for a Manual defender's own
 * manualPos.
 */
export function resolveDefense(frame: Frame, ballOverride?: Point): ResolvedDefender[] {
  const byOffense = new Map(frame.offense.map((o) => [o.id, o.pos]));
  const ball = ballOverride ?? byOffense.get(frame.ballHolder)!;
  return frame.defense.map((d) => {
    const man = byOffense.get(d.man)!;
    const pos = computeCoveragePosition(d.coverage, man, ball, DEFENDED_HOOP, d.man === frame.ballHolder, d.manualPos);
    return { id: d.id, man: d.man, pos };
  });
}
