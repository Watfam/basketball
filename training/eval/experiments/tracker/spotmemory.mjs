// Static-scene memory (H2's idea, constant time): how often has a box sat at this spot in the trailing window?
// A grid of `cell` px cells; each cell keeps the reference frames on which it held a box (one entry per frame). Occupancy of a spot is
// the number of such frames in its 3x3 neighbourhood over the number of PROCESSED frames in the window, so the same code serves 30 and 15 fps.
// The 3x3 sum can count a frame twice when boxes sit in two neighbouring cells on one frame; for a spot (a phantom) that is rare and only
// errs towards "occupied". Everything is causal: a query at frame f sees frames <= f.
export function createSpotMemory({ cell = 8, window = 1200, minHistory = 90, share = 0.03 } = {}) {
  const cells = new Map(); // key -> { frames: number[], head: number }
  const processed = []; let ph = 0, firstF = null;
  const key = (cx, cy) => `${cx},${cy}`;
  const live = (c, f) => { while (c.head < c.frames.length && c.frames[c.head] <= f - window) c.head += 1; if (c.head > 256 && c.head * 2 > c.frames.length) { c.frames = c.frames.slice(c.head); c.head = 0; } return c.frames.length - c.head; };
  return {
    /** Record one processed frame and the box centres seen in it. */
    add(f, pts) {
      if (firstF === null) firstF = f;
      processed.push(f);
      while (ph < processed.length && processed[ph] <= f - window) ph += 1;
      if (ph > 512 && ph * 2 > processed.length) { processed.splice(0, ph); ph = 0; }
      const seen = new Set();
      for (const p of pts) {
        const k = key(Math.floor(p.x / cell), Math.floor(p.y / cell));
        if (seen.has(k)) continue; seen.add(k);
        const c = cells.get(k) ?? cells.set(k, { frames: [], head: 0 }).get(k);
        c.frames.push(f);
      }
    },
    /** Fraction of processed frames in the trailing window on which this spot held a box (counting the neighbourhood). */
    occupancy(x, y, f) {
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      let hits = 0;
      for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) { const c = cells.get(key(cx + dx, cy + dy)); if (c) hits += live(c, f); }
      let n = 0; for (let i = ph; i < processed.length && processed[i] <= f; i += 1) n += 1;
      return n ? Math.min(1, hits / n) : 0;
    },
    /** Enough history, and the spot is occupied at least `share` of the window. */
    occupied(x, y, f) { return firstF !== null && f - firstF >= minHistory && this.occupancy(x, y, f) >= share; },
    historyFrames: (f) => (firstF === null ? 0 : f - firstF),
  };
}
