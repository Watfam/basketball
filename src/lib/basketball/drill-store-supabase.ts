import type { createClient } from "@/lib/supabase/server";
import type { DrillStore } from "./drill-log-store.ts";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** The Supabase side of the drill store: the only place the drill-saving rules touch the database. Row Level Security scopes every call to the signed-in household. */
export function supabaseDrillStore(supabase: Supabase): DrillStore {
  const hoops = supabase.schema("hoops");
  const ok = <T,>(r: { data: T; error: { message: string; code?: string } | null }): T => { if (r.error) throw Object.assign(new Error(r.error.message), { code: r.error.code }); return r.data; };
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
