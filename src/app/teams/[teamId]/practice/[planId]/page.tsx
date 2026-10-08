import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PracticePlanForm } from "@/components/practice-plan-form";
import { RunPracticeLink } from "@/components/run-practice-link";
import { frequentDrillNames, type PracticeBlock as PB } from "@/lib/basketball/practice";
import type { PracticeBlock } from "@/lib/basketball/practice";
import { PageHeader } from "@/components/ui/page-header";

export default async function EditPracticePlanPage({
  params,
}: {
  params: Promise<{ teamId: string; planId: string }>;
}) {
  const { teamId, planId } = await params;
  const supabase = await createClient();

  // None of these four depend on each other — parallel instead of
  // sequential round trips.
  const [{ data: { user } }, { data: plan }, { data: drills }, { data: pastPlans }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .schema("hoops")
      .from("practice_plans")
      .select("id, title, practice_date, focus_areas, blocks")
      .eq("id", planId)
      .eq("team_id", teamId)
      .maybeSingle(),
    supabase.schema("hoops").from("drills").select("id, name"),
    supabase.schema("hoops").from("practice_plans").select("blocks").eq("team_id", teamId),
  ]);

  if (!user) redirect("/login");
  if (!plan) notFound();

  const quickNames = frequentDrillNames(((pastPlans ?? []).map((p) => p.blocks ?? [])) as PB[][]);

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader back={{ href: `/teams/${teamId}/practice`, label: "Practice Plans" }} width="md">
        {/* RunPracticeLink (not HeaderLink) so the tap also unlocks audio; same look and tap area as a HeaderLink. */}
        <RunPracticeLink
          href={`/teams/${teamId}/practice/${planId}/run`}
          className="-my-3 inline-flex items-center py-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-accent transition-colors hover:text-accent-hover"
        >
          Run practice →
        </RunPracticeLink>
      </PageHeader>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-5 sm:py-8">
        <PracticePlanForm
          teamId={teamId}
          existing={{ ...plan, blocks: (plan.blocks ?? []) as PracticeBlock[] }}
          availableDrills={drills ?? []}
          quickNames={quickNames}
        />
      </main>
    </div>
  );
}
