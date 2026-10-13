/**
 * Where a picture of videoW x videoH is drawn inside a boxW x boxH box with
 * object-fit: contain (centred, the rest bars), in the box's own pixels.
 * A tap on the box maps to the picture through this, not through the box.
 */
export type Rect = { x: number; y: number; w: number; h: number };

export function containedRect(boxW: number, boxH: number, videoW: number, videoH: number): Rect {
  if (boxW <= 0 || boxH <= 0 || videoW <= 0 || videoH <= 0) return { x: 0, y: 0, w: boxW, h: boxH };
  const k = Math.min(boxW / videoW, boxH / videoH);
  const w = videoW * k;
  const h = videoH * k;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

/** A point in the box (px) as fractions of the picture, or null when it falls on the bars. */
export function pictureFraction(
  px: number,
  py: number,
  box: { w: number; h: number },
  video: { w: number; h: number }
): { x: number; y: number } | null {
  const r = containedRect(box.w, box.h, video.w, video.h);
  const fx = (px - r.x) / r.w;
  const fy = (py - r.y) / r.h;
  return fx < 0 || fx > 1 || fy < 0 || fy > 1 ? null : { x: fx, y: fy };
}
