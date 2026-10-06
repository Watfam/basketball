/**
 * Setting the hoop window's size from the ball itself.
 *
 * A basketball is the same size from every angle, unlike the rim, which
 * seen from the side is a long flat oval (Matt's side-on clip IMG_4851:
 * sizing from the rim said x1.27 the wrong way round). So the window is
 * sized from the ball in the air just above the rim, where nothing hides
 * it: on the training clips it measures 23.7 px there (23.5 and 23.9 on
 * IMG_4839 and IMG_4840, about 280 sightings each).
 *
 * Counting starts at once, at the size remembered on the phone; meanwhile
 * the sizer collects those widths, and once it has enough it says how much
 * to rescale the window. After a rescale the ball is measured once more.
 */

export type Box = { x1: number; y1: number; x2: number; y2: number };

export const AUTO_SIZE = {
  /** The ball in the air above the rim on the training clips, model px. */
  referenceWidth: 23.7,
  /** Where "in the air above the rim" is, model px from the rim. */
  maxSideways: 80,
  minAbove: 60,
  maxAbove: 170,
  /**
   * Sightings per estimate. The ball's width varies a lot from shot to
   * shot (blur, and the ball nearer or farther on its arc): over any 20
   * sightings of the training clips it ranges 0.87-1.27 of the reference,
   * over 30-40 it is within about 5%. 30 is five or six shots.
   */
  samples: 30,
  /** Close enough: counting holds within about 10-15% (training/README.md). */
  tolerance: 0.12,
  maxRounds: 2,
} as const;

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export type SizerState =
  | { kind: "collecting"; have: number; need: number }
  /** Rescale the window by `factor` and measure again. */
  | { kind: "rescale"; factor: number; ballWidth: number }
  /** Settled: `ballWidth` is within tolerance of the reference. */
  | { kind: "done"; ballWidth: number; rounds: number };

export function createAutoSizer() {
  let widths: number[] = [];
  let rounds = 0;
  return {
    /** One frame's ball boxes, and the rim, in the model's input pixels. */
    push(balls: Box[], rim: { x: number; y: number }): SizerState {
      for (const b of balls) {
        const cx = (b.x1 + b.x2) / 2;
        const above = rim.y - (b.y1 + b.y2) / 2;
        if (Math.abs(cx - rim.x) <= AUTO_SIZE.maxSideways && above >= AUTO_SIZE.minAbove && above <= AUTO_SIZE.maxAbove) {
          widths.push(b.x2 - b.x1);
        }
      }
      if (widths.length < AUTO_SIZE.samples) return { kind: "collecting", have: widths.length, need: AUTO_SIZE.samples };
      const ballWidth = median(widths);
      const factor = ballWidth / AUTO_SIZE.referenceWidth;
      rounds += 1;
      widths = [];
      if (Math.abs(factor - 1) <= AUTO_SIZE.tolerance || rounds >= AUTO_SIZE.maxRounds) {
        return { kind: "done", ballWidth, rounds };
      }
      return { kind: "rescale", factor, ballWidth };
    },
  };
}
