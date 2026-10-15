"use server";

/**
 * A shot set tracked for a workout drill becomes that drill's result, in the existing workout log (hoops.session_logs). The rules live in
 * src/lib/basketball/drill-log-store.ts, where they are tested, and the database calls in drill-store-supabase.ts; this file only connects them to the signed-in user. Row Level Security still scopes every read
 * and write to the caller's own household.
 */

import { createClient } from "@/lib/supabase/server";
import { adjustTrackedDrill, saveDrillLog, saveTrackedDrill, type SaveResult } from "@/lib/basketball/drill-log-store";
import { supabaseDrillStore } from "@/lib/basketball/drill-store-supabase";
import type { TrackingGoal } from "@/lib/basketball/drill-shooting";
import { revalidatePlayerSessionViews } from "./revalidate";

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
