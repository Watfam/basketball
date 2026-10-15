import { createReplayBuffer } from "../vision/replay-buffer.ts";
import { createSpotMemory } from "./spot.ts";
import { REVIEW_RECORD_VERSION, type ReviewBox, type ReviewRecord } from "./types.ts";

/** A record runs from a second before the first rim sighting to two seconds after, like the replay clip (replay-buffer.ts CLIP). */
const BEFORE_MS = 1000;
const AFTER_MS = 2000;
const KEEP_MS = 6000;

/**
 * Notes, for every processed frame, the ball boxes the camera counter already has, flagging boxes on long-occupied spots, and cuts a
 * ReviewRecord around a decided shot. Pure and clock-agnostic (the caller's milliseconds). No model run, no pixels.
 */
export function createReviewRecorder(options: { onPushMs?: (ms: number) => void } = {}) {
  const buf = createReplayBuffer<{ ran: boolean; boxes: ReviewBox[] }>(KEEP_MS);
  const spots = createSpotMemory();
  return {
    push(t: number, ran: boolean, boxes: { x1: number; y1: number; x2: number; y2: number; score?: number }[]) {
      const t0 = options.onPushMs ? performance.now() : 0;
      const noted = boxes.map((b) => ({ x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2, score: b.score ?? 0, occ: spots.occupied((b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2) }));
      spots.add(t, boxes.map((b) => ({ x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 })));
      buf.push(t, { ran, boxes: noted });
      if (options.onPushMs) options.onPushMs(performance.now() - t0);
    },
    cut(firstMs: number, replayId: string | null, rim: { x: number; y: number }, scale: number): ReviewRecord {
      const items = buf.between(firstMs - BEFORE_MS, firstMs + AFTER_MS);
      return { v: REVIEW_RECORD_VERSION, shotId: replayId ?? `shot-${Math.round(firstMs)}`, replayId, firstMs, rim: { x: rim.x, y: rim.y }, scale, frames: items.map((x) => ({ t: x.t - firstMs, ran: x.item.ran, boxes: x.item.boxes })) };
    },
    /** The window moved (a new size): earlier boxes are in the old window's pixels and must not be mixed with new ones. */
    reset() {
      buf.clear();
      spots.clear();
    },
  };
}
