import { adjustTracked, buildTrackedMetrics, mergeDrillLog, parseTracked, type LogRow, type MergePlan, type ShotRow, type TrackedMetrics } from "./drill-tracking.ts";
import { shootingProfile, type TrackingGoal } from "./drill-shooting.ts";
import { isSkippedLog } from "./session-logs.ts";

/**
 * Saving a tracked drill into the existing workout log, behind a small store interface so the rules are tested without a database
 * (src/app/actions/drill-tracking.ts is the thin Supabase adapter). Every write is for ONE workout entry, ONE row: saving twice, resuming and
 * saving again, or two saves racing all end with the same single row.
 */

export interface DrillStore {
  workoutSession(id: string): Promise<{ id: string; player_id: string; workout_id: string | null; status: string } | null>;
  entry(entryId: string): Promise<{ id: string; workout_id: string; drill_id: string; variant_label: string | null; drill: { name: string; skill_tags: string[] | null } | null } | null>;
  shotSession(id: string): Promise<{ id: string; player_id: string | null; ended_at: string | null; deleted_at: string | null; rule_version: string | null; model_version: string | null } | null>;
  shots(shotSessionId: string): Promise<ShotRow[]>;
  logs(sessionId: string, entryId: string): Promise<LogRow[]>;
  insertLog(row: { session_id: string; drill_id: string; workout_drill_id: string | null; metrics: Record<string, unknown> }): Promise<string>;
  updateLog(id: string, metrics: Record<string, unknown>): Promise<void>;
  deleteLogs(ids: string[]): Promise<void>;
}

export type SaveCode = "no_workout" | "closed" | "no_entry" | "not_trackable" | "no_shots" | "bad_input" | "no_result";
export type SaveResult = { ok: true; metrics: Record<string, unknown>; action: "insert" | "update" | "keep" } | { ok: false; code: SaveCode; message: string };
const fail = (code: SaveCode, message: string): SaveResult => ({ ok: false, code, message });

const goalOf = (g: TrackingGoal | null | undefined): TrackingGoal | null =>
  g && (g.kind === "shots" || g.kind === "time") && Number.isInteger(g.target) && g.target > 0 && g.target <= 3600 ? { kind: g.kind, target: g.target } : null;

/** Apply a plan, then converge: if a concurrent save added a second row meanwhile, both saves settle on the same one. */
async function apply(store: DrillStore, sessionId: string, entry: { id: string; drill_id: string }, plan: MergePlan, kind: "tracked" | "plain" | "skip", incoming: Record<string, unknown>) {
  if (plan.deleteIds.length) await store.deleteLogs(plan.deleteIds);
  if (plan.action === "update") await store.updateLog(plan.targetId, plan.metrics);
  if (plan.action === "insert") {
    await store.insertLog({ session_id: sessionId, drill_id: entry.drill_id, workout_drill_id: entry.id, metrics: plan.metrics });
    const after = await store.logs(sessionId, entry.id);
    if (after.length > 1) {
      const again = mergeDrillLog(after, { kind, metrics: incoming });
      if (again.deleteIds.length) await store.deleteLogs(again.deleteIds);
      if (again.action === "update") await store.updateLog(again.targetId, again.metrics);
    }
  }
}

/** The set the camera (or the taps) shot for this workout entry is now the drill's result. Safe to call any number of times. */
export async function saveTrackedDrill(
  store: DrillStore,
  input: { playerId: string; workoutSessionId: string; workoutDrillId: string; shotSessionId: string; goal?: TrackingGoal | null }
): Promise<SaveResult> {
  if (!input.playerId || !input.workoutSessionId || !input.workoutDrillId || !input.shotSessionId) return fail("bad_input", "Missing workout, drill or shot set.");
  const ws = await store.workoutSession(input.workoutSessionId);
  if (!ws || ws.player_id !== input.playerId) return fail("no_workout", "That workout is no longer there. The shots are saved in your shooting history.");
  if (ws.status !== "in_progress") return fail("closed", "That workout was already finished, so this result was not added to it. The shots are saved in your shooting history.");
  const entry = await store.entry(input.workoutDrillId);
  if (!entry || entry.workout_id !== ws.workout_id) return fail("no_entry", "That drill is not part of this workout.");
  const profile = shootingProfile(entry.drill);
  if (!profile.trackable) return fail("not_trackable", "This drill is not one that counts makes and attempts.");
  const ss = await store.shotSession(input.shotSessionId);
  if (!ss || ss.player_id !== input.playerId || ss.deleted_at) return fail("no_shots", "That set of shots is not available.");
  const shots = await store.shots(ss.id);
  if (shots.length === 0) return fail("no_shots", "No shots were counted, so the drill was not marked done.");

  const metrics = buildTrackedMetrics({ drill: entry.drill ?? { name: "" }, variant: entry.variant_label, goal: goalOf(input.goal), shots, shotSessionId: ss.id, ruleVersion: ss.rule_version, modelVersion: ss.model_version }) as unknown as Record<string, unknown>;
  const plan = mergeDrillLog(await store.logs(ws.id, entry.id), { kind: "tracked", metrics });
  await apply(store, ws.id, entry, plan, "tracked", metrics);
  const final = plan.action === "keep" ? ((await store.logs(ws.id, entry.id))[0]?.metrics as Record<string, unknown>) : plan.metrics;
  return { ok: true, metrics: final, action: plan.action };
}

/** The workout player's own saves (a done drill or a skip), one row per entry. A plain save never replaces a tracked result. */
export async function saveDrillLog(
  store: DrillStore,
  input: { sessionId: string; drillId: string; workoutDrillId?: string | null; metrics: Record<string, unknown> }
): Promise<{ action: "insert" | "update" | "keep"; reason?: string }> {
  if (!input.workoutDrillId) {
    await store.insertLog({ session_id: input.sessionId, drill_id: input.drillId, workout_drill_id: null, metrics: input.metrics });
    return { action: "insert" };
  }
  const kind = isSkippedLog(input.metrics) ? "skip" : "plain";
  const entry = { id: input.workoutDrillId, drill_id: input.drillId };
  const plan = mergeDrillLog(await store.logs(input.sessionId, entry.id), { kind, metrics: input.metrics });
  await apply(store, input.sessionId, entry, plan, kind, input.metrics);
  return plan.action === "keep" ? { action: "keep", reason: plan.reason } : { action: plan.action };
}

/** The player corrects the totals of a saved tracked result. */
export async function adjustTrackedDrill(
  store: DrillStore,
  input: { playerId: string; workoutSessionId: string; workoutDrillId: string; makes: number; attempts: number }
): Promise<SaveResult> {
  const ws = await store.workoutSession(input.workoutSessionId);
  if (!ws || ws.player_id !== input.playerId) return fail("no_workout", "That workout is no longer there.");
  const logs = await store.logs(ws.id, input.workoutDrillId);
  const row = logs.find((l) => parseTracked(l.metrics));
  const t = row ? parseTracked(row.metrics) : null;
  if (!row || !t) return fail("no_result", "There is no tracked result to change for this drill.");
  const next = adjustTracked(t, input.makes, input.attempts);
  if ("error" in next) return fail("bad_input", next.error);
  const metrics = next as unknown as Record<string, unknown>;
  await store.updateLog(row.id, metrics);
  return { ok: true, metrics, action: "update" };
}

export type { TrackedMetrics };
