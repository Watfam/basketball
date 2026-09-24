import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PracticeRunner } from "@/components/practice-runner";
import { toRunnableSteps, totalMinutes, type PracticeBlock } from "@/lib/basketball/practice";

export default async function RunPracticePage({
  params,
}: {
  params: Promise<{ teamId: string; planId: string }>;
}) {
  const { teamId, planId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Independent of each other — parallel instead of sequential.
  const [{ data: plan }, { data: history }] = await Promise.all([
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

  if (!plan) notFound();

  const blocks = (plan.blocks ?? []) as PracticeBlock[];

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
    />
  );
}
