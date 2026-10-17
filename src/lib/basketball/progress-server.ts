import type { createClient } from "@/lib/supabase/server";
import { toProgressRows, type ProgressRow } from "./progress-rows";

type Supabase = Awaited<ReturnType<typeof createClient>>;
import { PROGRESS_ROW_LIMIT } from "./progress-limits";

/** Every tracked drill result of one player, oldest first, read under the player's own access. A full page means older ones were not read. */
export async function loadProgressRows(supabase: Supabase, playerId: string): Promise<{ rows: ProgressRow[]; truncated: boolean }> {
  const { data, error } = await supabase
    .schema("hoops")
    .from("session_logs")
    .select("id, session_id, metrics, created_at, drills(name), workout_sessions!inner(player_id, started_at, status, program_days(week_number, day_number))")
    .eq("workout_sessions.player_id", playerId)
    .eq("metrics->>type", "shooting")
    .order("created_at", { ascending: false })
    .limit(PROGRESS_ROW_LIMIT);
  if (error || !data) return { rows: [], truncated: false };
  return { rows: toProgressRows(data as unknown[]), truncated: data.length >= PROGRESS_ROW_LIMIT };
}
