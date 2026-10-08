import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { SetupFamilyForm } from "@/components/setup-family-form";
import { AddPlayerForm } from "@/components/add-player-form";
import { HouseholdSettings } from "@/components/household-settings";
import { ManagePlayerRow } from "@/components/manage-player-row";
import { Avatar } from "@/components/avatar";
import { EndCoachView } from "@/components/remember-profile";
import { SignOutButton } from "@/components/sign-out-button";
import { ButtonLink } from "@/components/ui/button";
import { CardLink, cardClass } from "@/components/ui/card";
import { computeOverall, type Ratings } from "@/lib/basketball/rating";
import { formatPercentage, seasonStart, totalSessions } from "@/lib/basketball/shooting";
import { PROFILE_COOKIE, parseProfile, profileHome } from "@/lib/profile";

/**
 * The front door: who is using the app on this phone. One tap on a
 * profile, remembered after that, and nothing later asks again
 * (src/lib/profile.ts). Adding and removing players and the family's
 * settings sit below, folded away, so the picker stays a picker.
 */
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Independent of each other: both just need user.id.
  const [{ data: household }, { data: teams }] = await Promise.all([
    // A user owns at most one household in this model (see supabase/schema.sql).
    supabase.schema("hoops").from("households").select("id, name").eq("owner_id", user.id).maybeSingle(),
    // A coach who hasn't set up a family still gets to their teams.
    supabase
      .schema("hoops")
      .from("teams")
      .select("id, name")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true }),
  ]);

  const { data: players } = household
    ? await supabase
        .schema("hoops")
        .from("players")
        .select("id, display_name, player_type")
        .eq("household_id", household.id)
        .order("created_at", { ascending: true })
    : { data: null };

  // Each player's season shooting, from session totals: one small query
  // for the whole family.
  const playerIds = (players ?? []).map((p) => p.id);
  const { data: shotRows } = playerIds.length
    ? await supabase
        .schema("hoops")
        .from("shot_sessions")
        .select("player_id, label, started_at, makes, attempts")
        .in("player_id", playerIds)
        .not("ended_at", "is", null)
        .is("deleted_at", null)
        .gte("started_at", seasonStart().toISOString())
        .limit(1000)
    : { data: [] as { player_id: string; label: string | null; started_at: string; makes: number; attempts: number }[] };

  // The profile last used on this phone, if it still exists, offered as
  // one big "Continue as" so a normal day is a single tap.
  const remembered = parseProfile((await cookies()).get(PROFILE_COOKIE)?.value);
  const rememberedName =
    remembered?.kind === "player"
      ? (players ?? []).find((p) => p.id === remembered.playerId)?.display_name
      : remembered?.kind === "coach"
        ? "Coach"
        : undefined;

  const teamCount = (teams ?? []).length;

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-background/85 px-5 py-3 backdrop-blur">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent">Hardwood Lab</p>
          {household && (
            <p className="mt-0.5 truncate text-[11px] font-bold uppercase tracking-wider text-foreground-mute">
              {household.name}
            </p>
          )}
        </div>
        <SignOutButton />
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-6 px-4 py-5 sm:py-8">
        <EndCoachView />
        {!household && <SetupFamilyForm />}

        <div>
          <h1 className="font-display text-3xl uppercase leading-none tracking-wide text-foreground">
            Who&rsquo;s playing?
          </h1>
          <p className="mt-1.5 text-xs text-foreground-dim">
            Pick once. This phone remembers it, and Shoot, stats and everything else follow.
          </p>
        </div>

        {remembered && rememberedName && (
          <ButtonLink href={profileHome(remembered)} size="lg" block>
            Continue as {rememberedName}
          </ButtonLink>
        )}

        <div className="space-y-2.5">
          {(players ?? []).map((player) => {
            const type = (player.player_type ?? {}) as { archetype?: string; ratings?: Ratings };
            const assessed = Boolean(type.archetype);
            const overall = type.ratings ? computeOverall(type.ratings) : null;
            const season = totalSessions((shotRows ?? []).filter((r) => r.player_id === player.id));
            const isRemembered = remembered?.kind === "player" && remembered.playerId === player.id;
            const line = [
              overall !== null ? `Overall ${overall}` : assessed ? null : "Assessment not started",
              season.attempts > 0 ? `Shooting ${formatPercentage(season.pct)} this season` : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <CardLink
                key={player.id}
                // Not assessed yet: the assessment is the only useful first stop.
                href={assessed ? `/players/${player.id}` : `/players/${player.id}/assessment`}
                // Important so the remembered profile's accent border beats the card's hairline.
                className={`flex items-center gap-3.5 px-4 py-3.5 ${isRemembered ? "border-accent!" : ""}`}
              >
                <Avatar id={player.id} name={player.display_name} />
                <div className="min-w-0 flex-1">
                  <p className="font-display truncate text-xl uppercase leading-none tracking-tight text-foreground">
                    {player.display_name}
                  </p>
                  <p className="mt-1 truncate text-xs font-semibold text-foreground-dim">{line || "Ready to start"}</p>
                </div>
                <span className="shrink-0 text-lg text-foreground-mute" aria-hidden>
                  ›
                </span>
              </CardLink>
            );
          })}

          <CardLink
            href="/coach"
            className={`flex items-center gap-3.5 px-4 py-3.5 ${remembered?.kind === "coach" ? "border-accent!" : ""}`}
          >
            <span
              aria-hidden
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-extrabold uppercase tracking-wide text-background"
            >
              Coach
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display truncate text-xl uppercase leading-none tracking-tight text-foreground">
                Coach
              </p>
              <p className="mt-1 truncate text-xs font-semibold text-foreground-dim">
                {teamCount > 0
                  ? `${teamCount === 1 ? (teams ?? [])[0].name : `${teamCount} teams`} · players, practice, camera lab`
                  : "Players, camera lab, and teams when you make one"}
              </p>
            </div>
            <span className="shrink-0 text-lg text-foreground-mute" aria-hidden>
              ›
            </span>
          </CardLink>
        </div>

        {household && (
          <details className={`group ${cardClass}`}>
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim">
              Manage family
              <span className="text-base transition-transform group-open:rotate-90" aria-hidden>
                ›
              </span>
            </summary>
            <div className="space-y-4 border-t border-line pb-4">
              {(players ?? []).length > 0 && (
                <div className="divide-y divide-line">
                  {(players ?? []).map((p) => (
                    <ManagePlayerRow key={p.id} id={p.id} name={p.display_name} />
                  ))}
                </div>
              )}
              <div className="space-y-4 px-4">
                <AddPlayerForm householdId={household.id} />
                <HouseholdSettings householdId={household.id} householdName={household.name} />
              </div>
            </div>
          </details>
        )}
      </main>
    </div>
  );
}
