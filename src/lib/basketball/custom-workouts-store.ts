/** The database work for custom workouts, against any hoops-scoped client, so the same code runs in the app and in the local Postgres test. */
import { blocksFor, cleanSave, totalMinutes, type SaveInput } from "./workout-builder.ts";
import { WORKOUT_SKILLS } from "./workout-skills.ts";

export type HoopsDb = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export const NOT_READY = "Saving your own workouts needs a database update (migration 0027) that has not been applied yet. Nothing was lost: the workout is still on this screen.";

export function friendly(message: string): string {
  return /row-level security|owner_household_id|permission denied/i.test(message) ? NOT_READY : message;
}

export async function saveWorkout(hoops: HoopsDb, userId: string, input: SaveInput): Promise<{ error: string | null; workoutId?: string }> {
  const checked = cleanSave(input, WORKOUT_SKILLS.map((s) => s.value));
  if (!checked.ok) return { error: checked.error };
  const v = checked.value;

  const { data: household } = await hoops.from("households").select("id").eq("owner_id", userId).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!household) return { error: "Set up your family first." };

  const ids = [...new Set(v.entries.map((e) => e.drillId))];
  const { data: found } = await hoops.from("drills").select("id").in("id", ids);
  if ((found ?? []).length !== ids.length) return { error: "One of the drills is no longer in the library. Remove it and try again." };

  const blocks = blocksFor(v.entries.length);
  const rows = v.entries.map((e, i) => ({ drill_id: e.drillId, sort_order: i, block: blocks[i], target_sets: e.sets, target_reps: e.reps, target_duration_seconds: e.seconds }));
  const minutes = totalMinutes(v.entries);

  if (v.id) {
    const { data: updated, error } = await hoops
      .from("workouts")
      .update({ name: v.name, focus_areas: v.skills, estimated_minutes: minutes })
      .eq("id", v.id)
      .eq("owner_household_id", household.id)
      .select("id");
    if (error) return { error: friendly(error.message) };
    if (!updated || updated.length === 0) return { error: "That workout is not one of yours, or it was deleted." };

    const { data: existing } = await hoops.from("workout_drills").select("id").eq("workout_id", v.id);
    const have = new Set<string>((existing ?? []).map((r: { id: string }) => r.id));
    const keep = new Set(v.entries.map((e) => e.id).filter((x): x is string => Boolean(x) && have.has(x as string)));
    const drop = [...have].filter((id) => !keep.has(id));
    if (drop.length) {
      const { error: dropError } = await hoops.from("workout_drills").delete().in("id", drop);
      if (dropError) return { error: friendly(dropError.message) };
    }
    for (let i = 0; i < v.entries.length; i += 1) {
      const e = v.entries[i];
      if (e.id && keep.has(e.id)) {
        const { error: upError } = await hoops.from("workout_drills").update(rows[i]).eq("id", e.id);
        if (upError) return { error: friendly(upError.message) };
      } else {
        const { error: insError } = await hoops.from("workout_drills").insert({ ...rows[i], workout_id: v.id });
        if (insError) return { error: friendly(insError.message) };
      }
    }
    return { error: null, workoutId: v.id };
  }

  const { data: created, error } = await hoops
    .from("workouts")
    .insert({ name: v.name, description: "Built by you.", focus_areas: v.skills, estimated_minutes: minutes, player_type_tags: { custom: true }, owner_household_id: household.id })
    .select("id")
    .single();
  if (error || !created) return { error: friendly(error?.message ?? "The workout could not be saved.") };

  const { error: entriesError } = await hoops.from("workout_drills").insert(rows.map((r) => ({ ...r, workout_id: created.id })));
  if (entriesError) {
    await hoops.from("workouts").delete().eq("id", created.id);
    return { error: friendly(entriesError.message) };
  }
  return { error: null, workoutId: created.id as string };
}

export async function deleteWorkout(hoops: HoopsDb, workoutId: string): Promise<{ error: string | null }> {
  if (!workoutId) return { error: "Missing workout." };
  const { data: gone, error } = await hoops.from("workouts").delete().eq("id", workoutId).not("owner_household_id", "is", null).select("id");
  if (error) return { error: friendly(error.message) };
  if (!gone || gone.length === 0) return { error: "That workout is not one of yours, or it is already gone." };
  return { error: null };
}
