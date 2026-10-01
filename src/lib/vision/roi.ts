/**
 * Looking at the hoop instead of the whole picture.
 *
 * A shot happens in a small part of the frame. The model takes a fixed
 * 416x416 picture, so feeding it the whole 1280x720 camera frame squeezes
 * it to 416 wide, shrinking the ball by a third and padding the rest of
 * the square with grey. Cutting a window around the hoop at the camera's
 * own resolution and giving that to the model instead keeps every pixel of
 * the ball, spends no work on padding, and means nothing outside the area
 * that matters can be mistaken for a ball.
 *
 * Everything here is plain arithmetic so it can be tested without a camera.
 */

export type Crop = { sx: number; sy: number; sw: number; sh: number };
export type Box = { x1: number; y1: number; x2: number; y2: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * A square window of `size` source pixels centred on (cx, cy), pushed back
 * inside the frame if it would hang over an edge, and shrunk to fit if the
 * frame is smaller than the window.
 */
export function cropAround(frameW: number, frameH: number, cx: number, cy: number, size: number): Crop {
  const side = Math.max(1, Math.min(Math.round(size), frameW, frameH));
  return {
    sx: clamp(Math.round(cx - side / 2), 0, frameW - side),
    sy: clamp(Math.round(cy - side / 2), 0, frameH - side),
    sw: side,
    sh: side,
  };
}

/** Where the window is, from a position and size given as fractions of the frame. */
export function cropFromFractions(
  frameW: number,
  frameH: number,
  center: { x: number; y: number },
  sizeFraction: number
): Crop {
  return cropAround(frameW, frameH, center.x * frameW, center.y * frameH, sizeFraction * Math.min(frameW, frameH));
}

/** A box found in the model's input picture, expressed in camera-frame pixels. */
export function boxToFrame(box: Box, crop: Crop, inputSize: number): Box {
  const k = crop.sw / inputSize;
  return {
    x1: crop.sx + box.x1 * k,
    y1: crop.sy + box.y1 * k,
    x2: crop.sx + box.x2 * k,
    y2: crop.sy + box.y2 * k,
  };
}

/** Brightness of each pixel of an RGBA picture, one byte each. */
export function luma(rgba: Uint8ClampedArray | Uint8Array, out?: Uint8Array): Uint8Array {
  const n = rgba.length >> 2;
  const result = out && out.length === n ? out : new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i += 1, p += 4) {
    result[i] = (rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8;
  }
  return result;
}

/** Average absolute brightness change between two same-sized pictures, 0 to 255. */
export function motionScore(prev: Uint8Array, cur: Uint8Array): number {
  if (prev.length !== cur.length || cur.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < cur.length; i += 1) total += Math.abs(cur[i] - prev[i]);
  return total / cur.length;
}

/**
 * Decides whether the model needs to run this frame.
 *
 * Between shots nothing moves near the hoop, and running the model flat out
 * on a still picture only warms the phone: the earlier test lost a fifth of
 * its speed to heat in two minutes. The gate opens when the picture
 * changes, stays open for `holdMs` after the last change so a ball seen
 * mid-flight is followed all the way down, then closes again.
 */
export function createMotionGate(options: { threshold: number; holdMs: number }) {
  let lastMotionAt = Number.NEGATIVE_INFINITY;
  return {
    step(score: number, nowMs: number): boolean {
      if (score >= options.threshold) lastMotionAt = nowMs;
      return nowMs - lastMotionAt <= options.holdMs;
    },
    reset() {
      lastMotionAt = Number.NEGATIVE_INFINITY;
    },
  };
}
