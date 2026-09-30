/**
 * YOLOX pre- and post-processing, in plain TypeScript.
 *
 * Kept free of any runtime (no onnxruntime, no DOM) on purpose: it takes
 * pixels in and hands boxes out, so the same code runs in Safari on a
 * phone and in Node against saved footage. That is what lets accuracy be
 * measured offline on real clips with exactly the code that ships.
 *
 * YOLOX is Apache-2.0 (unlike Ultralytics YOLO, which is AGPL-3.0).
 */

export type Pixels = {
  /** RGBA, row-major, 4 bytes per pixel — what a canvas gives you. */
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
};

export type Detection = {
  /** Box in the coordinates of the ORIGINAL image, not the model input. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
  classId: number;
};

export type Letterbox = {
  /** Scale applied to the source to fit the model input. */
  scale: number;
  padX: number;
  padY: number;
};

/** COCO ids the basketball work cares about. */
export const COCO_SPORTS_BALL = 32;
export const COCO_PERSON = 0;

export const PAD_VALUE = 114;

/**
 * Fit an image into a size x size input, keeping aspect ratio and padding
 * the rest with grey, as YOLOX was trained.
 *
 * Returns a CHW float32 tensor in BGR channel order with raw 0-255 values:
 * YOLOX's own preprocessing does no mean/std normalisation and expects
 * OpenCV's BGR, so feeding RGB or scaled values quietly wrecks accuracy
 * while still "working".
 *
 * Nearest-neighbour resampling keeps this cheap enough to run every
 * frame; the canvas that feeds it is already downscaled by the browser.
 */
export function preprocess(
  img: Pixels,
  size: number,
  reuse?: Float32Array
): { tensor: Float32Array; letterbox: Letterbox } {
  const scale = Math.min(size / img.width, size / img.height);
  const newW = Math.round(img.width * scale);
  const newH = Math.round(img.height * scale);
  const padX = Math.floor((size - newW) / 2);
  const padY = Math.floor((size - newH) / 2);

  const plane = size * size;
  // A reused buffer must already be filled with the pad value for frames of
  // this exact size: only the picture area is rewritten, so the borders
  // stay valid without a 2 MB refill and a fresh allocation every frame.
  const tensor = reuse ?? new Float32Array(3 * plane).fill(PAD_VALUE);

  for (let y = 0; y < newH; y += 1) {
    const srcY = Math.min(img.height - 1, Math.floor(y / scale));
    for (let x = 0; x < newW; x += 1) {
      const srcX = Math.min(img.width - 1, Math.floor(x / scale));
      const s = (srcY * img.width + srcX) * 4;
      const d = (y + padY) * size + (x + padX);
      tensor[d] = img.data[s + 2]; // B
      tensor[plane + d] = img.data[s + 1]; // G
      tensor[2 * plane + d] = img.data[s]; // R
    }
  }
  return { tensor, letterbox: { scale, padX, padY } };
}

/** The strides YOLOX detects at; the grid at each is size / stride squared. */
const STRIDES = [8, 16, 32];

/**
 * Turn raw model output [N, 5 + classes] into boxes.
 *
 * The exported YOLOX ONNX returns undecoded predictions: x,y are offsets
 * within a grid cell and w,h are log-scale, so they must be decoded with
 * the grid and stride before they mean anything.
 */
export function decode(
  output: Float32Array,
  numClasses: number,
  size: number,
  letterbox: Letterbox,
  original: { width: number; height: number },
  options: { scoreThreshold?: number; iouThreshold?: number; classes?: number[] } = {}
): Detection[] {
  const { scoreThreshold = 0.25, iouThreshold = 0.45, classes } = options;
  const stride = 5 + numClasses;
  const candidates: Detection[] = [];

  let row = 0;
  for (const s of STRIDES) {
    const cells = size / s;
    for (let gy = 0; gy < cells; gy += 1) {
      for (let gx = 0; gx < cells; gx += 1) {
        const o = row * stride;
        row += 1;

        const objectness = output[o + 4];
        if (objectness < scoreThreshold) continue; // cheap early-out

        // Best class for this cell, restricted to the ones we want.
        let bestClass = -1;
        let bestScore = 0;
        for (let c = 0; c < numClasses; c += 1) {
          if (classes && !classes.includes(c)) continue;
          const score = objectness * output[o + 5 + c];
          if (score > bestScore) {
            bestScore = score;
            bestClass = c;
          }
        }
        if (bestClass < 0 || bestScore < scoreThreshold) continue;

        const cx = (output[o] + gx) * s;
        const cy = (output[o + 1] + gy) * s;
        const w = Math.exp(output[o + 2]) * s;
        const h = Math.exp(output[o + 3]) * s;

        // Undo the letterbox: model-input space -> original image space.
        const x1 = (cx - w / 2 - letterbox.padX) / letterbox.scale;
        const y1 = (cy - h / 2 - letterbox.padY) / letterbox.scale;
        const x2 = (cx + w / 2 - letterbox.padX) / letterbox.scale;
        const y2 = (cy + h / 2 - letterbox.padY) / letterbox.scale;

        candidates.push({
          x1: Math.max(0, x1),
          y1: Math.max(0, y1),
          x2: Math.min(original.width, x2),
          y2: Math.min(original.height, y2),
          score: bestScore,
          classId: bestClass,
        });
      }
    }
  }
  return nms(candidates, iouThreshold);
}

function iou(a: Detection, b: Detection): number {
  const ix = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const iy = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  const inter = ix * iy;
  const union = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter;
  return union <= 0 ? 0 : inter / union;
}

/** Greedy per-class non-maximum suppression, highest score first. */
export function nms(dets: Detection[], iouThreshold: number): Detection[] {
  const sorted = [...dets].sort((a, b) => b.score - a.score);
  const kept: Detection[] = [];
  for (const d of sorted) {
    if (kept.every((k) => k.classId !== d.classId || iou(k, d) < iouThreshold)) kept.push(d);
  }
  return kept;
}
