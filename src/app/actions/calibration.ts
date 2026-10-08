"use server";

/** Camera calibration runs. */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type CalibrationInput = {
  source: string;
  hoopLabel: string | null;
  ruleVersion: string;
  modelVersion: string;
  shots: number;
  agreed: number;
  cameraMakes: number;
  trueMakes: number;
  perShot: unknown[];
  notes: string | null;
};

/** Saves one calibration: the camera's calls set against a written list. */
export async function saveCalibrationRun(input: CalibrationInput) {
  const ints = [input.shots, input.agreed, input.cameraMakes, input.trueMakes];
  if (ints.some((n) => !Number.isInteger(n) || n < 0) || input.agreed > input.shots) {
    return { error: "Those numbers don't add up." };
  }
  if (input.perShot.length > 2000) return { error: "That is more shots than one calibration can hold." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("hoops")
    .from("calibration_runs")
    .insert({
      kind: "calibration",
      hoop_label: input.hoopLabel?.trim().slice(0, 60) || null,
      rule_version: input.ruleVersion.slice(0, 20),
      model_version: input.modelVersion.slice(0, 40),
      shots: input.shots,
      agreed: input.agreed,
      camera_makes: input.cameraMakes,
      true_makes: input.trueMakes,
      per_shot: input.perShot,
      notes: [input.source.slice(0, 120), input.notes?.trim().slice(0, 500)].filter(Boolean).join(" · ") || null,
    });
  if (error) return { error: error.message };

  revalidatePath("/lab");
  return { error: null };
}

export async function deleteCalibrationRun(id: string) {
  if (!id) return { error: "Missing calibration." };
  const supabase = await createClient();
  const { error } = await supabase.schema("hoops").from("calibration_runs").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/lab");
  return { error: null };
}
