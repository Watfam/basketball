/**
 * A running count of where ball-like boxes sit, so a box on a spot that has been "occupied" for a long time (rim hardware the model keeps
 * calling a ball) can be flagged when it is recorded. Time-based so it works at any frame rate. A port of the offline spot memory
 * (training/eval/experiments/tracker/spotmemory.mjs); occupancy is the share of processed frames in the window that had a box in the cell.
 */
export function createSpotMemory({ cell = 8, windowMs = 40_000, minHistoryMs = 3000, share = 0.03 } = {}) {
  const frames: { t: number; cells: string[] }[] = [];
  const counts = new Map<string, number>();
  const key = (x: number, y: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  return {
    /** Record one processed frame's box centres. Call AFTER asking occupied() for that frame's boxes. */
    add(t: number, centres: { x: number; y: number }[]) {
      const cells = [...new Set(centres.map((c) => key(c.x, c.y)))];
      frames.push({ t, cells });
      for (const k of cells) counts.set(k, (counts.get(k) ?? 0) + 1);
      while (frames.length && frames[0].t < t - windowMs) {
        for (const k of frames[0].cells) {
          const n = (counts.get(k) ?? 1) - 1;
          if (n <= 0) counts.delete(k);
          else counts.set(k, n);
        }
        frames.shift();
      }
    },
    /** Was this spot occupied, judged only on what was seen before now? */
    occupied(x: number, y: number): boolean {
      if (frames.length < 2 || frames[frames.length - 1].t - frames[0].t < minHistoryMs) return false;
      return (counts.get(key(x, y)) ?? 0) / frames.length >= share;
    },
    clear() {
      frames.length = 0;
      counts.clear();
    },
  };
}
