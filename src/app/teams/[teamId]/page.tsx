import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, HeaderLink } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { RosterRow } from "@/components/roster-row";
import { AddRosterForm } from "@/components/add-roster-form";
import { EmptyState } from "@/components/empty-state";
import { DEFENSIVE_SCHEMES, OFFENSIVE_SCHEMES, TEAM_FOCUS_AREAS } from "@/lib/basketball/taxonomy";
import { rosterDisplayName, sortRoster, type RosterMember } from "@/lib/basketball/team";
import { CoachToday } from "@/components/coach-today";
import { buildCoachToday, teamRecord, type TodayGame, type TodayPlan } from "@/lib/basketball/today";
import { totalMinutes, type PracticeBlock } from "@/lib/basketball/practice";
import { seasonStart, totalSessions, weekStart, type SessionRow, type SessionTotals } from "@/lib/basketball/shooting";
import { TeamSnapshot, type SnapshotPlayer } from "@/components/team-snapshot";

function schemeLabel(
  options: readonly { value: string; label: string }[],
  value: string | null,
  custom: string | null
): string | null {
  if (!value) return null;
  if (value === "custom") return custom || "Custom";
  return options.find((o) => o.value === value)?.label ?? value;
}

/**
 * The team hub. Read-only for a parent whose kid is on the roster
 * (team_members_self_select grants them SELECT); every mutation control
 * below only renders for the owning coach, matching what RLS actually
 * lets them do.
 */
export default async function TeamPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const supabase = await createClient();

  // None of these four depend on each other's results, only on teamId
  // (already known from params) — running them in parallel, auth check
  // included, instead of one after another.
  const [
    { data: { user } },
    { data: team },
    { data: memberRows, error: memberError },
    { data: ownPlayers },
    { data: gameRows },
    { data: datedPlanRows },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .schema("hoops")
      .from("teams")
      .select(
        "id, owner_id, name, defensive_scheme, defensive_scheme_custom, offensive_scheme, offensive_scheme_custom, focus_areas"
      )
      .eq("id", teamId)
      .maybeSingle(),
    supabase
      .schema("hoops")
      .from("team_members")
      .select(
        "id, role, jersey_number, player_id, roster_name, roster_position, roster_linked_player_id, players!player_id(id, display_name, primary_position)"
      )
      .eq("team_id", teamId)
      .eq("role", "player"),
    // Only surfaces players in a household this coach owns — see
    // add-roster-form's own note on why that's the realistic scope.
    // RLS already scopes this correctly for a non-owner, so fetching it
    // unconditionally and just not rendering it is cheaper than an
    // extra sequential round trip gated on isOwner.
    supabase.schema("hoops").from("players").select("id, display_name"),
    // Feeds the Today card. Both are small per team and independent of
    // everything else here, so they ride along in the same round trip.
    supabase
      .schema("hoops")
      .from("games")
      .select("id, opponent, is_tbd, game_date, game_time, location, team_score, opponent_score, notes")
      .eq("team_id", teamId),
    supabase
      .schema("hoops")
      .from("practice_plans")
      .select("id, title, practice_date, blocks")
      .eq("team_id", teamId)
      .not("practice_date", "is", null),
  ]);

  if (!user) redirect("/login");
  if (!team) notFound();

  const isOwner = team.owner_id === user.id;

  if (memberError) console.error("Failed to load roster:", memberError.message);

  const today = buildCoachToday({
    games: (gameRows ?? []) as TodayGame[],
    plans: ((datedPlanRows ?? []) as { id: string; title: string; practice_date: string | null; blocks: unknown }[]).map(
      (row): TodayPlan => {
        const blocks = (row.blocks ?? []) as PracticeBlock[];
        return {
          id: row.id,
          title: row.title,
          practice_date: row.practice_date,
          drillCount: blocks.filter((b) => !b.isSection).length,
          minutes: totalMinutes(blocks),
        };
      }
    ),
  });

  const roster = sortRoster((memberRows ?? []) as unknown as RosterMember[]);
  const linkedPlayerIds = new Set(
    roster.map((m) => m.player_id).filter((id): id is string => Boolean(id))
  );

  // This season's shooting for every roster player who has a real profile —
  // one extra query, only once we know which ids are linked, so a roster
  // card can show makes/attempts/% and link straight to that player's
  // shooting history instead of just a name.
  const linkedIdList = [...linkedPlayerIds];
  const { data: rosterShotRows } = linkedIdList.length
    ? await supabase
        .schema("hoops")
        .from("shot_sessions")
        .select("player_id, label, started_at, makes, attempts")
        .in("player_id", linkedIdList)
        .not("ended_at", "is", null)
        .is("deleted_at", null)
        .gt("attempts", 0)
        .gte("started_at", seasonStart().toISOString())
        .limit(1000)
    : { data: [] as (SessionRow & { player_id: string })[] };

  const shootingByPlayer = new Map<string, SessionTotals>();
  for (const id of linkedIdList) {
    shootingByPlayer.set(
      id,
      totalSessions((rosterShotRows ?? []).filter((r) => r.player_id === id))
    );
  }

  const weekStartMs = weekStart().getTime();
  const shotThisWeek = new Set(
    (rosterShotRows ?? []).filter((r) => Date.parse(r.started_at) >= weekStartMs).map((r) => r.player_id)
  );
  const snapshotPlayers: SnapshotPlayer[] = roster
    .filter((m): m is RosterMember & { player_id: string } => Boolean(m.player_id))
    .map((m) => ({ id: m.player_id, name: rosterDisplayName(m), shotThisWeek: shotThisWeek.has(m.player_id) }));

  const record = teamRecord((gameRows ?? []) as TodayGame[]);

  const defensiveLabel = schemeLabel(
    DEFENSIVE_SCHEMES,
    team.defensive_scheme,
    team.defensive_scheme_custom
  );
  const offensiveLabel = schemeLabel(
    OFFENSIVE_SCHEMES,
    team.offensive_scheme,
    team.offensive_scheme_custom
  );
  const focusLabels = ((team.focus_areas ?? []) as string[]).map(
    (f) => TEAM_FOCUS_AREAS.find((t) => t.value === f)?.label ?? f
  );

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader back={{ href: "/coach", label: "Coach home" }}>
        <HeaderLink href="/lab">Camera lab</HeaderLink>
        {isOwner && <HeaderLink href={`/teams/${teamId}/edit`}>Edit</HeaderLink>}
      </PageHeader>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-5 px-4 py-5 sm:py-8">
        <div>
          <h1 className="font-display text-3xl uppercase leading-none tracking-tight text-foreground">
            {team.name}
          </h1>
          {(defensiveLabel || offensiveLabel || focusLabels.length > 0) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {defensiveLabel && (
                <span className="rounded-md bg-accent px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-on-accent">
                  {defensiveLabel}
                </span>
              )}
              {offensiveLabel && (
                <span className="rounded-md border border-line-strong px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-foreground-dim">
                  {offensiveLabel}
                </span>
              )}
              {focusLabels.map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent"
                >
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>

        {isOwner && (
          <CoachToday
            teamId={teamId}
            next={today.next}
            then={today.then}
            needsResult={today.needsResult}
          />
        )}

        {isOwner && <TeamSnapshot record={record} players={snapshotPlayers} />}

        <section>
          <h2 className="mb-2.5 font-display text-xl uppercase leading-none tracking-wide text-foreground">
            Roster · {roster.length}
          </h2>

          {memberError ? (
            <EmptyState
              eyebrow="Couldn't load roster"
              title="Something went wrong"
              subtitle="Try refreshing the page."
            />
          ) : roster.length === 0 ? (
            <EmptyState
              eyebrow="No one yet"
              title="Empty roster"
              subtitle="Add players below — most kids won't have a Hardwood Lab account, and that's fine."
            />
          ) : (
            <Card className="divide-y divide-line px-3">
              {roster.map((member) => (
                <RosterRow
                  key={member.id}
                  member={member}
                  teamId={teamId}
                  shooting={member.player_id ? shootingByPlayer.get(member.player_id) ?? null : null}
                />
              ))}
            </Card>
          )}

          {isOwner && (
            <div className="mt-3">
              <AddRosterForm
                teamId={teamId}
                ownPlayers={ownPlayers ?? []}
                alreadyLinkedIds={linkedPlayerIds}
              />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
