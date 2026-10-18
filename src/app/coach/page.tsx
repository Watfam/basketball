import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/avatar";
import { RememberProfile } from "@/components/remember-profile";
import { formatPercentage, percentage, seasonStart, totalSessions } from "@/lib/basketball/shooting";
import { HeaderLink } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";

export const metadata = { title: "Coach" };

/** Monday 00:00 of this week, local time. */
function weekStart(now = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/**
 * The coach profile's home, in the order Matt chose: the players first
 * (who has been shooting, and how well), then how the camera is doing,
 * then the teams.
 */
export default async function CoachHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: household }, { data: teams }, { data: lastRun }] = await Promise.all([
    supabase.schema("hoops").from("households").select("id").eq("owner_id", user.id).maybeSingle(),
    supabase
      .schema("hoops")
      .from("teams")
      .select("id, name")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .schema("hoops")
      .from("calibration_runs")
      .select("created_at, hoop_label, rule_version, shots, agreed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const { data: players } = household
    ? await supabase
        .schema("hoops")
        .from("players")
        .select("id, display_name")
        .eq("household_id", household.id)
        .order("created_at", { ascending: true })
    : { data: null };

  const ids = (players ?? []).map((p) => p.id);
  const { data: shotRows } = ids.length
    ? await supabase
        .schema("hoops")
        .from("shot_sessions")
        .select("player_id, label, started_at, makes, attempts")
        .in("player_id", ids)
        .not("ended_at", "is", null)
        .is("deleted_at", null)
        .gt("attempts", 0)
        .gte("started_at", seasonStart().toISOString())
        .limit(1000)
    : { data: [] as { player_id: string; label: string | null; started_at: string; makes: number; attempts: number }[] };

  const monday = weekStart().getTime();
  const firstTeam = (teams ?? [])[0];

  return (
    <div className="flex flex-1 flex-col">
      <RememberProfile profile={{ kind: "coach", teamId: firstTeam?.id ?? null }} />
      <header className="sticky top-0 z-10 border-b border-line bg-background/85 px-5 py-3 backdrop-blur">
        <div className="mx-auto w-full max-w-lg">
          <HeaderLink href="/">Switch profile</HeaderLink>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-6 px-4 py-5 sm:py-8">
        <div>
          <h1 className="font-display text-3xl uppercase leading-none tracking-wide text-foreground">
            Coach home
          </h1>
        </div>

        <section className="space-y-2.5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl uppercase leading-none tracking-wide text-foreground">Teams</h2>
            <HeaderLink href="/teams/new" tone="accent">
              + New team
            </HeaderLink>
          </div>
          {(teams ?? []).length === 0 ? (
            <Link
              href="/teams/new"
              className="block rounded-2xl border border-dashed border-line px-4 py-4 text-center text-sm font-semibold text-foreground-dim transition-colors hover:border-accent hover:text-accent"
            >
              Set up a team: roster, scheme, practice plans
            </Link>
          ) : (
            <Card className="overflow-hidden">
              {(teams ?? []).map((t, i) => (
                <Link
                  key={t.id}
                  href={`/teams/${t.id}`}
                  className={`flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-raised ${
                    i ? "border-t border-line" : ""
                  }`}
                >
                  <p className="font-display text-xl uppercase leading-none tracking-tight text-foreground">{t.name}</p>
                  <span className="text-xs font-extrabold uppercase tracking-wide text-accent">Open →</span>
                </Link>
              ))}
            </Card>
          )}
        </section>
        <section className="space-y-2.5">
          <SectionTitle title="Family players" caption="Shooting this season" />
          {(players ?? []).length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line px-4 py-4 text-sm text-foreground-dim">
              Players added on the front door, under Manage family, show up here with their shooting.
            </p>
          ) : (
            <Card className="overflow-hidden">
              {(players ?? []).map((p, i) => {
                const rows = (shotRows ?? []).filter((r) => r.player_id === p.id);
                const season = totalSessions(rows);
                const thisWeek = rows.filter((r) => Date.parse(r.started_at) >= monday).length;
                return (
                  <Link
                    key={p.id}
                    // from=coach: looking at a player must not switch the phone's profile to them.
                    href={`/players/${p.id}/shooting?from=coach`}
                    className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-raised ${
                      i ? "border-t border-line" : ""
                    }`}
                  >
                    <Avatar id={p.id} name={p.display_name} size={38} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{p.display_name}</p>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-foreground-mute">
                        {thisWeek === 0
                          ? "No session this week"
                          : `${thisWeek} ${thisWeek === 1 ? "session" : "sessions"} this week`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-display text-xl leading-none text-accent">{formatPercentage(season.pct)}</p>
                      <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">
                        {season.attempts > 0 ? `${season.makes} of ${season.attempts}` : "this season"}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </Card>
          )}
        </section>

        <section className="space-y-2.5">
          <SectionTitle title="Camera lab" caption="How well the camera counts" />
          <Card className="p-4">
            {lastRun ? (
              <>
                <div className="flex items-end justify-between gap-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-foreground-mute">
                    {lastRun.hoop_label ?? "Calibration"} ·{" "}
                    {new Date(lastRun.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })} ·
                    rule {lastRun.rule_version ?? "?"}
                  </p>
                  <p className="font-display text-3xl leading-none text-foreground">
                    {lastRun.agreed}/{lastRun.shots}
                  </p>
                </div>
                <p className="mt-1.5 text-xs text-foreground-dim">
                  Last calibration: the camera matched the written record on {lastRun.agreed} of {lastRun.shots} shots (
                  {formatPercentage(percentage(lastRun.agreed, lastRun.shots))}).
                </p>
              </>
            ) : (
              <p className="text-xs text-foreground-dim">
                No calibration yet. Run a clip or the live camera in the detector lab, then calibrate it against what
                really happened.
              </p>
            )}
            <div className="mt-3 grid grid-cols-3 gap-2">
              {/* sm: three across on a phone leaves too little width for md's padding. */}
              <ButtonLink href="/lab/calibrate" size="sm">
                Calibrate
              </ButtonLink>
              <ButtonLink href="/lab/detector" variant="secondary" size="sm">
                Detector
              </ButtonLink>
              <ButtonLink href="/lab" variant="secondary" size="sm">
                History
              </ButtonLink>
            </div>
          </Card>
        </section>

      </main>
    </div>
  );
}

function SectionTitle({ title, caption }: { title: string; caption: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="font-display text-xl uppercase leading-none tracking-wide text-foreground">{title}</h2>
      <span className="text-[11px] font-bold uppercase tracking-wider text-foreground-mute">{caption}</span>
    </div>
  );
}
