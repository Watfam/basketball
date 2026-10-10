import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PracticeRunner } from "@/components/practice-runner";
import { toRunnableSteps, totalMinutes, type PracticeBlock } from "@/lib/basketball/practice";
import type { DrillNotes } from "@/components/drill-instructions";

export default async function RunPracticePage({
  params,
}: {
  params: Promise<{ teamId: string; planId: string }>;
}) {
  const { teamId, planId } = await params;
  const supabase = await createClient();

  // Independent of each other — parallel instead of sequential.
  const [{ data: { user } }, { data: plan }, { data: history }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .schema("hoops")
      .from("practice_plans")
      .select("id, title, blocks")
      .eq("id", planId)
      .eq("team_id", teamId)
      .maybeSingle(),
    // Most recent logged score per drill name, team-wide — the "last
    // time" hint while scoring live. First occurrence wins since this is
    // ordered newest first, same matching frequentDrillNames already uses.
    supabase
      .schema("hoops")
      .from("practice_drill_results")
      .select("label, actual, created_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false }),
  ]);

  if (!user) redirect("/login");
  if (!plan) notFound();

  const blocks = (plan.blocks ?? []) as PracticeBlock[];

  // Coaching notes for drills that matched the library, shown as "How to do this" while running.
  const drillIds = [...new Set(blocks.map((b) => b.drillId).filter((id): id is string => Boolean(id)))];
  const { data: drillRows } = drillIds.length
    ? await supabase
        .schema("hoops")
        .from("drills")
        .select("id, name, description, video_url, source_trainer, setup, cues, common_mistakes, equipment")
        .in("id", drillIds)
    : { data: [] };
  const drills: Record<string, DrillNotes> = {};
  for (const d of (drillRows ?? []) as (DrillNotes & { id: string })[]) drills[d.id] = d;

  const lastResults: Record<string, number> = {};
  (history ?? []).forEach((r) => {
    if (r.actual !== null && !(r.label in lastResults)) {
      lastResults[r.label] = r.actual as number;
    }
  });

  return (
    <PracticeRunner
      teamId={teamId}
      planId={planId}
      planTitle={plan.title}
      steps={toRunnableSteps(blocks)}
      totalMinutes={totalMinutes(blocks)}
      lastResults={lastResults}
      drills={drills}
    />
  );
}
