/** A drill log's metrics: a skipped drill is logged so it isn't offered again, but it is not work done. */
export function isSkippedLog(metrics: unknown): boolean {
  return typeof metrics === "object" && metrics !== null && (metrics as { skipped?: unknown }).skipped === true;
}

/** True when at least one log is a drill actually done. A session with none is the same as an empty one. */
export function hasRealWork(logs: { metrics: unknown }[]): boolean {
  return logs.some((l) => !isSkippedLog(l.metrics));
}
