import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PracticePlanForm } from "@/components/practice-plan-form";
import { frequentDrillNames, type PracticeBlock as PB } from "@/lib/basketball/practice";
import { PageHeader } from "@/components/ui/page-header";

export default async function NewPracticePlanPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const supabase = await createClient();

  // None of these four depend on each other — parallel instead of
  // sequential round trips.
  const [{ data: { user } }, { data: team }, { data: drills }, { data: pastPlans }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.schema("hoops").from("teams").select("id, name").eq("id", teamId).maybeSingle(),
    // Fed into the fast-entry list as an optional link suggestion — cheap,
    // the whole library is a couple dozen rows.
    supabase.schema("hoops").from("drills").select("id, name"),
    supabase.schema("hoops").from("practice_plans").select("blocks").eq("team_id", teamId),
  ]);

  if (!user) redirect("/login");
  if (!team) notFound();

  const quickNames = frequentDrillNames(((pastPlans ?? []).map((p) => p.blocks ?? [])) as PB[][]);

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader back={{ href: `/teams/${teamId}/practice`, label: "Practice" }} width="md" />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-5 sm:py-8">
        <PracticePlanForm teamId={teamId} availableDrills={drills ?? []} quickNames={quickNames} />
      </main>
    </div>
  );
}
