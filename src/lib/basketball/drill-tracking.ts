import { shootingProfile, type ShootingCategory, type TrackingGoal } from "./drill-shooting.ts";
import { isSkippedLog } from "./session-logs.ts";

/**
 * A tracked drill's result, as it is kept in the existing workout log (hoops.session_logs.metrics): the numbers the workout needs, a pointer to
 * the shot set the camera or the taps made (hoops.shot_sessions / hoops.shots, which keep the shot-by-shot detail), and an honest account of who
 * decided what. No new table. Pure functions, so they are tested without a database.
 */

export type TrackingSource = "camera" | "taps" | "mixed";

export type TrackedMetrics = {
  type: "shooting";
  variant: string | null;
  /** The kind of shot the DRILL asks for (drill-shooting.ts). Never something the camera detected. */
  category: ShootingCategory | null;
  category_basis: "drill_definition" | "keyword";
  makes: number;
  attempts: number;
  target: { kind: TrackingGoal["kind"]; value: number } | null;
  tracking: {
    v: 1;
    source: TrackingSource;
    shot_session_id: string;
    /** What the camera called before any correction, over the shots the camera counted. */
    camera_attempts: number;
    camera_makes: number;
    /** Camera calls the player reversed. */
    flipped: number;
    /** Shots the player added or tapped (the camera missed them, or the set was counted by taps). */
    added_by_hand: number;
    rule_version: string | null;
    model_version: string | null;
    /** Set when the player changed the totals after saving; keeps the first saved numbers. */
    adjusted: { original: { makes: number; attempts: number } } | null;
  };
};

export type ShotRow = { made: boolean; source: string; detected_made: boolean | null; added_by_hand?: boolean | null };

export function summarizeShots(rows: ShotRow[]) {
  const camera = rows.filter((r) => r.source === "camera" && !r.added_by_hand);
  const byHand = rows.filter((r) => r.source !== "camera" || r.added_by_hand);
  return {
    attempts: rows.length,
    makes: rows.filter((r) => r.made).length,
    camera_attempts: camera.length,
    camera_makes: camera.filter((r) => r.detected_made === true).length,
    flipped: camera.filter((r) => r.detected_made !== null && r.detected_made !== r.made).length,
    added_by_hand: byHand.length,
    source: (camera.length === 0 ? "taps" : byHand.length === 0 ? "camera" : "mixed") as TrackingSource,
  };
}

export function buildTrackedMetrics(input: {
  drill: { name: string; skill_tags?: string[] | null };
  variant: string | null;
  goal: TrackingGoal | null;
  shots: ShotRow[];
  shotSessionId: string;
  ruleVersion?: string | null;
  modelVersion?: string | null;
}): TrackedMetrics {
  const s = summarizeShots(input.shots), profile = shootingProfile(input.drill);
  return {
    type: "shooting",
    variant: input.variant,
    category: profile.category,
    category_basis: profile.basis === "keyword" ? "keyword" : "drill_definition",
    makes: s.makes,
    attempts: s.attempts,
    target: input.goal ? { kind: input.goal.kind, value: input.goal.target } : null,
    tracking: {
      v: 1, source: s.source, shot_session_id: input.shotSessionId, camera_attempts: s.camera_attempts, camera_makes: s.camera_makes, flipped: s.flipped, added_by_hand: s.added_by_hand,
      rule_version: input.ruleVersion ?? null, model_version: input.modelVersion ?? null, adjusted: null,
    },
  };
}

const int = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/** Read a log's metrics as a tracked result, or null if it is anything else (a plain sets log, a timer, a skip, rubbish). Never throws. */
export function parseTracked(metrics: unknown): TrackedMetrics | null {
  const m = metrics as Partial<TrackedMetrics> | null;
  if (!m || typeof m !== "object" || m.type !== "shooting" || !m.tracking || typeof m.tracking !== "object") return null;
  const t = m.tracking;
  if (t.v !== 1 || typeof t.shot_session_id !== "string" || !t.shot_session_id) return null;
  if (!int(m.makes) || !int(m.attempts) || m.makes > m.attempts) return null;
  if (!["camera", "taps", "mixed"].includes(t.source as string)) return null;
  return {
    type: "shooting", variant: typeof m.variant === "string" ? m.variant : null, category: (m.category as ShootingCategory | null) ?? null,
    category_basis: m.category_basis === "keyword" ? "keyword" : "drill_definition", makes: m.makes, attempts: m.attempts,
    target: m.target && (m.target.kind === "shots" || m.target.kind === "time") && int(m.target.value) ? { kind: m.target.kind, value: m.target.value } : null,
    tracking: {
      v: 1, source: t.source as TrackingSource, shot_session_id: t.shot_session_id, camera_attempts: int(t.camera_attempts) ? t.camera_attempts : 0, camera_makes: int(t.camera_makes) ? t.camera_makes : 0,
      flipped: int(t.flipped) ? t.flipped : 0, added_by_hand: int(t.added_by_hand) ? t.added_by_hand : 0, rule_version: typeof t.rule_version === "string" ? t.rule_version : null,
      model_version: typeof t.model_version === "string" ? t.model_version : null,
      adjusted: t.adjusted && int(t.adjusted.original?.makes) && int(t.adjusted.original?.attempts) ? { original: { makes: t.adjusted.original.makes, attempts: t.adjusted.original.attempts } } : null,
    },
  };
}

/** Plain-words account of how the numbers came about. Nothing here claims more than was counted. */
export function describeHow(t: TrackedMetrics["tracking"]): string {
  const parts: string[] = [];
  if (t.source === "camera") parts.push("Counted by the camera");
  else if (t.source === "taps") parts.push("Counted by your taps");
  else parts.push("Counted by the camera and your taps");
  const fixes: string[] = [];
  if (t.flipped > 0) fixes.push(`${t.flipped} call${t.flipped === 1 ? "" : "s"} you changed`);
  if (t.added_by_hand > 0 && t.source !== "taps") fixes.push(`${t.added_by_hand} shot${t.added_by_hand === 1 ? "" : "s"} you added`);
  if (fixes.length) parts.push(`${fixes.join(" and ")}`);
  if (t.adjusted) parts.push(`totals changed by you afterwards (first saved ${t.adjusted.original.makes} of ${t.adjusted.original.attempts})`);
  return parts.join("; ") + ".";
}

// ---- idempotent saving ------------------------------------------------------------------------------------------------------------------

export type LogRow = { id: string; metrics: unknown; created_at?: string | null };
export type IncomingKind = "tracked" | "plain" | "skip";
export type MergePlan =
  | { action: "insert"; metrics: Record<string, unknown>; deleteIds: string[] }
  | { action: "update"; targetId: string; metrics: Record<string, unknown>; deleteIds: string[] }
  | { action: "keep"; targetId: string; deleteIds: string[]; reason: "has_tracked_result" | "has_work" | "already_skipped" };

const newest = (rows: LogRow[]) => [...rows].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")) || a.id.localeCompare(b.id))[0];

/**
 * What to write for one workout entry, given the rows already stored for it (there may be several: older saves could stack up duplicates).
 * One row per entry is the rule: the plan keeps one row and lists the rest for deletion.
 *  - a tracked result updates the row (same shot set: kept idempotent and any adjustment the player made is preserved; a new shot set replaces it);
 *  - a plain "done" never overwrites a tracked result, and replaces a skip;
 *  - a skip never overwrites work.
 */
export function mergeDrillLog(existing: LogRow[], incoming: { kind: IncomingKind; metrics: Record<string, unknown> }): MergePlan {
  if (existing.length === 0) return { action: "insert", metrics: incoming.metrics, deleteIds: [] };
  const tracked = existing.filter((r) => parseTracked(r.metrics));
  const real = existing.filter((r) => !isSkippedLog(r.metrics));
  const anchor = tracked.length ? newest(tracked) : real.length ? newest(real) : newest(existing);
  const others = existing.filter((r) => r.id !== anchor.id).map((r) => r.id);
  if (incoming.kind === "tracked") {
    const inc = parseTracked(incoming.metrics);
    const prev = parseTracked(anchor.metrics);
    let metrics = incoming.metrics;
    if (inc && prev && prev.tracking.shot_session_id === inc.tracking.shot_session_id && prev.tracking.adjusted) {
      metrics = { ...inc, makes: prev.makes, attempts: prev.attempts, tracking: { ...inc.tracking, adjusted: prev.tracking.adjusted } };
    }
    return { action: "update", targetId: anchor.id, metrics, deleteIds: others };
  }
  if (incoming.kind === "skip") {
    return { action: "keep", targetId: anchor.id, deleteIds: others, reason: isSkippedLog(anchor.metrics) ? "already_skipped" : "has_work" };
  }
  // plain
  if (parseTracked(anchor.metrics)) return { action: "keep", targetId: anchor.id, deleteIds: others, reason: "has_tracked_result" };
  return { action: "update", targetId: anchor.id, metrics: incoming.metrics, deleteIds: others };
}

/** Change a saved tracked result's totals. The first saved numbers are kept so the change stays visible. */
export function adjustTracked(t: TrackedMetrics, makes: number, attempts: number): TrackedMetrics | { error: string } {
  if (!int(makes) || !int(attempts)) return { error: "Makes and attempts must be whole numbers." };
  if (makes > attempts) return { error: "Makes cannot be more than attempts." };
  if (attempts > 1000) return { error: "That is more shots than one drill can hold." };
  const original = t.tracking.adjusted?.original ?? { makes: t.makes, attempts: t.attempts };
  const same = makes === original.makes && attempts === original.attempts;
  return { ...t, makes, attempts, tracking: { ...t.tracking, adjusted: same ? null : { original } } };
}

/** The shot sets that belong to a workout drill (named in tracked log metrics). They are already counted as part of the workout, so activity totals must not count them a second time. */
export function linkedShotSessionIds(rows: { metrics: unknown }[]): Set<string> {
  const out = new Set<string>();
  for (const r of rows) { const t = parseTracked(r.metrics); if (t) out.add(t.tracking.shot_session_id); }
  return out;
}
