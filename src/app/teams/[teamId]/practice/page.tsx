import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { DuplicatePlanButton } from "@/components/duplicate-plan-button";
import { RunPracticeLink } from "@/components/run-practice-link";
import { totalMinutes, type PracticeBlock } from "@/lib/basketball/practice";
import { PageHeader, HeaderLink } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ButtonLink, buttonClass } from "@/components/ui/button";

export default async function PracticePlansPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const supabase = await createClient();

  // Independent of each other — parallel instead of sequential.
  const [{ data: { user } }, { data: team }, { data: plans }, { data: sessions }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.schema("hoops").from("teams").select("id, name").eq("id", teamId).maybeSingle(),
    supabase
      .schema("hoops")
      .from("practice_plans")
      .select("id, title, practice_date, focus_areas, blocks")
      .eq("team_id", teamId)
      .order("practice_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    // Every logged session for the team, newest first — reduced below to
    // the most recent one per plan for the "Last run" line on each card.
    supabase
      .schema("hoops")
      .from("practice_sessions")
      .select("id, plan_id, run_date, created_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false }),
  ]);

  if (!user) redirect("/login");
  if (!team) notFound();

  const lastSessionByPlan = new Map<string, { id: string; run_date: string }>();
  (sessions ?? []).forEach((s) => {
    if (s.plan_id && !lastSessionByPlan.has(s.plan_id)) {
      lastSessionByPlan.set(s.plan_id, { id: s.id, run_date: s.run_date });
    }
  });

  // Depends on which sessions are actually "most recent per plan," so
  // this one has to wait for the map above rather than joining the
  // parallel batch.
  const lastSessionIds = [...lastSessionByPlan.values()].map((s) => s.id);
  const { data: lastResults } =
    lastSessionIds.length > 0
      ? await supabase
          .schema("hoops")
          .from("practice_drill_results")
          .select("session_id, actual")
          .in("session_id", lastSessionIds)
      : { data: [] };

  const scoreCountBySession = new Map<string, number>();
  (lastResults ?? []).forEach((r) => {
    if (r.actual !== null) {
      scoreCountBySession.set(r.session_id, (scoreCountBySession.get(r.session_id) ?? 0) + 1);
    }
  });

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader back={{ href: "/coach", label: "Coach" }}>
        <HeaderLink href={`/teams/${teamId}/practice/new`} tone="accent">
          + New plan
        </HeaderLink>
      </PageHeader>

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
              <Card key={plan.id} className="p-4 transition-colors hover:border-line-strong">
                <Link href={`/teams/${teamId}/practice/${plan.id}`} className="block">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-display text-xl uppercase leading-none tracking-tight text-foreground">
                      {plan.title}
                    </p>
                    {dateLabel && (
                      <span className="shrink-0 text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">
                        {dateLabel}
                      </span>
                    )}
                  </div>
                </Link>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
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
                  <div className="-mr-3 flex shrink-0 items-center gap-1">
                    <RunPracticeLink
                      href={`/teams/${teamId}/practice/${plan.id}/run`}
                      className={buttonClass({ variant: "secondary", size: "sm" })}
                    >
                      Run
                    </RunPracticeLink>
                    <ButtonLink href={`/teams/${teamId}/practice/${plan.id}/log`} variant="ghost" size="sm">
                      Log Results
                    </ButtonLink>
                    <DuplicatePlanButton planId={plan.id} teamId={teamId} />
                  </div>
                </div>
                {(() => {
                  const lastSession = lastSessionByPlan.get(plan.id);
                  if (!lastSession) return null;
                  const scoreCount = scoreCountBySession.get(lastSession.id) ?? 0;
                  const runDateLabel = new Date(
                    lastSession.run_date + "T00:00:00"
                  ).toLocaleDateString(undefined, { month: "short", day: "numeric" });
                  return (
                    <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-[var(--data-positive)]">
                      Last run: {runDateLabel}
                      {scoreCount > 0
                        ? ` · ${scoreCount} ${scoreCount === 1 ? "score" : "scores"} logged`
                        : ""}
                    </p>
                  );
                })()}
              </Card>
            );
          })
        )}
      </main>
    </div>
  );
}
