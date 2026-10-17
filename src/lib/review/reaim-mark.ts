/**
 * When the player pauses and re-aims the camera in the middle of a set, the picture after the move is not the picture before it, so the set must
 * not be pooled with sets filmed from one place. The counter notes each re-aim here (a count and a time); saving the set reads it back. Pure, so it is
 * tested without a phone. A note older than the set's start belongs to an earlier set and is ignored.
 */
export const REAIM_KEY = "hl:lab:reaim";

type Mark = { n: number; at: number };

export function parseReaim(raw: string | null | undefined): Mark | null {
  try {
    const m = JSON.parse(raw ?? "null") as Partial<Mark> | null;
    return m && Number.isFinite(m.n) && Number.isFinite(m.at) && (m.n as number) > 0 ? { n: Math.floor(m.n as number), at: m.at as number } : null;
  } catch {
    return null;
  }
}

/** The note to store after one more re-aim at `now`. */
export function nextReaim(raw: string | null | undefined, startedAt: number | null, now: number): string {
  const prev = parseReaim(raw);
  const fresh = prev && (startedAt === null || prev.at >= startedAt) ? prev.n : 0;
  return JSON.stringify({ n: fresh + 1, at: now });
}

/** Did the set that started at `startedAtIso` have its camera re-aimed? */
export function reaimedSince(raw: string | null | undefined, startedAtIso: string): boolean {
  const m = parseReaim(raw), start = Date.parse(startedAtIso);
  return !!m && Number.isFinite(start) && m.at >= start;
}
