import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PracticePlanForm } from "@/components/practice-plan-form";
import { frequentDrillNames, type PracticeBlock as PB } from "@/lib/basketball/practice";

export default async function NewPracticePlanPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: team } = await supabase
    .schema("hoops")
    .from("teams")
    .select("id, name")
    .eq("id", teamId)
    .maybeSingle();

  if (!team) notFound();

  // Fed into the fast-entry list as an optional link suggestion — cheap,
  // the whole library is a couple dozen rows.
  const { data: drills } = await supabase.schema("hoops").from("drills").select("id, name");

  const { data: pastPlans } = await supabase
    .schema("hoops")
    .from("practice_plans")
    .select("blocks")
    .eq("team_id", teamId);
  const quickNames = frequentDrillNames(((pastPlans ?? []).map((p) => p.blocks ?? [])) as PB[][]);

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-background/85 px-5 py-3 backdrop-blur">
        <div className="mx-auto w-full max-w-md">
          <Link
            href={`/teams/${teamId}/practice`}
            className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim transition-colors hover:text-foreground"
          >
            ← Practice Plans
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-5 sm:py-8">
        <PracticePlanForm teamId={teamId} availableDrills={drills ?? []} quickNames={quickNames} />
      </main>
    </div>
  );
}
