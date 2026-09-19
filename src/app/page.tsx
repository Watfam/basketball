import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SetupFamilyForm } from "@/components/setup-family-form";
import { AddPlayerForm } from "@/components/add-player-form";
import { PlayerRow } from "@/components/player-row";
import { HouseholdSettings } from "@/components/household-settings";
import { EmptyState } from "@/components/empty-state";
import { SignOutButton } from "@/components/sign-out-button";
import { PRIMARY_POSITIONS } from "@/lib/basketball/taxonomy";

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

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-line px-6 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
            Hardwood Lab
          </p>
          {household && <p className="mt-0.5 text-sm text-foreground-dim">{household.name}</p>}
        </div>
        <SignOutButton />
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8 sm:py-12">
        {!household ? (
          <SetupFamilyForm />
        ) : (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">Players</h1>
              <p className="mt-1 text-sm text-foreground-dim">
                Every player&rsquo;s Player Card, workouts, and progress live here.
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
                const playerType = (player.player_type ?? {}) as { archetype?: string };
                const hasAssessment = Boolean(playerType.archetype);
                const subtitle = hasAssessment
                  ? (playerType.archetype as string)
                  : [positionLabel(player.primary_position), player.birth_year]
                      .filter(Boolean)
                      .join(" · ") || "Assessment not started";

                return (
                  <PlayerRow
                    key={player.id}
                    id={player.id}
                    displayName={player.display_name}
                    subtitle={subtitle}
                    hasAssessment={hasAssessment}
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
