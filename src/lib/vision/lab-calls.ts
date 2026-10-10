import { readDraft, writeDraft } from "@/lib/use-local-draft";
import type { Outcome } from "@/lib/vision/shotRules";

/**
 * The shot-by-shot calls of the last Camera lab run with the ball model,
 * kept on this phone so the calibration screen can score them against a
 * written list. Only the calls are kept: never a picture.
 */
export type LabCalls = {
  at: string;
  /** "IMG_4840.MOV, every frame" or "live camera". */
  source: string;
  ruleVersion: string;
  modelVersion: string;
  /** v3 and v4 are trial rules; runs saved before they existed have none. */
  calls: { v1: Outcome; v2: Outcome; v3?: Outcome; v4?: Outcome; flagged: boolean; atMs: number }[];
};

const KEY = "hl:lab:lastCalls";

export function saveLabCalls(calls: LabCalls) {
  writeDraft(KEY, JSON.stringify(calls));
}

export function readLabCalls(): LabCalls | null {
  try {
    const raw = readDraft(KEY);
    const parsed = raw ? (JSON.parse(raw) as LabCalls) : null;
    return parsed && Array.isArray(parsed.calls) ? parsed : null;
  } catch {
    return null;
  }
}

/** What the app's counting software is, recorded with every calibration. */
export const RULE_VERSION = "v2";
export const MODEL_VERSION = "ball-5";
