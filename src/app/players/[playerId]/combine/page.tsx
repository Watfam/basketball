import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CombineFlow } from "@/components/combine-flow";
import { BenchmarkSetup } from "@/components/benchmark-setup";
import { EmptyState } from "@/components/empty-state";
import { benchmarkBand, type CombineDrill } from "@/lib/basketball/combine";
import type { Ratings } from "@/lib/basketball/rating";

const EMPTY_RATINGS: Ratings = { ball_handling: 0, shooting: 0, defense: 0, athleticism: 0 };

export default async function CombinePage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: player } = await supabase
    .schema("hoops")
    .from("players")
    .select("id, display_name, birth_year, gender, player_type")
    .eq("id", playerId)
    .maybeSingle();

  if (!player) notFound();

  const playerType = (player.player_type ?? {}) as { ratings?: Ratings };

  const { data: drillRows, error: drillError } = await supabase
    .schema("hoops")
    .from("assessment_drills")
    .select(
      "id, key, name, category, setup, cues, equipment, metric, attempts, lower_is_better, benchmarks, sort_order"
    )
    .order("sort_order", { ascending: true });

  if (drillError) console.error("[combine] fetch failed:", drillError);

  const drills = (drillRows ?? []) as unknown as CombineDrill[];
  const band = benchmarkBand(player.birth_year, player.gender);
  // Only truly calibrated when both inputs were known — otherwise the
  // player is being measured against the middle band and deserves to be
  // told, not left to assume.
  const bandKnown = Boolean(player.birth_year) && Boolean(player.gender);

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-background/85 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between">
          <Link
            href={`/players/${playerId}`}
            className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim transition-colors hover:text-foreground"
          >
            ← {player.display_name}
          </Link>
          <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">
            Combine
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-5 sm:py-8">
        {drills.length === 0 ? (
          <EmptyState
            eyebrow="No tests loaded"
            title="The combine hasn't been seeded"
            subtitle="Run supabase/seed_0011_combine_drills.sql to load the tests."
          />
        ) : (
          <>
            {!bandKnown && (
              <BenchmarkSetup
                playerId={playerId}
                currentBirthYear={player.birth_year}
                currentGender={player.gender}
              />
            )}
            <CombineFlow
            playerId={playerId}
            playerName={player.display_name}
            drills={drills}
            currentRatings={playerType.ratings ?? EMPTY_RATINGS}
              band={band}
              bandKnown={bandKnown}
            />
          </>
        )}
      </main>
    </div>
  );
}
