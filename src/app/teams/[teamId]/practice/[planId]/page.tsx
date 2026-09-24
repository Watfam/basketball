import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PracticePlanForm } from "@/components/practice-plan-form";
import { frequentDrillNames, type PracticeBlock as PB } from "@/lib/basketball/practice";
import type { PracticeBlock } from "@/lib/basketball/practice";

export default async function EditPracticePlanPage({
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

  // None of these three depend on each other — parallel instead of
  // three sequential round trips.
  const [{ data: plan }, { data: drills }, { data: pastPlans }] = await Promise.all([
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

  if (!plan) notFound();

  const quickNames = frequentDrillNames(((pastPlans ?? []).map((p) => p.blocks ?? [])) as PB[][]);

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-background/85 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center justify-between">
          <Link
            href={`/teams/${teamId}/practice`}
            className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim transition-colors hover:text-foreground"
          >
            ← Practice Plans
          </Link>
          <Link
            href={`/teams/${teamId}/practice/${planId}/run`}
            className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-accent transition-colors hover:text-accent-hover"
          >
            Run practice →
          </Link>
        </div>
      </header>
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
