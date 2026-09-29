import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SessionSummary } from "@/components/shot-summary";
import { DeleteShotSessionButton } from "@/components/delete-shot-session-button";
import { detectorAgreement, formatPercentage, type Shot } from "@/lib/basketball/shooting";

export default async function ShotSessionPage({
  params,
}: {
  params: Promise<{ playerId: string; sessionId: string }>;
}) {
  const { playerId, sessionId } = await params;
  const supabase = await createClient();

  const [{ data: { user } }, { data: session }, { data: shotRows }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .schema("hoops")
      .from("shot_sessions")
      .select("id, label, source, started_at, ended_at")
      .eq("id", sessionId)
      .eq("player_id", playerId)
      .maybeSingle(),
    supabase
      .schema("hoops")
      .from("shots")
      .select("seq, made, zone, source, detected_made")
      .eq("session_id", sessionId)
      .order("seq", { ascending: true })
      .limit(1000),
  ]);

  if (!user) redirect("/login");
  if (!session) notFound();

  const shots: Shot[] = (shotRows ?? []).map((r) => ({
    seq: r.seq,
    made: r.made,
    zone: r.zone,
    source: r.source,
    detectedMade: r.detected_made,
  }));

  const agreement = detectorAgreement(shots);
  const dateLabel = new Date(session.started_at).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-background/85 px-5 py-3 backdrop-blur">
        <div className="mx-auto w-full max-w-md">
          <Link
            href={`/players/${playerId}/shooting`}
            className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim transition-colors hover:text-foreground"
          >
            ← Shooting
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 space-y-6 px-4 py-5 sm:py-8">
        <section className="rounded-3xl border border-line bg-surface p-6">
          <SessionSummary
            label={session.label}
            dateLabel={dateLabel}
            startedAt={session.started_at}
            endedAt={session.ended_at}
            shots={shots}
          />
          {agreement.total > 0 && (
            <p className="mt-5 border-t border-line pt-3 text-[11px] text-foreground-mute">
              Camera calls confirmed: {agreement.agreed} of {agreement.total} (
              {formatPercentage(agreement.pct)})
            </p>
          )}
        </section>

        <DeleteShotSessionButton sessionId={session.id} playerId={playerId} />
      </main>
    </div>
  );
}
