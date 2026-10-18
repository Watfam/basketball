import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { WorkoutBuilder, type BuilderInitial } from "@/components/workout-builder";
import { playerLevel, WEAKNESS_THRESHOLD, type ComputedPlayerType } from "@/lib/basketball/assessment";
import { isBenchmarkLabel } from "@/lib/basketball/benchmarks";
import { WORKOUT_SKILLS } from "@/lib/basketball/train-library";
import { fallbackPrescription, typicalPrescriptions, type BuilderDrill } from "@/lib/basketball/workout-builder";
import { isCustomWorkout } from "@/lib/basketball/workout-minutes";

/**
 * Build a workout: how long, which skills, and a draft of drills to change. `?edit=<id>` opens one of the family's saved workouts.
 */
export default async function BuildWorkoutPage({ params, searchParams }: { params: Promise<{ playerId: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { playerId } = await params;
  const { edit } = await searchParams;
  const supabase = await createClient();
  const hoops = supabase.schema("hoops");
  const [{ data: { user } }, { data: player }, { data: drillRows }, { data: entryRows }] = await Promise.all([
    supabase.auth.getUser(),
    hoops.from("players").select("id, display_name, player_type").eq("id", playerId).maybeSingle(),
    hoops.from("drills").select("id, name, description, skill_tags, difficulty").order("name", { ascending: true }),
    hoops.from("workout_drills").select("drill_id, variant_label, target_sets, target_reps, target_duration_seconds, level_targets"),
  ]);
  if (!user) redirect("/login");
  if (!player) notFound();
  const playerType = (player.player_type ?? {}) as ComputedPlayerType;
  if (!playerType.archetype) redirect(`/players/${playerId}/assessment`);
  const level = playerLevel(player.player_type);

  const entries = (entryRows ?? []) as { drill_id: string; variant_label: string | null; target_sets: number | null; target_reps: number | null; target_duration_seconds: number | null; level_targets: Record<string, { sets?: number; reps?: number; duration_seconds?: number }> | null }[];
  const typical = typicalPrescriptions(entries, level, isBenchmarkLabel);
  // Practice drills: in at least one workout, and not only as a benchmark test.
  const practised = new Set(entries.filter((e) => !isBenchmarkLabel(e.variant_label)).map((e) => e.drill_id));
  const drills: BuilderDrill[] = (drillRows ?? [])
    .filter((d) => practised.has(d.id))
    .map((d) => {
      const p = typical.get(d.id) ?? fallbackPrescription;
      return { id: d.id, name: d.name, description: d.description ?? null, skill_tags: ((d.skill_tags ?? []) as string[]).filter((t) => WORKOUT_SKILLS.some((s) => s.value === t)), difficulty: d.difficulty ?? null, sets: p.sets, reps: p.reps, seconds: p.seconds };
    });

  const ratings = (playerType.ratings ?? {}) as Record<string, number>;
  const weak = WORKOUT_SKILLS.map((s) => s.value).filter((s) => ratings[s] !== undefined && ratings[s] < WEAKNESS_THRESHOLD).sort((a, b) => ratings[a] - ratings[b]).slice(0, 2);

  let initial: BuilderInitial | null = null;
  if (edit) {
    const { data: w } = await hoops
      .from("workouts")
      .select("id, name, focus_areas, estimated_minutes, player_type_tags, workout_drills(id, drill_id, sort_order, block, target_sets, target_reps, target_duration_seconds)")
      .eq("id", edit)
      .maybeSingle();
    if (!w || !isCustomWorkout(w)) redirect(`/players/${playerId}/workouts/build`);
    const list = [...(w.workout_drills as { id: string; drill_id: string; sort_order: number; block: string | null; target_sets: number | null; target_reps: number | null; target_duration_seconds: number | null }[])].sort((a, b) => a.sort_order - b.sort_order);
    initial = {
      id: w.id as string,
      name: w.name as string,
      skills: (w.focus_areas ?? []) as string[],
      entries: list.map((e) => ({ key: e.id, entryId: e.id, drillId: e.drill_id, sets: e.target_sets, reps: e.target_reps, seconds: e.target_duration_seconds, block: e.block === "warmup" || e.block === "finisher" ? e.block : "main" })),
    };
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader back={{ href: `/players/${playerId}/workouts`, label: "Train" }} />
      <WorkoutBuilder playerId={playerId} level={level} drills={drills} suggestedSkills={weak.length ? weak : ["shooting"]} initial={initial} />
    </div>
  );
}
