/**
 * Saved tracking history (EXPERIMENTAL, behind the hl:session-review flag AND the player's opt-in; see history-settings.ts).
 *
 * What is kept, per saved session: identifiers, times, outcomes, the OBSERVED ball positions of each shot (never a filled-in position), their
 * timing, the same positions relative to the rim, the detector scores, data-quality indicators, a versioned shot fingerprint (shot-fingerprint/1)
 * and the framing the camera had. What is never kept: video, images, or anything derived from pixels. It stays in this phone's IndexedDB
 * (database hl-history); nothing here is uploaded or synced. Positions are image-space (window model pixels), not physical measurements.
 */

export const HISTORY_SCHEMA = 1 as const;
export const HISTORY_DB = "hl-history";

/** [ms from the shot's first rim sighting, px right of the rim centre, px above the rim centre, box width px, detector score x 100] */
export type HistoryPoint = [number, number, number, number, number];

export type HistoryFraming = {
  /** Where the rim was aimed, as fractions of the camera picture. */
  rimX: number;
  rimY: number;
  /** Hoop window size multiple (1 = native pixels). */
  scale: number;
  /** Typical ball width in the window, px (the camera's own sizing), when known. */
  ballWidthPx: number | null;
};

export type HistoryShot = {
  v: typeof HISTORY_SCHEMA;
  id: string;
  sessionKey: string;
  playerId: string;
  seq: number;
  made: boolean;
  detectedMade: boolean | null;
  flagged: boolean;
  /** Ms from the start of the set to the first rim sighting, when known. */
  tMs: number | null;
  /** True when a tracking record existed for this shot; otherwise only the outcome row is kept. */
  tracked: boolean;
  /** Rim position in the window (model px) and window size multiple when the shot was taken. */
  rim: { x: number; y: number } | null;
  scale: number | null;
  ballWidthPx: number | null;
  ballWidthSource: "shot" | "default" | null;
  /** OBSERVED points only. Reconstructed (estimated) positions are never stored. */
  points: HistoryPoint[];
  gaps: { fromT: number; toT: number; reason: string; missing: number }[];
  events: { t: number; reason: string }[];
  rimHardwareBoxes: number;
  rimHardwareNearby: number;
  quality: { level: "tracked" | "partial" | "unreliable" | "none"; reasons: string[] };
  fingerprint: {
    schema: "shot-fingerprint/1";
    /** value per measurement; null = not measurable (reason in `why`). */
    m: Record<string, number | boolean | null>;
    why: Record<string, string>;
    /** Observed x offset in ball widths at 4,3,2,1,0 widths above the rim. */
    path: Record<string, number | null>;
    usable: boolean;
  } | null;
  savedAt: number;
  bytes: number;
};

export type HistorySession = {
  v: typeof HISTORY_SCHEMA;
  sessionKey: string;
  playerId: string;
  /** The server's id for the saved session when this phone knew it at save time. */
  sessionId: string | null;
  label: string | null;
  startedAt: string;
  savedAt: number;
  shots: number;
  withTracking: number;
  framing: HistoryFraming | null;
  bytes: number;
};

export type HistoryMeta = { schema: number; createdAt: number; app: string };

export const HISTORY_LIMITS = { maxShots: 5000, maxBytes: 25_000_000, maxPointsPerShot: 200 } as const;
