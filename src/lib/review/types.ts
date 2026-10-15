/**
 * Session review: the data it needs and nothing else. EXPERIMENTAL and behind the hl:session-review flag (flag.ts).
 *
 * The app keeps, for a shot, only its call and a replay clip (src/lib/vision/replay-store.ts); the ball detections that produced the call
 * are dropped. Review needs them, so while the flag is on the camera also notes the ball boxes it already finds (no extra model run) in a
 * ReviewRecord, kept on this phone only. Boxes are in the hoop window's model pixels (the 416 px picture the model sees), like every
 * detection in the vision code; nothing here is calibrated: an image position is not a physical measurement.
 */

export const REVIEW_RECORD_VERSION = 1 as const;

export type ReviewBox = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
  /** The rim spot this box sits on was occupied by ball-like boxes for a large share of the last 40 s: rim hardware is a likely cause. */
  occ?: boolean;
};

export type ReviewFrame = {
  /** Milliseconds from the shot's first sighting in the rim zone (negative = before). Same clock as the replay clip's frames. */
  t: number;
  /** False when the model was skipped (nothing was moving near the hoop): "no ball" cannot be told from "not looked at". */
  ran: boolean;
  boxes: ReviewBox[];
};

export type ReviewRecord = {
  v: typeof REVIEW_RECORD_VERSION;
  /** Same id as the shot's replay (`shot-<firstMs>`), the link between the shot, its video frames and these detections. */
  shotId: string;
  replayId: string | null;
  firstMs: number;
  /** The rim in the window's model pixels at the time of the shot. */
  rim: { x: number; y: number };
  /** The window size multiple (1 = native pixels) when the boxes were taken. */
  scale: number;
  frames: ReviewFrame[];
};

/** The one shot a review screen shows: what the set recorded plus, optionally, its record. A shot without a record still lists, with its outcome. */
export type ReviewShot = {
  seq: number;
  made: boolean;
  detectedMade: boolean | null;
  flagged?: boolean;
  tMs?: number;
  replayId?: string;
  record?: ReviewRecord | null;
};

export function parseRecord(raw: unknown): ReviewRecord | null {
  const r = raw as Partial<ReviewRecord> | null;
  if (!r || r.v !== REVIEW_RECORD_VERSION || typeof r.shotId !== "string" || !Array.isArray(r.frames) || !r.rim) return null;
  if (typeof r.rim.x !== "number" || typeof r.rim.y !== "number") return null;
  return r as ReviewRecord;
}
