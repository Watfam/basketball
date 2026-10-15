"use server";

/**
 * A shot set tracked for a workout drill becomes that drill's result, in the existing workout log (hoops.session_logs). The rules live in
 * src/lib/basketball/drill-log-store.ts, where they are tested; this file is only the Supabase adapter. Row Level Security still scopes every read
 * and write to the caller's own household.
 */

import { createClient } from "@/lib/supabase/server";
import { adjustTrackedDrill, saveDrillLog, saveTrackedDrill, type DrillStore, type SaveResult } from "@/lib/basketball/drill-log-store";
import type { TrackingGoal } from "@/lib/basketball/drill-shooting";
import { revalidatePlayerSessionViews } from "./revalidate";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function supabaseDrillStore(supabase: Supabase): DrillStore {
  const hoops = supabase.schema("hoops");
  const ok = <T,>(r: { data: T; error: { message: string } | null }): T => { if (r.error) throw new Error(r.error.message); return r.data; };
  return {
    async workoutSession(id) {
      return ok(await hoops.from("workout_sessions").select("id, player_id, workout_id, status").eq("id", id).maybeSingle());
    },
    async entry(entryId) {
      const r = ok(await hoops.from("workout_drills").select("id, workout_id, drill_id, variant_label, drills(name, skill_tags)").eq("id", entryId).maybeSingle()) as { id: string; workout_id: string; drill_id: string; variant_label: string | null; drills: unknown } | null;
      if (!r) return null;
      const d = r.drills as unknown as { name: string; skill_tags: string[] | null } | { name: string; skill_tags: string[] | null }[] | null;
      return { id: r.id, workout_id: r.workout_id, drill_id: r.drill_id, variant_label: r.variant_label, drill: Array.isArray(d) ? (d[0] ?? null) : d };
    },
    async shotSession(id) {
      return ok(await hoops.from("shot_sessions").select("id, player_id, ended_at, deleted_at, rule_version, model_version").eq("id", id).maybeSingle());
    },
    async shots(shotSessionId) {
      return ok(await hoops.from("shots").select("made, source, detected_made, added_by_hand").eq("session_id", shotSessionId).limit(1000)) ?? [];
    },
    async logs(sessionId, entryId) {
      return ok(await hoops.from("session_logs").select("id, metrics, created_at").eq("session_id", sessionId).eq("workout_drill_id", entryId)) ?? [];
    },
    async insertLog(row) {
      const r = ok(await hoops.from("session_logs").insert(row).select("id").single()) as { id: string } | null;
      if (!r) throw new Error("The drill result was not saved.");
      return r.id;
    },
    async updateLog(id, metrics) {
      ok(await hoops.from("session_logs").update({ metrics }).eq("id", id).select("id"));
    },
    async deleteLogs(ids) {
      if (ids.length) ok(await hoops.from("session_logs").delete().in("id", ids).select("id"));
    },
  };
}

export type TrackedSaveOutcome = { error: string | null; code?: string; metrics?: Record<string, unknown>; action?: string };

/** Called by the shooting screen when a drill-linked set has been saved. Safe to call again for the same set. */
export async function saveDrillTracking(input: { playerId: string; workoutSessionId: string; workoutDrillId: string; shotSessionId: string; goal?: TrackingGoal | null }): Promise<TrackedSaveOutcome> {
  try {
    const supabase = await createClient();
    const r: SaveResult = await saveTrackedDrill(supabaseDrillStore(supabase), input);
    if (!r.ok) return { error: r.message, code: r.code };
    revalidatePlayerSessionViews();
    return { error: null, metrics: r.metrics, action: r.action };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't save the drill result.", code: "error" };
  }
}

/** The player corrects the makes and attempts of a tracked drill result. */
export async function adjustDrillResult(input: { playerId: string; workoutSessionId: string; workoutDrillId: string; makes: number; attempts: number }): Promise<TrackedSaveOutcome> {
  try {
    const supabase = await createClient();
    const r = await adjustTrackedDrill(supabaseDrillStore(supabase), input);
    if (!r.ok) return { error: r.message, code: r.code };
    revalidatePlayerSessionViews();
    return { error: null, metrics: r.metrics, action: r.action };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't change the result.", code: "error" };
  }
}

/** The workout player's own drill log (done or skipped): one row per workout entry, and never over a tracked result. */
export async function saveDrillLogOnce(sessionId: string, drillId: string, metrics: Record<string, unknown>, workoutDrillId?: string) {
  try {
    const supabase = await createClient();
    const r = await saveDrillLog(supabaseDrillStore(supabase), { sessionId, drillId, workoutDrillId, metrics });
    return { error: null, kept: r.action === "keep" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't save the drill." };
  }
}
