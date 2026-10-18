"use server";

/** Practice plans and the results of running them. */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { renamedDrills, type PracticeBlock } from "@/lib/basketball/practice";

/**
 * Creates or updates a practice plan. One action handles both — a plan
 * that doesn't exist yet is inserted, otherwise updated — since the
 * builder UI is the same form either way and the caller already knows
 * which case it is from whether planId was passed in.
 */
export async function savePracticePlan(
  teamId: string,
  planId: string | null,
  input: { title: string; practiceDate: string | null; focusAreas: string[]; blocks: unknown }
) {
  if (!teamId) return { error: "Missing team." };
  const title = input.title.trim();
  if (!title) return { error: "Give the plan a title." };

  const supabase = await createClient();
  const payload = {
    team_id: teamId,
    title,
    practice_date: input.practiceDate || null,
    focus_areas: input.focusAreas,
    blocks: input.blocks,
  };

  if (planId) {
    // A drill renamed in the plan keeps its history: its scores in this
    // plan's practices move to the new name (history matches by name).
    const { data: before } = await supabase.schema("hoops").from("practice_plans").select("blocks").eq("id", planId).maybeSingle();
    const renames = renamedDrills((before?.blocks ?? []) as PracticeBlock[], (input.blocks ?? []) as PracticeBlock[]);

    const { error } = await supabase
      .schema("hoops")
      .from("practice_plans")
      .update(payload)
      .eq("id", planId);
    if (error) return { error: error.message };

    if (renames.length) {
      const { data: sessions } = await supabase.schema("hoops").from("practice_sessions").select("id").eq("plan_id", planId);
      const ids = (sessions ?? []).map((s: { id: string }) => s.id);
      if (ids.length) {
        for (const r of renames) {
          await supabase
            .schema("hoops")
            .from("practice_drill_results")
            .update({ label: r.to })
            .eq("team_id", teamId)
            .eq("label", r.from)
            .in("session_id", ids);
        }
      }
      revalidatePath(`/teams/${teamId}/practice/history`);
    }
    revalidatePath(`/teams/${teamId}/practice`);
    return { error: null, planId };
  }

  const { data, error } = await supabase
    .schema("hoops")
    .from("practice_plans")
    .insert(payload)
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath(`/teams/${teamId}/practice`);
  return { error: null, planId: data.id as string };
}

/**
 * Duplicates a practice plan — same blocks and focus areas, a fresh
 * title and no date, since a coach running a similar practice most
 * weeks shouldn't have to retype the whole thing every time. Lands on
 * the edit page for the copy so today's tweaks (swap a block, change
 * the date) happen on the duplicate, never on the original.
 */
export async function duplicatePracticePlan(planId: string, teamId: string) {
  if (!planId) return { error: "Missing plan." };

  const supabase = await createClient();
  const { data: original, error: fetchError } = await supabase
    .schema("hoops")
    .from("practice_plans")
    .select("title, focus_areas, blocks")
    .eq("id", planId)
    .single();

  if (fetchError) return { error: fetchError.message };

  const { data: copy, error } = await supabase
    .schema("hoops")
    .from("practice_plans")
    .insert({
      team_id: teamId,
      title: `${original.title} (copy)`,
      focus_areas: original.focus_areas,
      blocks: original.blocks,
      practice_date: null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/teams/${teamId}/practice`);
  return { error: null, planId: copy.id as string };
}

export async function deletePracticePlan(planId: string, teamId: string) {
  if (!planId) return { error: "Missing plan." };

  const supabase = await createClient();
  const { error } = await supabase.schema("hoops").from("practice_plans").delete().eq("id", planId);

  if (error) return { error: error.message };

  revalidatePath(`/teams/${teamId}/practice`);
  return { error: null };
}

export type DrillResultInput = {
  label: string;
  goalTarget: number | null;
  goalUnit: string | null;
  actual: number | null;
};

/**
 * Logs that a practice actually happened — notes plus a numeric result
 * for whichever drills carry a goal. Works the same whether it's called
 * right after Run Practice (scores already entered live) or on its own
 * from the plan list to back-fill a practice that was never run through
 * the live screen at all.
 *
 * Re-saving an existing session (sessionId given) replaces its results
 * wholesale rather than diffing them — a session's results are only ever
 * edited as the one screen's worth of rows, never independently.
 */
export async function saveSessionResults(input: {
  sessionId?: string;
  teamId: string;
  planId: string | null;
  planTitle: string;
  runDate: string;
  notes: string | null;
  results: DrillResultInput[];
}) {
  if (!input.teamId) return { error: "Missing team." };

  const supabase = await createClient();
  let sessionId = input.sessionId ?? null;

  if (sessionId) {
    const { error } = await supabase
      .schema("hoops")
      .from("practice_sessions")
      .update({ plan_title: input.planTitle, run_date: input.runDate, notes: input.notes })
      .eq("id", sessionId);
    if (error) return { error: error.message };

    const { error: deleteError } = await supabase
      .schema("hoops")
      .from("practice_drill_results")
      .delete()
      .eq("session_id", sessionId);
    if (deleteError) return { error: deleteError.message };
  } else {
    const { data, error } = await supabase
      .schema("hoops")
      .from("practice_sessions")
      .insert({
        team_id: input.teamId,
        plan_id: input.planId,
        plan_title: input.planTitle,
        run_date: input.runDate,
        notes: input.notes,
      })
      .select("id")
      .single();
    if (error) return { error: error.message };
    sessionId = data.id as string;
  }

  const rows = input.results
    .filter((r) => r.goalTarget !== null || r.actual !== null)
    .map((r) => ({
      session_id: sessionId,
      team_id: input.teamId,
      label: r.label,
      goal_target: r.goalTarget,
      goal_unit: r.goalUnit,
      actual: r.actual,
    }));

  if (rows.length > 0) {
    const { error } = await supabase.schema("hoops").from("practice_drill_results").insert(rows);
    if (error) return { error: error.message };
  }

  revalidatePath(`/teams/${input.teamId}/practice`);
  revalidatePath(`/teams/${input.teamId}/practice/history`);
  return { error: null, sessionId };
}
