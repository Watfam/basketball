/** A drill log's metrics: a skipped drill is logged so it isn't offered again, but it is not work done. */
export function isSkippedLog(metrics: unknown): boolean {
  return typeof metrics === "object" && metrics !== null && (metrics as { skipped?: unknown }).skipped === true;
}

/** True when at least one log is a drill actually done. A session with none is the same as an empty one. */
export function hasRealWork(logs: { metrics: unknown }[]): boolean {
  return logs.some((l) => !isSkippedLog(l.metrics));
}

type LogRef = { workout_drill_id: string | null; drill_id?: string | null; metrics?: unknown };

/**
 * Which workout entries a session's logs belong to. A log says so itself (workout_drill_id); older logs, written before entries existed, only
 * name the drill, so they are matched to the first entry of that drill not already taken. Without this a finished older session read as 0 of N.
 */
export function entryIdsForLogs(logs: LogRef[], entries: { id: string; drill_id: string }[]): { logged: string[]; skipped: string[] } {
  const taken = new Set(logs.map((l) => l.workout_drill_id).filter((x): x is string => Boolean(x)));
  const logged: string[] = [], skipped: string[] = [];
  for (const log of logs) {
    let id = log.workout_drill_id;
    if (!id && log.drill_id) {
      id = entries.find((e) => e.drill_id === log.drill_id && !taken.has(e.id))?.id ?? null;
      if (id) taken.add(id);
    }
    if (!id) continue;
    logged.push(id);
    if (isSkippedLog(log.metrics)) skipped.push(id);
  }
  return { logged, skipped };
}
