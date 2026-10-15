import { sessionReviewEnabled } from "./flag.ts";
import type { ReviewRecord } from "./types.ts";

/**
 * P-1 (EXPERIMENTAL, display only, off by default): does a finished camera set look like the camera was reading part of the rim as a ball?
 * In that case ("rim phantom") the shot counter can merge real shots and the count may be LOW. This reads the review records the recorder already
 * writes (each box is flagged `occ` when its spot has held ball-like boxes for a long time) and says so. It is a pure function: it never writes
 * to, changes or reorders records, shots, counts, calls or detections, and nothing in the counting path imports it. Criteria were registered before
 * any number existed: training/eval/experiments/rim-warning/criteria.json. Thresholds come from thresholds.json (development clips only) and are
 * kept equal to it by a test.
 */
export const RIM_WARNING_KEY = "hl:rim-warning";
/** On only when the phone's storage holds "1" under hl:rim-warning AND shot review is on (which supplies the records). Off by default. */
export function rimWarningEnabled(read: (key: string) => string | null = (k) => (typeof window === "undefined" ? null : window.localStorage.getItem(k))): boolean {
  try { return sessionReviewEnabled(read) && read(RIM_WARNING_KEY) === "1"; } catch { return false; }
}

/** How close to the rim (model pixels) a flagged box must be to count. Fixed geometric choice (criteria.json). */
export const RIM_RADIUS = 60;
/** One affected shot is not a pattern. */
export const K_MIN = 2;
export type RimWarningThresholds = { tShot: number; tFrac: number };
/** Set from the development clips by the registered rule (thresholds.json). */
export const RIM_WARNING_THRESHOLDS: RimWarningThresholds | null = null;

/** Share of a record's looked-at frames in which a flagged box sat near the rim; null if the camera never looked in this record. */
export function shotRimShare(record: ReviewRecord, radius: number = RIM_RADIUS): number | null {
  let ran = 0, hit = 0;
  for (const f of record.frames) {
    if (!f.ran) continue;
    ran += 1;
    if (f.boxes.some((b) => b.occ === true && Math.hypot((b.x1 + b.x2) / 2 - record.rim.x, (b.y1 + b.y2) / 2 - record.rim.y) <= radius)) hit += 1;
  }
  return ran === 0 ? null : hit / ran;
}

export type RimAssessment = {
  warn: boolean;
  reason: "warn" | "thresholds_not_set" | "no_records" | "too_few_affected" | "affected_share_too_small";
  /** Records measured, and the ones at or above the shot threshold, with their shares. Shot ids are the record ids (replay ids). */
  measured: number;
  affected: { shotId: string; share: number }[];
  thresholds: RimWarningThresholds | null;
};

/** Pure: reads records, returns a verdict. Never mutates its input. */
export function assessRimReading(records: readonly ReviewRecord[], thresholds: RimWarningThresholds | null = RIM_WARNING_THRESHOLDS): RimAssessment {
  if (!thresholds) return { warn: false, reason: "thresholds_not_set", measured: 0, affected: [], thresholds };
  const shares = records.map((r) => ({ shotId: r.shotId, share: shotRimShare(r) })).filter((x): x is { shotId: string; share: number } => x.share !== null);
  if (shares.length === 0) return { warn: false, reason: "no_records", measured: 0, affected: [], thresholds };
  const affected = shares.filter((x) => x.share >= thresholds.tShot);
  const base = { measured: shares.length, affected, thresholds };
  if (affected.length < K_MIN) return { warn: false, reason: "too_few_affected", ...base };
  if (affected.length / shares.length < thresholds.tFrac) return { warn: false, reason: "affected_share_too_small", ...base };
  return { warn: true, reason: "warn", ...base };
}

/** The words (plain, no cause claimed that the app has not verified). */
export const RIM_WARNING_TEXT = {
  headline: "The camera may be reading part of the rim as a ball in this set.",
  body: "When that happens, shots that follow each other can be counted as one, so the shot count could be low. Nothing has been changed. Watch the marked shots before you save, and add any missed shot by hand.",
} as const;
