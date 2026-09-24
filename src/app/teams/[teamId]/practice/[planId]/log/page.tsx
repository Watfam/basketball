import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SessionWrapup, type WrapupRow } from "@/components/session-wrapup";
import type { PracticeBlock } from "@/lib/basketball/practice";

export default async function LogResultsPage({
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
    .select("id, title, practice_date, blocks")
    .eq("id", planId)
    .eq("team_id", teamId)
    .maybeSingle();

  if (!plan) notFound();

  const blocks = (plan.blocks ?? []) as PracticeBlock[];
  const results: WrapupRow[] = blocks
    .filter((b) => !b.isSection && b.goal?.target)
    .map((b) => ({
      label: b.label,
      goalTarget: b.goal!.target,
      goalUnit: b.goal!.unit ?? null,
      actual: null,
    }));

  return (
    <div className="min-h-[100dvh] px-4 py-5 sm:py-8">
      <SessionWrapup
        teamId={teamId}
        planId={planId}
        planTitle={plan.title}
        initialRunDate={plan.practice_date ?? new Date().toISOString().slice(0, 10)}
        initialResults={results}
      />
    </div>
  );
}
