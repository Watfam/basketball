import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SessionWrapup, type WrapupRow } from "@/components/session-wrapup";
import { PageHeader } from "@/components/ui/page-header";

/**
 * A practice already logged: its scores and notes, open to fix. Saving
 * replaces this practice's results; it never makes a second practice.
 */
export default async function LoggedPracticePage({
  params,
}: {
  params: Promise<{ teamId: string; sessionId: string }>;
}) {
  const { teamId, sessionId } = await params;
  const supabase = await createClient();

  const [{ data: { user } }, { data: session }, { data: rows }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .schema("hoops")
      .from("practice_sessions")
      .select("id, plan_id, plan_title, run_date, notes")
      .eq("id", sessionId)
      .eq("team_id", teamId)
      .maybeSingle(),
    supabase
      .schema("hoops")
      .from("practice_drill_results")
      .select("label, goal_target, goal_unit, actual, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true }),
  ]);

  if (!user) redirect("/login");
  if (!session) notFound();

  const results: WrapupRow[] = (rows ?? []).map((r) => ({
    label: r.label,
    goalTarget: r.goal_target as number | null,
    goalUnit: r.goal_unit as string | null,
    actual: r.actual as number | null,
  }));

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader back={{ href: `/teams/${teamId}/practice/history`, label: "History" }} width="md" />
      <div className="px-4 py-5 sm:py-8">
        <SessionWrapup
          teamId={teamId}
          planId={session.plan_id}
          planTitle={session.plan_title ?? "Practice"}
          initialRunDate={session.run_date ?? new Date().toISOString().slice(0, 10)}
          initialResults={results}
          initialNotes={session.notes ?? ""}
          existingSessionId={session.id}
        />
      </div>
    </div>
  );
}
