/**
 * The last few seconds of the hoop close-up, kept in memory while the
 * camera counts, so a shot's replay can be cut out once the shot is
 * decided (1.3 to 2.3 s after the ball reaches the rim).
 */

/** A replay runs from this long before the ball reaches the rim to this long after. */
export const CLIP = { beforeMs: 1000, afterMs: 2000 } as const;

export type Timed<T> = { t: number; item: T };

export function createReplayBuffer<T>(keepMs: number) {
  let items: Timed<T>[] = [];
  return {
    push(t: number, item: T) {
      items.push({ t, item });
      const cutoff = t - keepMs;
      if (items.length && items[0].t < cutoff) items = items.filter((x) => x.t >= cutoff);
    },
    /** Everything from `from` to `to`, inclusive, oldest first. */
    between(from: number, to: number): Timed<T>[] {
      return items.filter((x) => x.t >= from && x.t <= to);
    },
    clear() {
      items = [];
    },
    get size() {
      return items.length;
    },
  };
}
