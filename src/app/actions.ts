"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createHousehold(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Household name is required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .schema("hoops")
    .from("households")
    .insert({ owner_id: user.id, name });

  if (error) return { error: error.message };

  revalidatePath("/");
  return { error: null };
}

export async function addPlayer(formData: FormData) {
  const householdId = String(formData.get("household_id") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const birthYearRaw = String(formData.get("birth_year") ?? "").trim();
  const primaryPosition = String(formData.get("primary_position") ?? "").trim();

  if (!householdId || !displayName) {
    return { error: "Player name is required." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .schema("hoops")
    .from("players")
    .insert({
      household_id: householdId,
      display_name: displayName,
      birth_year: birthYearRaw ? Number(birthYearRaw) : null,
      primary_position: primaryPosition || null,
    });

  if (error) return { error: error.message };

  revalidatePath("/");
  return { error: null };
}
