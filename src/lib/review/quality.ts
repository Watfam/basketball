import type { Fingerprint } from "./fingerprint.ts";
import type { Trail } from "./trail.ts";

/**
 * How far to trust a shot's trail, with the reasons, for the review screen. "unreliable" and "none" trails are hidden by default; the video is
 * still shown. Rules are fixed (Phase 5 criteria) and make no claim about the shot's outcome.
 */
export type TrailQuality = { level: "tracked" | "partial" | "unreliable" | "none"; reasons: string[] };

export function assessTrail(trail: Trail, fp: Fingerprint | null): TrailQuality {
  const observed = trail.segments.flat().filter((p) => p.type === "observed").length;
  if (!trail.hasTrail || !fp) return { level: "none", reasons: [observed ? "Too few connected sightings of the ball to draw a path." : trail.rimHardwareNearby > 0 ? "Only detections on rim hardware were found around this shot, not a ball in flight." : "No ball was found around this shot."] };
  const reasons: string[] = [], severe: string[] = [];
  if (trail.rimHardwareBoxes > 0) severe.push(`${trail.rimHardwareBoxes} detection${trail.rimHardwareBoxes === 1 ? "" : "s"} on a spot at the rim that is often mistaken for the ball were left out`);
  if (trail.rimHardwareNearby > 0 && trail.rimHardwareBoxes === 0) reasons.push("detections on rim hardware were present in this clip and were kept out of the path");
  const ambiguous = trail.events.filter((e) => e.reason === "ambiguous").length;
  if (fp.measurements.ambiguous_break_near_rim.value === true) severe.push("another ball-like object was close to the ball near the rim, so who is who is unclear");
  else if (ambiguous) reasons.push(`${ambiguous} point${ambiguous === 1 ? "" : "s"} left out because another ball-like object was close`);
  if (fp.measurements.rim_level_x_bw.value === null) severe.push("the ball was not seen coming down through the rim's height");
  const seg = trail.segments.length;
  if (seg > 1) reasons.push(`the path has ${seg} separate pieces; nothing is drawn between them`);
  const skipped = trail.gaps.filter((g) => g.reason === "model_skipped").length;
  if (skipped) reasons.push("the camera paused looking while nothing moved near the hoop for part of this clip");
  const recon = trail.segments.flat().filter((p) => p.type === "reconstructed").length;
  if (recon) reasons.push(`${recon} point${recon === 1 ? " is" : "s are"} filled in across a one-frame gap (marked, not measured)`);
  if (severe.length) return { level: "unreliable", reasons: [...severe, ...reasons] };
  return { level: seg > 1 || trail.gaps.length ? "partial" : "tracked", reasons };
}
