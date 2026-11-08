import type { Frame } from "../types";

/** Clears defenders from every frame of a play — used when a coach turns off the defense overlay for a specific play (or all of them) in an exported/printed playbook. */
export function stripDefense(frames: Frame[]): Frame[] {
  return frames.map((f) => ({ ...f, defense: [] }));
}
