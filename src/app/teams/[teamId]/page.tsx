import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RosterRow } from "@/components/roster-row";
import { AddRosterForm } from "@/components/add-roster-form";
import { EmptyState } from "@/components/empty-state";
import { DEFENSIVE_SCHEMES, OFFENSIVE_SCHEMES, TEAM_FOCUS_AREAS } from "@/lib/basketball/taxonomy";
import { sortRoster, type RosterMember } from "@/lib/basketball/team";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: team } = await supabase
    .schema("hoops")
    .from("teams")
    .select(
      "id, owner_id, name, defensive_scheme, defensive_scheme_custom, offensive_scheme, offensive_scheme_custom, focus_areas"
    )
    .eq("id", teamId)
    .maybeSingle();

  if (!team) notFound();

  const isOwner = team.owner_id === user.id;

  const { data: memberRows, error: memberError } = await supabase
    .schema("hoops")
    .from("team_members")
    .select(
      "id, role, jersey_number, player_id, roster_name, roster_position, roster_linked_player_id, players!player_id(id, display_name, primary_position)"
    )
    .eq("team_id", teamId)
    .eq("role", "player");

  if (memberError) console.error("Failed to load roster:", memberError.message);

  const roster = sortRoster((memberRows ?? []) as unknown as RosterMember[]);
  const linkedPlayerIds = new Set(
    roster.map((m) => m.player_id).filter((id): id is string => Boolean(id))
  );

  // Only surfaces players in a household this coach owns — see
  // add-roster-form's own note on why that's the realistic scope.
  const { data: ownPlayers } = isOwner
    ? await supabase.schema("hoops").from("players").select("id, display_name")
    : { data: [] as { id: string; display_name: string }[] };

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
      <header className="sticky top-0 z-10 border-b border-line bg-background/85 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between">
          <Link
            href="/"
            className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim transition-colors hover:text-foreground"
          >
            ← Home
          </Link>
          {isOwner && (
            <Link
              href={`/teams/${teamId}/edit`}
              className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim transition-colors hover:text-foreground"
            >
              Edit
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-5 px-4 py-5 sm:py-8">
        <section className="theme-dark hero-sheen panel-lit relative overflow-hidden rounded-3xl border border-line p-5 shadow-[var(--shadow-panel)]">
          <div className="court-lines absolute inset-0 opacity-60" aria-hidden />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-1.5">
              {defensiveLabel && (
                <span className="rounded-md bg-accent px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white">
                  {defensiveLabel}
                </span>
              )}
              {offensiveLabel && (
                <span className="rounded-md border border-line-strong px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-foreground-dim">
                  {offensiveLabel}
                </span>
              )}
            </div>

            <h1 className="font-display mt-3 text-4xl uppercase leading-[0.92] tracking-tight text-foreground">
              {team.name}
            </h1>

            {focusLabels.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {focusLabels.map((label) => (
                  <span
                    key={label}
                    className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent"
                  >
                    {label}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-4 border-t border-line pt-3">
              <span className="font-display text-2xl leading-none text-foreground">
                {roster.length}
              </span>
              <span className="ml-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim">
                on the roster
              </span>
            </div>
          </div>
        </section>

        {isOwner && (
          <section className="grid grid-cols-2 gap-2.5">
            <Link
              href={`/teams/${teamId}/practice`}
              className="rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-[var(--line-strong)]"
            >
              <p className="font-display text-xl uppercase leading-none tracking-tight text-foreground">
                Practice
              </p>
              <p className="mt-1 text-[11px] text-foreground-dim">Plan the next one</p>
            </Link>
            <Link
              href={`/teams/${teamId}/scouting`}
              className="rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-[var(--line-strong)]"
            >
              <p className="font-display text-xl uppercase leading-none tracking-tight text-foreground">
                Scouting
              </p>
              <p className="mt-1 text-[11px] text-foreground-dim">Notes on opponents</p>
            </Link>
          </section>
        )}

        <section>
          <h2 className="mb-2.5 font-display text-xl uppercase leading-none tracking-wide text-foreground">
            Roster
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
            <div className="divide-y divide-line rounded-2xl border border-line bg-surface px-3">
              {roster.map((member) => (
                <RosterRow key={member.id} member={member} teamId={teamId} />
              ))}
            </div>
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
