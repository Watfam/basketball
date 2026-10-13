/**
 * Can this phone run the ball model fast enough? Counting is trustworthy at 15 frames a second and holds down to about 10
 * (training/README.md); below that the rule starts missing shots. Before a set, a few frames are timed (picture grab and
 * model together), the first one thrown away as warm-up, and the middle value says what the phone can sustain.
 */
export const SLOW_FPS = 10;
/** Frames timed, including the warm-up frame. */
export const SPEED_FRAMES = 6;

export type SpeedVerdict = { kind: "ok" | "slow"; fps: number };

/** `timesMs` is each frame's time in order; the first is warm-up. Fewer than two frames can't say, so it passes. */
export function speedVerdict(timesMs: number[]): SpeedVerdict {
  const timed = timesMs.slice(1).filter((t) => t > 0 && Number.isFinite(t));
  if (timed.length === 0) return { kind: "ok", fps: 15 };
  const sorted = [...timed].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const fps = Math.min(15, 1000 / median);
  return { kind: fps < SLOW_FPS ? "slow" : "ok", fps };
}
