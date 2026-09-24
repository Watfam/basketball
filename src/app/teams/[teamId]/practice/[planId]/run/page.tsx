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

  const { data: plan } = await supabase
    .schema("hoops")
    .from("practice_plans")
    .select("id, blocks")
    .eq("id", planId)
    .eq("team_id", teamId)
    .maybeSingle();

  if (!plan) notFound();

  const blocks = (plan.blocks ?? []) as PracticeBlock[];

  return (
    <div className="theme-dark">
      <PracticeRunner
        teamId={teamId}
        planId={planId}
        steps={toRunnableSteps(blocks)}
        totalMinutes={totalMinutes(blocks)}
      />
    </div>
  );
}
