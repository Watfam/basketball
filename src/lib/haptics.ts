/**
 * Thin wrapper around the Web Vibration API. Graceful no-op wherever it's
 * unsupported — most notably iOS Safari, which doesn't implement it at all
 * (Android/Chrome only, or a future native/Capacitor-wrapped app).
 */
type HapticPattern = "tap" | "step" | "success";

const PATTERNS: Record<HapticPattern, number | number[]> = {
  tap: 8,
  step: 12,
  success: [10, 40, 10, 40, 20],
};

export function haptic(pattern: HapticPattern) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  navigator.vibrate(PATTERNS[pattern]);
}
