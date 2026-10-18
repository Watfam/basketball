"use server";

/** Workouts a family builds for itself: save (new or edited) and delete. Library workouts are never touched here. */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { deleteWorkout, saveWorkout } from "@/lib/basketball/custom-workouts-store";
import type { SaveInput } from "@/lib/basketball/workout-builder";

function refresh() {
  revalidatePath("/players/[playerId]/workouts", "page");
  revalidatePath("/players/[playerId]/sessions", "page");
  revalidatePath("/players/[playerId]", "page");
}

export async function saveCustomWorkout(input: SaveInput): Promise<{ error: string | null; workoutId?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const res = await saveWorkout(supabase.schema("hoops"), user.id, input);
  if (!res.error) refresh();
  return res;
}

export async function deleteCustomWorkout(workoutId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const res = await deleteWorkout(supabase.schema("hoops"), workoutId);
  if (!res.error) refresh();
  return res;
}
