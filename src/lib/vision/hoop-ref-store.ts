import { MATCH_H, MATCH_W, type HoopRef } from "./hoop-match.ts";

/**
 * The saved hoop picture, as text for local storage on this phone (about
 * 77 KB). It never leaves the phone.
 */

export const HOOP_REF_KEY = "hl:aim:ref";

export function encodeRef(ref: HoopRef): string {
  let bin = "";
  const CHUNK = 8192;
  for (let i = 0; i < ref.gray.length; i += CHUNK) bin += String.fromCharCode(...ref.gray.subarray(i, i + CHUNK));
  return JSON.stringify({ v: 1, g: btoa(bin), rim: ref.rim, scale: ref.scale });
}

/** The saved picture, or null when nothing usable is stored. */
export function decodeRef(raw: string | null): HoopRef | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { v?: unknown; g?: unknown; rim?: { x?: unknown; y?: unknown }; scale?: unknown };
    if (o.v !== 1 || typeof o.g !== "string" || typeof o.scale !== "number" || !(o.scale > 0)) return null;
    const x = o.rim?.x;
    const y = o.rim?.y;
    if (typeof x !== "number" || typeof y !== "number" || x < 0 || x > 1 || y < 0 || y > 1) return null;
    const bin = atob(o.g);
    if (bin.length !== MATCH_W * MATCH_H) return null;
    const gray = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) gray[i] = bin.charCodeAt(i);
    return { gray, rim: { x, y }, scale: o.scale };
  } catch {
    return null;
  }
}
