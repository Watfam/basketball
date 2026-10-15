import { compareFramingDescriptors, describeFraming, type FramingClass, type FramingComparison, type FramingDescriptor } from "./descriptor.ts";
import { measureFraming, type FramingMeasurement, type Pixels, type Seed } from "./measure.ts";

/**
 * The optional camera reference: a few numbers describing how the camera sees the hoop, kept on this phone, separate from shot history.
 * ADVISORY ONLY. It can warn that the camera moved and say what it could and could not check. It never stops counting or saving, never
 * changes how saved sessions are compared, and never switches a comparison on. Numbers only: no picture is stored.
 * Registered criteria and results: training/eval/experiments/camera-framing/ (the angle cues did not pass as an approver; see REPORT.md).
 */
export const REFERENCE_KEY = "hl:framing:ref";

export type ReferenceRecord = {
  v: 1;
  createdAt: string;
  descriptor: FramingDescriptor;
  /** Picture size the numbers were measured in. */
  frame: { width: number; height: number };
};

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Read a stored reference defensively: anything unexpected is "no reference", never an error. */
export function parseReference(raw: string | null): ReferenceRecord | null {
  if (!raw || raw.length > 20_000) return null;
  try {
    const r = JSON.parse(raw) as Partial<ReferenceRecord> | null;
    if (!r || r.v !== 1 || typeof r.createdAt !== "string" || !r.descriptor || r.descriptor.v !== 1 || !Array.isArray(r.descriptor.usable) || typeof r.descriptor.q !== "object" || !r.descriptor.q) return null;
    if (!r.frame || !finite(r.frame.width) || !finite(r.frame.height)) return null;
    for (const s of Object.values(r.descriptor.q)) if (!s || !finite(s.mean) || !finite(s.sd) || !finite(s.n)) return null;
    return r as ReferenceRecord;
  } catch { return null; }
}

export function loadReference(storage: Pick<Storage, "getItem"> | null = typeof window === "undefined" ? null : window.localStorage): ReferenceRecord | null {
  try { return parseReference(storage?.getItem(REFERENCE_KEY) ?? null); } catch { return null; }
}
export function saveReference(ref: ReferenceRecord, storage: Pick<Storage, "setItem"> | null = typeof window === "undefined" ? null : window.localStorage): boolean {
  try { storage?.setItem(REFERENCE_KEY, JSON.stringify(ref)); return !!storage; } catch { return false; }
}
export function clearReference(storage: Pick<Storage, "removeItem"> | null = typeof window === "undefined" ? null : window.localStorage) {
  try { storage?.removeItem(REFERENCE_KEY); } catch { /* storage unavailable */ }
}

export type CameraStatus = "same" | "shifted" | "different_angle" | "cant_tell" | "no_hoop";
export type CameraCheck = { status: CameraStatus; headline: string; details: string[]; unverified: string[]; comparison: FramingComparison | null };

const NOT_CHECKED = "Camera height (how high the phone is) cannot be checked, and small changes of side-to-side angle are not reliably seen.";

/**
 * Plain-language result of comparing today's framing with the reference. `blocksCounting` does not exist on purpose: nothing here can.
 */
export function checkAgainstReference(ref: ReferenceRecord | null, now: FramingDescriptor | null): CameraCheck {
  if (!ref) return { status: "cant_tell", headline: "No reference yet.", details: ["Set one from a view you are happy with. Counting works without it."], unverified: [], comparison: null };
  if (!now || now.rimFound < 4) return { status: "no_hoop", headline: "The hoop was not found where you pointed.", details: ["Tap the rim in the picture and try again. If the camera has moved a lot, set a new reference."], unverified: [], comparison: null };
  const c = compareFramingDescriptors(ref.descriptor, now);
  const verified = c.unverified.length ? `Not checked: ${c.unverified.join(" and ")}. ${NOT_CHECKED}` : NOT_CHECKED;
  const map: Record<FramingClass, [CameraStatus, string]> = {
    comparable: ["same", "The camera looks the same as when you set the reference."],
    normalizable: ["shifted", "The camera has been moved, zoomed or tilted a little since the reference, but it is looking at the hoop from the same side."],
    not_comparable: ["different_angle", "The camera is looking at the hoop from a different angle than the reference."],
    unknown: ["cant_tell", "Cannot tell whether the camera moved."],
  };
  const [status, headline] = map[c.class];
  const details = [...c.reasons, verified, c.class === "comparable" || c.class === "normalizable" ? "Counting is not affected either way, and saved sessions are not re-compared because of this." : "Counting is not affected. Do not treat shots from this view as directly comparable with the reference session."];
  return { status, headline, details, unverified: c.unverified, comparison: c };
}

/** Pixelwise median of equally sized RGBA frames (removes a passing person or the ball; the evaluation used medians of 5 frames, the app uses 3). */
export function medianFrame(frames: Pixels[]): Pixels {
  const n = frames.length, first = frames[0];
  if (n === 1) return first;
  const out = new Uint8ClampedArray(first.data.length);
  if (n === 3) {
    const [a, b, c] = [frames[0].data, frames[1].data, frames[2].data];
    for (let i = 0; i < out.length; i += 1) {
      if ((i & 3) === 3) { out[i] = 255; continue; }
      const x = a[i], y = b[i], z = c[i];
      out[i] = Math.max(Math.min(x, y), Math.min(Math.max(x, y), z));
    }
    return { data: out, width: first.width, height: first.height };
  }
  const v = new Array<number>(n);
  for (let i = 0; i < out.length; i += 1) {
    if ((i & 3) === 3) { out[i] = 255; continue; }
    for (let k = 0; k < n; k += 1) v[k] = frames[k].data[i];
    v.sort((a, b) => a - b);
    out[i] = v[n >> 1];
  }
  return { data: out, width: first.width, height: first.height };
}

export type CaptureResult = { descriptor: FramingDescriptor; stills: FramingMeasurement[]; ms: number };
/**
 * Describe the framing from a live source: `grab()` returns the current picture. Takes `stills` stills, each the median of `perStill` frames
 * `gapMs` apart. Costs about a second or two once; it is only ever run on request, never inside the counting loop.
 */
export async function captureDescriptor(grab: () => Pixels | null, seed: Seed, opts: { stills?: number; perStill?: number; gapMs?: number; onProgress?: (i: number, n: number) => void } = {}): Promise<CaptureResult> {
  const n = opts.stills ?? 5, per = opts.perStill ?? 3, gap = opts.gapMs ?? 200;
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const stills: FramingMeasurement[] = [];
  for (let i = 0; i < n; i += 1) {
    const frames: Pixels[] = [];
    for (let k = 0; k < per; k += 1) {
      const f = grab();
      if (f) frames.push({ data: new Uint8ClampedArray(f.data), width: f.width, height: f.height });
      if (k < per - 1) await new Promise((r) => setTimeout(r, gap));
    }
    if (frames.length) stills.push(measureFraming(medianFrame(frames), seed));
    opts.onProgress?.(i + 1, n);
    await new Promise((r) => setTimeout(r, 0));
  }
  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return { descriptor: describeFraming(stills), stills, ms: Math.round(t1 - t0) };
}
