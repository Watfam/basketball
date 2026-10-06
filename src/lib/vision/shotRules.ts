/**
 * Make or miss, decided from ball detections around the rim.
 *
 * This is the rule measured offline in training/README.md, ported so it
 * runs one frame at a time on the phone:
 *
 * - Shots are found as in training/tools/23-shot-candidates.mjs: a ball
 *   seen in the zone around the rim opens a shot; zone sightings less than
 *   40 frames apart belong to the same shot; a shot needs at least two.
 * - Each shot is called as in training/tools/40-score-rules.py, both
 *   versions:
 *   V1: make if a ball at least 18 px wide is seen at least 30 px below the
 *       rim and within 45 px sideways, in the 40 frames from the first zone
 *       sighting. Unseen clips: 22 of 28 and 26 of 32.
 *   V2: the same over 70 frames, except that a ball below the net that looks
 *       much bigger than it did at the rim (median width of its first 8
 *       sightings >= 26 px and >= 1.2x the zone width) fell in front of the
 *       hoop, so it is a miss. Unseen clip: 28 of 32.
 *
 * All positions are in the 416 px hoop window cut from native 1080p video,
 * with the rim at (rim.x, rim.y) inside it; all sizes in pixels assume that
 * scale. Frame counts are at the 29.97 fps the clips were filmed at. The
 * live camera may run slower, so time is passed in milliseconds and turned
 * into those reference frames: at 15 fps every second frame number is
 * simply empty, which the rule already copes with.
 *
 * No browser or runtime in here, so the tests replay recorded detections
 * through exactly this code in Node.
 */

export type Box = { x1: number; y1: number; x2: number; y2: number };
export type Outcome = "make" | "miss";
export type RuleVersion = "v1" | "v2";

/** Frames per second of the clips every threshold below was measured on. */
export const REFERENCE_FPS = 30000 / 1001;

/** Change any of these and the offline scores no longer apply. */
export const RULE = {
  /** Zone around the rim: within 55 px sideways, from 50 above to 45 below. */
  zoneHalfWidth: 55,
  zoneAbove: 50,
  zoneBelow: 45,
  /** Sightings closer than this many frames are one shot. */
  gapFrames: 40,
  /** Zone sightings a shot needs; a single one is reported but not counted. */
  minZoneSightings: 2,
  /** Below the net: at least this far under the rim, this close sideways, this wide. */
  belowDrop: 30,
  belowHalfWidth: 45,
  belowMinWidth: 18,
  windowV1: 40,
  windowV2: 70,
  /** V2's "nearer the camera" test. */
  zoneWidthFrames: 10,
  belowWidthSamples: 8,
  bigBelowMinWidth: 26,
  bigBelowRatio: 1.2,
} as const;

/**
 * "Worth a look": a make the camera is least sure of, shown amber in
 * review so a player checks a few shots instead of every one.
 *
 * Every wrong call on the two exam clips was the same kind, a miss called
 * a make (the ball bounced off the rim and dropped near the net). A make
 * is flagged when any of these holds:
 * - wide below: the ball below the net is >= 25 px wide, near V2's 26 px
 *   cut, so it may be falling in front of the hoop rather than through it;
 * - off centre: it never comes within 15 px of the net's centre line;
 * - long at the rim: 20 or more sightings in the rim zone, a bounce or roll.
 *
 * Chosen 2026-10-06 AFTER seeing IMG_4839 and IMG_4840, where it catches
 * 5 of the 6 wrong calls while flagging 11 of 60 shots (18%). That is
 * in-sample. The third fresh clip is its real test, and it must not be
 * changed before that clip is scored (training/README.md).
 */
export const FLAG = {
  wideBelow: 25,
  offCentre: 15,
  longAtRim: 20,
} as const;

export type FlagReason = "wide_below" | "off_centre" | "long_at_rim";

export type ShotCall = {
  /** 1, 2, 3... in the order shots were decided. */
  n: number;
  /** Reference frame of the first sighting in the rim zone. */
  first: number;
  /** Reference frame of the last sighting in the rim zone. */
  last: number;
  /** Time of the first zone sighting, in the caller's milliseconds. */
  firstMs: number;
  zoneSightings: number;
  /** False for a lone zone sighting: shown as a possible shot, never counted. */
  counted: boolean;
  v1: Outcome;
  v2: Outcome;
  /** Evidence, kept for the review screen and for designing a "worth a look" flag. */
  belowSightingsV1: number;
  belowSightingsV2: number;
  /** Median zone width in the first frames, and median width below the net (V2). */
  zoneWidth: number | null;
  belowWidth: number | null;
  /** Nearest the ball came to the net's centre line below the rim (V2 window), px. */
  belowMinDx: number | null;
  /** Worth a look in review; see FLAG. Only V2 makes are ever flagged. */
  flagged: boolean;
  flagReasons: FlagReason[];
};

type Seen = { f: number; box: Box };

const cx = (b: Box) => (b.x1 + b.x2) / 2;
const cy = (b: Box) => (b.y1 + b.y2) / 2;
const width = (b: Box) => b.x2 - b.x1;

/** Python's statistics.median: the mean of the middle two for an even count. */
export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function inZone(b: Box, rim: { x: number; y: number }): boolean {
  return Math.abs(cx(b) - rim.x) <= RULE.zoneHalfWidth && cy(b) >= rim.y - RULE.zoneAbove && cy(b) <= rim.y + RULE.zoneBelow;
}

function belowNet(b: Box, rim: { x: number; y: number }): boolean {
  return Math.abs(cx(b) - rim.x) <= RULE.belowHalfWidth && cy(b) >= rim.y + RULE.belowDrop && width(b) >= RULE.belowMinWidth;
}

/**
 * Calls one shot from every detection seen from its first zone sighting on.
 * `seen` must be in frame order, and within a frame in the detector's order.
 */
export function callShot(
  seen: Seen[],
  first: number,
  last: number,
  rim: { x: number; y: number }
): Pick<ShotCall, "v1" | "v2" | "belowSightingsV1" | "belowSightingsV2" | "zoneWidth" | "belowWidth" | "belowMinDx"> {
  const zoneWidths = seen
    .filter((s) => s.f >= first && s.f <= Math.min(last, first + RULE.zoneWidthFrames) && inZone(s.box, rim))
    .map((s) => width(s.box));
  const below = (win: number) => seen.filter((s) => s.f >= first && s.f < first + win && belowNet(s.box, rim));
  const b1 = below(RULE.windowV1);
  const b2 = below(RULE.windowV2);

  let v2: Outcome = b2.length ? "make" : "miss";
  let belowWidth: number | null = null;
  const zoneWidth = zoneWidths.length ? median(zoneWidths) : null;
  if (b2.length) {
    belowWidth = median(b2.slice(0, RULE.belowWidthSamples).map((s) => width(s.box)));
    if (zoneWidth !== null && belowWidth >= RULE.bigBelowMinWidth && belowWidth >= RULE.bigBelowRatio * zoneWidth) {
      v2 = "miss";
    }
  }
  return {
    v1: b1.length ? "make" : "miss",
    v2,
    belowSightingsV1: b1.length,
    belowSightingsV2: b2.length,
    zoneWidth,
    belowWidth,
    belowMinDx: b2.length ? Math.min(...b2.map((s) => Math.abs(cx(s.box) - rim.x))) : null,
  };
}

/** Why a call is worth a look, if it is. */
export function flagReasons(call: Pick<ShotCall, "v2" | "belowWidth" | "belowMinDx" | "zoneSightings">): FlagReason[] {
  if (call.v2 !== "make") return [];
  const reasons: FlagReason[] = [];
  if ((call.belowWidth ?? 0) >= FLAG.wideBelow) reasons.push("wide_below");
  if ((call.belowMinDx ?? 0) >= FLAG.offCentre) reasons.push("off_centre");
  if (call.zoneSightings >= FLAG.longAtRim) reasons.push("long_at_rim");
  return reasons;
}

/**
 * Feed it every processed frame, in order, with the ball boxes found in it
 * (hoop-window coordinates). It returns each shot once it is decided: when
 * no ball has been in the rim zone for 40 frames and V2's 70-frame wait is
 * over, so a call arrives about 1.3 to 2.3 seconds after the ball reaches
 * the rim.
 */
export function createShotCounter(rim: { x: number; y: number }) {
  type Group = { first: number; last: number; firstMs: number; sightings: number };
  let history: Seen[] = [];
  let open: Group | null = null;
  // Shots whose sightings have ended but whose 70-frame window has not.
  // The window can run into the next shot's frames, and the offline rule
  // looks at those too, so a shot waits here rather than being cut short.
  let closed: Group[] = [];
  let lastFrame = Number.NEGATIVE_INFINITY;
  let n = 0;

  const decide = (shot: Group): ShotCall => {
    const counted = shot.sightings >= RULE.minZoneSightings;
    if (counted) n += 1;
    const called = callShot(history, shot.first, shot.last, rim);
    const reasons = flagReasons({ ...called, zoneSightings: shot.sightings });
    return {
      n: counted ? n : 0,
      first: shot.first,
      last: shot.last,
      firstMs: shot.firstMs,
      zoneSightings: shot.sightings,
      counted,
      ...called,
      flagged: reasons.length > 0,
      flagReasons: reasons,
    };
  };

  return {
    /** `timeMs` from any steady clock; `balls` are this frame's ball boxes. */
    push(timeMs: number, balls: Box[]): ShotCall[] {
      const f = Math.round((timeMs * REFERENCE_FPS) / 1000);
      if (f <= lastFrame) return []; // a repeated or out-of-order frame
      lastFrame = f;

      // A shot's sightings end after 40 quiet frames.
      if (open && f - open.last > RULE.gapFrames) {
        closed.push(open);
        open = null;
      }
      for (const box of balls) history.push({ f, box });
      const zoneHits = balls.filter((b) => inZone(b, rim)).length;
      if (zoneHits) {
        if (open) {
          open.last = f;
          open.sightings += zoneHits;
        } else {
          open = { first: f, last: f, firstMs: timeMs, sightings: zoneHits };
        }
      }

      // Decided once the 70-frame window is over, i.e. no later frame can
      // change it. Shots are always decided in order.
      const done: ShotCall[] = [];
      while (closed.length && f >= closed[0].first + RULE.windowV2 - 1) done.push(decide(closed.shift() as Group));

      // Keep only what an undecided shot can still look at.
      const keepFrom = closed.length ? closed[0].first : open ? open.first : f - RULE.windowV2;
      if (history.length && history[0].f < keepFrom) history = history.filter((s) => s.f >= keepFrom);
      return done;
    },

    /** End of the session: decide whatever is still waiting. */
    flush(): ShotCall[] {
      if (open) closed.push(open);
      open = null;
      const done = closed.map(decide);
      closed = [];
      return done;
    },
  };
}
