/**
 * A session's camera framing as a handful of numbers with their own spread, and the comparison of two of them.
 *
 * Registered in training/eval/experiments/camera-framing/criteria*.json. A quantity is only believed if it repeated well enough across the
 * stills it was averaged from; a quantity that did not is left out and the answer becomes "unknown" rather than a guess. Numbers only: no picture.
 */
import type { FramingMeasurement } from "./measure.ts";

export type Quantity = "posX" | "posY" | "size" | "az" | "off" | "asp" | "elev" | "roll";
export type QuantityStat = { mean: number; sd: number; n: number };
export type FramingDescriptor = {
  v: 1;
  /** Stills attempted and stills in which the rim was found. */
  stills: number;
  rimFound: number;
  /** Mean and sample SD of each measured quantity (size is in natural-log units). */
  q: Partial<Record<Quantity, QuantityStat>>;
  /** Quantities that passed the gate. Elevation and roll are measured but, at the stills' resolution, do not repeat well enough to be used. */
  usable: Quantity[];
};

/** Floors F_q (criteria.json, v2): the change that matters. The gate is 3 x sd <= 2 x F. */
export const FLOOR: Record<Quantity, number> = { posX: 0.02, posY: 0.02, size: 0.10, az: 0.10, off: 0.06, asp: 0.10, elev: 0.10, roll: 1.5 };
/** Tolerances T_q (criteria-v3.json): the floor, or three times the pooled development repeat spread if larger. */
export const TOL: Record<Quantity, number> = { posX: 0.02, posY: 0.02, size: 0.113, az: 0.134, off: 0.075, asp: 0.10, elev: Infinity, roll: 1.5 };
const RELATIVE = new Set<Quantity>(["az", "asp", "elev"]);
export const MIN_VALID = 4;

const value = (m: FramingMeasurement, k: Quantity): number | null => {
  if (!m.q) return null;
  if (k === "size") return m.q.size > 0 ? Math.log(m.q.size) : null;
  const v = m.q[k];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

/** The spread in the units the floor is written in (relative for ratios). */
export const gateSpread = (k: Quantity, s: QuantityStat): number => (RELATIVE.has(k) && s.mean !== 0 ? s.sd / Math.abs(s.mean) : s.sd);

export function describeFraming(stills: FramingMeasurement[]): FramingDescriptor {
  const q: FramingDescriptor["q"] = {};
  const usable: Quantity[] = [];
  const keys: Quantity[] = ["posX", "posY", "size", "az", "off", "asp", "elev", "roll"];
  for (const k of keys) {
    const v = stills.map((m) => value(m, k)).filter((x): x is number => x !== null);
    if (!v.length) continue;
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    const sd = v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1)) : 0;
    q[k] = { mean, sd, n: v.length };
    if (v.length >= MIN_VALID && 3 * gateSpread(k, q[k] as QuantityStat) <= 2 * FLOOR[k] && Number.isFinite(TOL[k])) usable.push(k);
  }
  return { v: 1, stills: stills.length, rimFound: stills.filter((m) => m.rim).length, q, usable };
}

export type FramingClass = "comparable" | "normalizable" | "not_comparable" | "unknown";
export type Verdict = "within" | "beyond" | "straddles" | "unusable";
export type FramingComparison = {
  class: FramingClass;
  cues: Partial<Record<Quantity, { verdict: Verdict; delta: number; margin: number; tolerance: number }>>;
  reasons: string[];
  /** What this comparison could not check. */
  unverified: string[];
};

/** u is the uncertainty of the DIFFERENCE of two descriptor means: each side's spread over its stills divided by the square root of how many stills it averaged. */
function judge(k: Quantity, a: FramingDescriptor, b: FramingDescriptor): { verdict: Verdict; delta: number; margin: number; tolerance: number } {
  const sa = a.q[k], sb = b.q[k];
  const tolerance = TOL[k];
  if (!sa || !sb || !a.usable.includes(k) || !b.usable.includes(k)) return { verdict: "unusable", delta: NaN, margin: NaN, tolerance };
  let delta: number, u: number;
  if (RELATIVE.has(k)) {
    const mid = (Math.abs(sa.mean) + Math.abs(sb.mean)) / 2;
    delta = Math.abs(sa.mean - sb.mean) / mid;
    u = Math.hypot(gateSpread(k, sa) / Math.sqrt(sa.n), gateSpread(k, sb) / Math.sqrt(sb.n));
  } else {
    delta = Math.abs(sa.mean - sb.mean);
    u = Math.hypot(sa.sd / Math.sqrt(sa.n), sb.sd / Math.sqrt(sb.n));
  }
  const margin = 2 * u;
  return { verdict: delta + margin <= tolerance ? "within" : delta - margin > tolerance ? "beyond" : "straddles", delta, margin, tolerance };
}

/** The registered decision (criteria-v3.json). Abstains ("unknown") whenever the evidence is not there. */
export function compareFramingDescriptors(a: FramingDescriptor | null, b: FramingDescriptor | null): FramingComparison {
  const unverified = ["roll", "elevation"];
  if (!a || !b) return { class: "unknown", cues: {}, reasons: ["one of the sessions has no saved framing"], unverified };
  const cues: FramingComparison["cues"] = {};
  for (const k of ["posX", "posY", "size", "az", "off", "asp", "roll"] as Quantity[]) cues[k] = judge(k, a, b);
  if (cues.roll?.verdict !== "unusable") unverified.splice(unverified.indexOf("roll"), 1);
  const usableAz = (["az", "off", "asp"] as Quantity[]).filter((k) => cues[k]?.verdict !== "unusable");
  const reasons: string[] = [];
  if (usableAz.length < 2) {
    reasons.push("fewer than two viewing-angle measurements repeated well enough in both sessions");
    return { class: "unknown", cues, reasons, unverified };
  }
  const beyond = usableAz.filter((k) => cues[k]?.verdict === "beyond");
  const within = usableAz.filter((k) => cues[k]?.verdict === "within");
  if (beyond.length >= 2) {
    reasons.push(`the camera looks at the hoop from a different angle (${beyond.join(", ")})`);
    return { class: "not_comparable", cues, reasons, unverified };
  }
  if (within.length !== usableAz.length) {
    reasons.push("the viewing-angle measurements are too close to the limit to call");
    return { class: "unknown", cues, reasons, unverified };
  }
  const placed = (["posX", "posY", "size", "roll"] as Quantity[]).map((k) => cues[k]?.verdict as Verdict).filter((v, i) => i < 3 || v !== "unusable");
  if (placed.slice(0, 3).includes("unusable")) { reasons.push("the rim position or size did not repeat well enough to compare"); return { class: "unknown", cues, reasons, unverified }; }
  if (placed.every((v) => v === "within")) return { class: "comparable", cues, reasons, unverified };
  if (placed.includes("straddles")) { reasons.push("the rim position or size is too close to the limit to call"); return { class: "unknown", cues, reasons, unverified }; }
  reasons.push("same viewing angle; the rim sits elsewhere, looks a different size or the picture is tilted differently, so paths must be shifted, scaled by rim width and rotated");
  return { class: "normalizable", cues, reasons, unverified };
}
