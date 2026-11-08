import { COURT_LENGTH, COURT_WIDTH, type Frame } from "./types";

export type Region = { x: number; y: number; width: number; height: number };

const PAD = 5;
/** height / width — roughly a phone's own portrait shape. A crop shorter than this would letterbox badly on a portrait screen, so the short axis gets padded out to it instead of actually zooming in. */
const MIN_ASPECT = 1.3;
/** Full sideline-to-sideline width, always. */
const FULL_WIDTH = COURT_WIDTH + PAD * 2;

/**
 * The tightest region (in court feet) that contains everything in the play — every frame's player
 * and defender positions, every line, every recorded arrival/ball path — padded out vertically,
 * clamped to the court, and widened if needed so it is never shorter than a phone's own shape.
 *
 * The x-axis is never cropped to content — same rule as the export's own computeExportRegion, and
 * for the same reason: a play whose action only occupies one side horizontally (e.g. a BLOB stacked
 * on a single block) would otherwise lose one or both sidelines entirely, making it look like one
 * side of the floor was arbitrarily chosen rather than a deliberate crop. Width is also already the
 * binding dimension on a full court (the two shapes are close), so cropping it bought little zoom
 * anyway — measured at under 2% before this only cropped height.
 */
export function computeContentBounds(frames: Frame[]): Region {
  let minY = Infinity;
  let maxY = -Infinity;
  const consider = (y: number) => {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };

  for (const f of frames) {
    for (const o of f.offense) consider(o.pos.y);
    for (const d of f.defense) if (d.manualPos) consider(d.manualPos.y);
    for (const l of f.lines) for (const p of l.points) consider(p.y);
    for (const path of Object.values(f.arrivals ?? {})) for (const p of path ?? []) consider(p.y);
    for (const p of f.ballArrival ?? []) consider(p.y);
  }

  if (!isFinite(minY)) return { x: -PAD, y: -PAD, width: FULL_WIDTH, height: COURT_LENGTH + PAD * 2 };

  minY = Math.max(-PAD, minY - PAD);
  maxY = Math.min(COURT_LENGTH + PAD, maxY + PAD);

  let height = maxY - minY;
  if (height / FULL_WIDTH < MIN_ASPECT) {
    const grow = (FULL_WIDTH * MIN_ASPECT - height) / 2;
    minY -= grow;
    height += grow * 2;
  }

  return { x: -PAD, y: minY, width: FULL_WIDTH, height };
}
