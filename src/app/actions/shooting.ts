"use server";

/** Shooting sessions: syncing a set from the phone, and deleting or restoring one. */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ShotSyncInput = {
  playerId: string;
  sessionId: string | null;
  label: string | null;
  startedAt: string;
  ended: boolean;
  /** The goal the set was shot to, if any (src/lib/basketball/goals.ts). */
  goal?: { kind: string; target: number; reached: boolean } | null;
  shots: {
    seq: number;
    made: boolean;
    zone: string | null;
    source: string;
    detectedMade: boolean | null;
    flagged?: boolean;
    tMs?: number | null;
    addedByHand?: boolean;
  }[];
  /** A camera set: how it was counted, for measuring the camera from real use. */
  camera?: { ruleVersion: string; modelVersion: string; rimX: number; rimY: number } | null;
};

const VALID_GOAL_KINDS = new Set(["shots", "makes", "time", "streak"]);

const VALID_ZONES = new Set([
  "free_throw",
  "paint",
  "left_corner",
  "left_wing",
  "top",
  "right_wing",
  "right_corner",
]);

/**
 * Pushes a shooting session's full snapshot to the database.
 *
 * The phone owns the session while it is being shot and sends the whole
 * list each time, rather than one write per tap. That makes every sync
 * idempotent: shots are upserted on (session_id, seq), then anything past
 * the current length is deleted, so replaying a sync after a dropped
 * connection can never double-count or lose a shot. The order matters —
 * upsert first, trim second — so there is never a moment where the
 * stored session holds fewer shots than the phone does.
 *
 * Mid-session syncs deliberately skip revalidatePath: it would re-render
 * the page the player is standing on. Only ending a session purges the
 * cached history and hub.
 */
export async function syncShotSession(input: ShotSyncInput) {
  if (!input.playerId) return { error: "Missing player." };
  // 1000 matches the API's per-request row cap, so a saved session can
  // always be read back whole. No real session comes near it.
  if (input.shots.length > 1000) return { error: "That is more shots than one session can hold." };

  // A malformed snapshot shouldn't reach the database half-applied.
  for (const [i, s] of input.shots.entries()) {
    if (s.seq !== i + 1) return { error: "Shot order is out of sequence." };
    if (s.zone !== null && !VALID_ZONES.has(s.zone)) return { error: "Unknown shot zone." };
    if (s.source !== "manual" && s.source !== "camera") return { error: "Unknown shot source." };
  }

  const goal = input.goal ?? null;
  if (goal && (!VALID_GOAL_KINDS.has(goal.kind) || !Number.isInteger(goal.target) || goal.target <= 0)) {
    return { error: "Unknown goal." };
  }

  const supabase = await createClient();
  const label = input.label?.trim().slice(0, 60) || null;
  const source = input.shots.some((s) => s.source === "camera") ? "camera" : "manual";
  const cam = input.camera ?? null;
  const cameraColumns = cam
    ? {
        rule_version: cam.ruleVersion.slice(0, 20),
        model_version: cam.modelVersion.slice(0, 40),
        rim_x: Math.min(1, Math.max(0, cam.rimX)),
        rim_y: Math.min(1, Math.max(0, cam.rimY)),
      }
    : {};
  const goalColumns = {
    goal_kind: goal?.kind ?? null,
    goal_target: goal?.target ?? null,
    goal_reached: goal ? goal.reached : null,
  };
  // Until migration 0021 has run, the goal columns don't exist; the set is
  // saved without them rather than not at all.
  const missingGoalColumns = (e: { message: string } | null) => Boolean(e && /goal_(kind|target|reached)/.test(e.message));
  const endedAt = input.ended ? new Date().toISOString() : null;
  const makes = input.shots.filter((s) => s.made).length;
  const attempts = input.shots.length;

  let sessionId = input.sessionId;

  if (sessionId) {
    const update = (withGoal: boolean) =>
      supabase
        .schema("hoops")
        .from("shot_sessions")
        .update({ label, source, ended_at: endedAt, makes, attempts, ...cameraColumns, ...(withGoal ? goalColumns : {}) })
        .eq("id", sessionId as string)
        .eq("player_id", input.playerId)
        .select("id");
    let { data: updated, error } = await update(true);
    if (missingGoalColumns(error)) ({ data: updated, error } = await update(false));
    if (error) return { error: error.message };
    // The row is gone (deleted from another device, say). Start a fresh
    // one from this snapshot instead of failing a session that is intact
    // on the phone.
    if (!updated || updated.length === 0) sessionId = null;
  }

  if (!sessionId) {
    const insert = (withGoal: boolean) =>
      supabase
        .schema("hoops")
        .from("shot_sessions")
        .insert({
          player_id: input.playerId,
          label,
          source,
          started_at: input.startedAt,
          ended_at: endedAt,
          makes,
          attempts,
          ...cameraColumns,
          ...(withGoal ? goalColumns : {}),
        })
        .select("id")
        .single();
    let { data, error } = await insert(true);
    if (missingGoalColumns(error)) ({ data, error } = await insert(false));
    if (error || !data) return { error: error?.message ?? "Couldn't save the session." };
    sessionId = data.id as string;
  }

  if (input.shots.length > 0) {
    const { error } = await supabase
      .schema("hoops")
      .from("shots")
      .upsert(
        input.shots.map((s) => ({
          session_id: sessionId,
          player_id: input.playerId,
          seq: s.seq,
          made: s.made,
          zone: s.zone,
          source: s.source,
          detected_made: s.detectedMade,
          flagged: Boolean(s.flagged),
          added_by_hand: Boolean(s.addedByHand),
          t_ms: typeof s.tMs === "number" && s.tMs >= 0 ? Math.round(s.tMs) : null,
        })),
        { onConflict: "session_id,seq" }
      );
    if (error) return { error: error.message };
  }

  const { error: trimError } = await supabase
    .schema("hoops")
    .from("shots")
    .delete()
    .eq("session_id", sessionId)
    .gt("seq", input.shots.length);
  if (trimError) return { error: trimError.message };

  if (input.ended) {
    revalidatePath("/players/[playerId]/shooting", "page");
    revalidatePath("/players/[playerId]", "page");
    revalidatePath("/players/[playerId]/me", "page");
  }

  return { error: null, sessionId };
}

/**
 * Deletes a session the player no longer wants (a set done by mistake, or
 * just messing around). The row is only marked, so Undo can restore it,
 * and every list and total skips marked rows straight away. Marked rows
 * are removed for good after 10 days by purgeDeletedShotSessions.
 */
export async function deleteShotSession(sessionId: string, playerId: string) {
  return setShotSessionDeleted(sessionId, playerId, new Date().toISOString());
}

export async function restoreShotSession(sessionId: string, playerId: string) {
  return setShotSessionDeleted(sessionId, playerId, null);
}

async function setShotSessionDeleted(sessionId: string, playerId: string, deletedAt: string | null) {
  if (!sessionId || !playerId) return { error: "Missing session." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("hoops")
    .from("shot_sessions")
    .update({ deleted_at: deletedAt })
    .eq("id", sessionId)
    .eq("player_id", playerId)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "That session is no longer there." };

  revalidatePath("/players/[playerId]/shooting", "page");
  revalidatePath("/players/[playerId]", "page");
  revalidatePath("/players/[playerId]/me", "page");
  return { error: null };
}
