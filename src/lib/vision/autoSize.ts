/**
 * Setting the hoop window's size from the ball itself.
 *
 * A basketball is the same size from every angle, unlike the rim, which
 * seen from the side is a long flat oval (Matt's side-on clip IMG_4851:
 * sizing from the rim said x1.27 the wrong way round). So the window is
 * sized from the ball in flight around and above the rim: on the training
 * clips it measures 23.7 px there (IMG_4839 and IMG_4840).
 *
 * Widths are taken per flight, not per sighting: the sightings of one
 * flight all lean the same way (the ball nearer the camera on its way in
 * looks bigger), so the first 20 or 30 sightings, all from one or two
 * shots, read 20-30% high even on the training clips. The median of each
 * flight, then the median over five flights, lands within about 5% on the
 * training clips and at x1.22-1.30 on IMG_4851 (where x1.2-1.4 all count
 * 11 of 12 right, and x1.0 only 9).
 *
 * Counting starts at once, at the size remembered on the phone; meanwhile
 * the sizer measures, and once it has enough flights it says how much to
 * rescale the window. After a rescale the ball is measured once more.
 */

export type Box = { x1: number; y1: number; x2: number; y2: number };

export const AUTO_SIZE = {
  /** The ball in flight near the rim on the training clips, model px. */
  referenceWidth: 23.7,
  /**
   * Where the ball is measured, model px from the rim. Wide sideways: seen
   * from the side the ball comes in across the window, not from above.
   */
  maxSideways: 140,
  minAbove: 25,
  maxAbove: 180,
  /** A sighting counts only if the ball moved this far (px) since the frame before: a still mark on a wall never does. */
  minMove: 3,
  maxMove: 100,
  /** The frame before must be this recent, ms. */
  maxFrameGapMs: 250,
  /** A pause this long (ms) with no sighting ends a flight. */
  flightGapMs: 500,
  /** Sightings a flight needs to count. */
  perFlight: 2,
  /** Flights per estimate: about five shots. */
  flights: 5,
  /** Close enough: training's worst five-flight estimate is 1.11, and counting holds within about 15%. */
  tolerance: 0.15,
  maxRounds: 2,
} as const;

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const centre = (b: Box) => ({ x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 });

export type SizerState =
  | { kind: "collecting"; have: number; need: number }
  /** Rescale the window by `factor` and measure again. */
  | { kind: "rescale"; factor: number; ballWidth: number }
  /** Settled: `ballWidth` is within tolerance of the reference. */
  | { kind: "done"; ballWidth: number; rounds: number };

export function createAutoSizer(windowSide = 416) {
  let flightMedians: number[] = [];
  let flight: number[] = [];
  let lastSightingMs = -Infinity;
  let prev: { t: number; balls: Box[] } | null = null;
  let rounds = 0;

  const closeFlight = () => {
    if (flight.length >= AUTO_SIZE.perFlight) flightMedians.push(median(flight));
    flight = [];
  };

  return {
    /** One frame: its time, its ball boxes, and the rim, in the model's input pixels. */
    push(tMs: number, balls: Box[], rim: { x: number; y: number }): SizerState {
      if (flight.length && tMs - lastSightingMs > AUTO_SIZE.flightGapMs) closeFlight();
      const before = prev && tMs - prev.t <= AUTO_SIZE.maxFrameGapMs ? prev.balls : [];
      for (const b of balls) {
        const w = b.x2 - b.x1;
        const h = b.y2 - b.y1;
        const c = centre(b);
        const above = rim.y - c.y;
        if (Math.abs(c.x - rim.x) > AUTO_SIZE.maxSideways || above < AUTO_SIZE.minAbove || above > AUTO_SIZE.maxAbove) continue;
        // Cut off by the window's edge, or squashed by blur: not its true width.
        if (b.x1 < 2 || b.x2 > windowSide - 2 || b.y1 < 2) continue;
        if (w / h < 0.8 || w / h > 1.25) continue;
        const moving = before.some((p) => {
          const pc = centre(p);
          const d = Math.hypot(c.x - pc.x, c.y - pc.y);
          return d >= AUTO_SIZE.minMove && d <= AUTO_SIZE.maxMove;
        });
        if (!moving) continue;
        flight.push(w);
        lastSightingMs = tMs;
      }
      prev = { t: tMs, balls };

      if (flightMedians.length < AUTO_SIZE.flights) {
        return { kind: "collecting", have: flightMedians.length, need: AUTO_SIZE.flights };
      }
      const ballWidth = median(flightMedians);
      const factor = ballWidth / AUTO_SIZE.referenceWidth;
      rounds += 1;
      flightMedians = [];
      flight = [];
      prev = null;
      if (Math.abs(factor - 1) <= AUTO_SIZE.tolerance || rounds >= AUTO_SIZE.maxRounds) {
        return { kind: "done", ballWidth, rounds };
      }
      return { kind: "rescale", factor, ballWidth };
    },
  };
}
