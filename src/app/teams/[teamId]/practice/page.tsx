import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { DuplicatePlanButton } from "@/components/duplicate-plan-button";
import { totalMinutes, type PracticeBlock } from "@/lib/basketball/practice";

export default async function PracticePlansPage({
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

  const { data: plans } = await supabase
    .schema("hoops")
    .from("practice_plans")
    .select("id, title, practice_date, focus_areas, blocks")
    .eq("team_id", teamId)
    .order("practice_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-background/85 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between">
          <Link
            href={`/teams/${teamId}`}
            className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim transition-colors hover:text-foreground"
          >
            ← {team.name}
          </Link>
          <Link
            href={`/teams/${teamId}/practice/new`}
            className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-accent transition-colors hover:text-accent-hover"
          >
            + New plan
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-3 px-4 py-5 sm:py-8">
        <h1 className="font-display text-3xl uppercase leading-none tracking-wide text-foreground">
          Practice Plans
        </h1>

        {(plans ?? []).length === 0 ? (
          <EmptyState
            eyebrow="Nothing planned"
            title="No practice plans yet"
            subtitle="Build blocks once and reuse the shape every week."
          />
        ) : (
          (plans ?? []).map((plan) => {
            const blocks = (plan.blocks ?? []) as PracticeBlock[];
            const dateLabel = plan.practice_date
              ? new Date(plan.practice_date + "T00:00:00").toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })
              : null;
            return (
              <div
                key={plan.id}
                className="rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-[var(--line-strong)]"
              >
                <Link href={`/teams/${teamId}/practice/${plan.id}`} className="block">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-display text-xl uppercase leading-none tracking-tight text-foreground">
                      {plan.title}
                    </p>
                    {dateLabel && (
                      <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute">
                        {dateLabel}
                      </span>
                    )}
                  </div>
                </Link>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-foreground-mute">
                    {(() => {
                      const drillCount = blocks.filter((b) => !b.isSection).length;
                      const minutes = totalMinutes(blocks);
                      return [
                        `${drillCount} ${drillCount === 1 ? "drill" : "drills"}`,
                        minutes > 0 ? `${minutes} min` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ");
                    })()}
                  </p>
                  <div className="flex shrink-0 items-center gap-3">
                    <Link
                      href={`/teams/${teamId}/practice/${plan.id}/run`}
                      className="text-[10px] font-extrabold uppercase tracking-wide text-accent transition-colors hover:text-accent-hover"
                    >
                      Run
                    </Link>
                    <DuplicatePlanButton planId={plan.id} teamId={teamId} />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}
