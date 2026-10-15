/**
 * Timings for the on-device test (see the report's iPhone procedure). Off unless localStorage hl:session-review-debug = "1".
 * In memory plus a small summary kept in localStorage; it never leaves the phone.
 */
export const DEBUG_KEY = "hl:session-review-debug";
export const DIAG_KEY = "hl:review:diag";

export function debugEnabled(read: (k: string) => string | null = (k) => (typeof window === "undefined" ? null : window.localStorage.getItem(k))): boolean {
  try { return read(DEBUG_KEY) === "1"; } catch { return false; }
}

export type DiagSummary = { name: string; n: number; medianMs: number; p95Ms: number; maxMs: number };
const samples = new Map<string, number[]>();
const MAX = 2000;

export function record(name: string, ms: number) {
  const a = samples.get(name) ?? [];
  a.push(ms);
  if (a.length > MAX) a.splice(0, a.length - MAX);
  samples.set(name, a);
}
export function summarize(): DiagSummary[] {
  return [...samples.entries()].map(([name, a]) => { const s = [...a].sort((x, y) => x - y); return { name, n: s.length, medianMs: s[s.length >> 1], p95Ms: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))], maxMs: s[s.length - 1] }; });
}
export function persist() {
  try {
    const body = JSON.stringify({ at: new Date().toISOString(), summary: summarize() });
    window.localStorage.setItem(DIAG_KEY, body);
    // Also kept per state of the session-review switch, so a set with it off can be compared with a set with it on.
    window.localStorage.setItem(`${DIAG_KEY}:${window.localStorage.getItem("hl:session-review") === "1" ? "on" : "off"}`, body);
  } catch { /* storage unavailable */ }
}
export function loadPersistedFor(state: "on" | "off"): { at: string; summary: DiagSummary[] } | null {
  try { return JSON.parse(window.localStorage.getItem(`${DIAG_KEY}:${state}`) ?? "null"); } catch { return null; }
}
export function loadPersisted(): { at: string; summary: DiagSummary[] } | null {
  try { return JSON.parse(window.localStorage.getItem(DIAG_KEY) ?? "null"); } catch { return null; }
}
/** A timer for a hot path: returns a function that records the elapsed time, or null when diagnostics are off (no cost then). */
export function timer(name: string): (() => void) | null {
  if (!debugEnabled()) return null;
  const t0 = performance.now();
  return () => record(name, performance.now() - t0);
}
