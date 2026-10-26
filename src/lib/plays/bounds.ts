import { COURT_LENGTH, COURT_WIDTH, type Frame } from "./types";

export type Region = { x: number; y: number; width: number; height: number };

const PAD = 5;
/** height / width — roughly a phone's own portrait shape. A crop shorter than this would letterbox badly on a portrait screen, so the short axis gets padded out to it instead of actually zooming in. */
const MIN_ASPECT = 1.3;

/**
 * The tightest region (in court feet) that contains everything in the play — every frame's player
 * and defender positions, every line, every recorded arrival/ball path — padded out, clamped to the
 * court, and widened if needed so it is never shorter than a phone's own shape. Cropping only one
 * axis (e.g. height alone) does nothing on a portrait phone: width is already the binding dimension
 * on a full court (the two shapes are close), so a plain top-half crop barely changes the render
 * scale at all — measured at under 2% before this existed. Fitting both axes to the actual content
 * is what makes a short, narrow action render meaningfully larger.
 */
export function computeContentBounds(frames: Frame[]): Region {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const consider = (x: number, y: number) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };

  for (const f of frames) {
    for (const o of f.offense) consider(o.pos.x, o.pos.y);
    for (const d of f.defense) if (d.manualPos) consider(d.manualPos.x, d.manualPos.y);
    for (const l of f.lines) for (const p of l.points) consider(p.x, p.y);
    for (const path of Object.values(f.arrivals ?? {})) for (const p of path ?? []) consider(p.x, p.y);
    for (const p of f.ballArrival ?? []) consider(p.x, p.y);
  }

  if (!isFinite(minX)) return { x: -PAD, y: -PAD, width: COURT_WIDTH + PAD * 2, height: COURT_LENGTH + PAD * 2 };

  minX = Math.max(-PAD, minX - PAD);
  maxX = Math.min(COURT_WIDTH + PAD, maxX + PAD);
  minY = Math.max(-PAD, minY - PAD);
  maxY = Math.min(COURT_LENGTH + PAD, maxY + PAD);

  const width = maxX - minX;
  let height = maxY - minY;
  if (height / width < MIN_ASPECT) {
    const grow = (width * MIN_ASPECT - height) / 2;
    minY -= grow;
    height += grow * 2;
  }

  return { x: minX, y: minY, width, height };
}
