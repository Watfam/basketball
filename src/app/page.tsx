import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SetupFamilyForm } from "@/components/setup-family-form";
import { AddPlayerForm } from "@/components/add-player-form";
import { PlayerRow } from "@/components/player-row";
import { HouseholdSettings } from "@/components/household-settings";
import { EmptyState } from "@/components/empty-state";
import { SignOutButton } from "@/components/sign-out-button";
import { PRIMARY_POSITIONS } from "@/lib/basketball/taxonomy";
import { computeOverall, type Ratings } from "@/lib/basketball/rating";
import { computeStreakWeeks } from "@/lib/basketball/progress";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // A user owns at most one household in this model (see supabase/schema.sql).
  const { data: household } = await supabase
    .schema("hoops")
    .from("households")
    .select("id, name")
    .eq("owner_id", user.id)
    .maybeSingle();

  const { data: players } = household
    ? await supabase
        .schema("hoops")
        .from("players")
        .select("id, display_name, birth_year, primary_position, player_type")
        .eq("household_id", household.id)
        .order("created_at", { ascending: true })
    : { data: null };

  const positionLabel = (value: string | null) =>
    PRIMARY_POSITIONS.find((p) => p.value === value)?.label ?? null;

  // Everything the rows need, fetched across all players at once rather
  // than per row — a household is small, but one query per player per
  // stat would be four round trips per kid.
  const playerIds = (players ?? []).map((p) => p.id);

  const { data: sessionRows } = playerIds.length
    ? await supabase
        .schema("hoops")
        .from("workout_sessions")
        .select("id, player_id, completed_at")
        .in("player_id", playerIds)
        .eq("status", "completed")
    : { data: [] as { id: string; player_id: string; completed_at: string | null }[] };

  // Same rule as the hub: a session only counts once work was logged
  // against it, so an opened-and-abandoned workout never inflates a
  // streak or a session count.
  const sessionIds = (sessionRows ?? []).map((s) => s.id);
  const { data: logRows } = sessionIds.length
    ? await supabase
        .schema("hoops")
        .from("session_logs")
        .select("session_id")
        .in("session_id", sessionIds)
    : { data: [] as { session_id: string }[] };

  const sessionsWithWork = new Set((logRows ?? []).map((l) => l.session_id));
  const datesByPlayer = new Map<string, Date[]>();
  (sessionRows ?? []).forEach((s) => {
    if (!sessionsWithWork.has(s.id) || !s.completed_at) return;
    const list = datesByPlayer.get(s.player_id) ?? [];
    list.push(new Date(s.completed_at));
    datesByPlayer.set(s.player_id, list);
  });

  const { data: enrollments } = playerIds.length
    ? await supabase
        .schema("hoops")
        .from("player_programs")
        .select("player_id, programs(name)")
        .in("player_id", playerIds)
        .eq("status", "active")
    : { data: [] as { player_id: string; programs: unknown }[] };

  const programByPlayer = new Map<string, string>();
  (enrollments ?? []).forEach((e) => {
    const name = (e.programs as unknown as { name: string } | null)?.name;
    if (name) programByPlayer.set(e.player_id, name);
  });

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-background/85 px-5 py-3 backdrop-blur">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent">
            Hardwood Lab
          </p>
          {household && (
            <p className="mt-0.5 truncate text-[11px] font-bold uppercase tracking-wider text-foreground-mute">
              {household.name}
            </p>
          )}
        </div>
        <SignOutButton />
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-5 sm:py-8">
        {!household ? (
          <SetupFamilyForm />
        ) : (
          <div className="space-y-6">
            <div>
              <h1 className="font-display text-3xl uppercase leading-none tracking-wide text-foreground">
                Players
              </h1>
              <p className="mt-1.5 text-xs text-foreground-dim">
                Tap a player for their card, program, and progress.
              </p>
            </div>

            <div className="space-y-3">
              {players?.length === 0 && (
                <EmptyState
                  eyebrow="No players yet"
                  title="Add your first player"
                  subtitle="Build their Player Card and start curating workouts and film for them."
                />
              )}

              {players?.map((player) => {
                const playerType = (player.player_type ?? {}) as {
                  archetype?: string;
                  ratings?: Ratings;
                };
                const hasAssessment = Boolean(playerType.archetype);
                const subtitle = hasAssessment
                  ? (playerType.archetype as string)
                  : [positionLabel(player.primary_position), player.birth_year]
                      .filter(Boolean)
                      .join(" · ") || "Assessment not started";

                const dates = datesByPlayer.get(player.id) ?? [];

                return (
                  <PlayerRow
                    key={player.id}
                    id={player.id}
                    displayName={player.display_name}
                    subtitle={subtitle}
                    hasAssessment={hasAssessment}
                    positionLabel={positionLabel(player.primary_position)}
                    overall={playerType.ratings ? computeOverall(playerType.ratings) : null}
                    streakWeeks={computeStreakWeeks(dates)}
                    totalSessions={dates.length}
                    programLabel={programByPlayer.get(player.id) ?? null}
                  />
                );
              })}

              <AddPlayerForm householdId={household.id} />
            </div>

            <HouseholdSettings householdId={household.id} householdName={household.name} />
          </div>
        )}
      </main>
    </div>
  );
}
