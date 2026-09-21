import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AssessmentFlow } from "@/components/assessment-flow";
import type { RatingCategoryValue, StyleTagValue } from "@/lib/basketball/assessment";

export default async function AssessmentPage({
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

  // RLS scopes this to players in the current user's household — see
  // players_household_owner_all in supabase/schema.sql.
  const { data: player } = await supabase
    .schema("hoops")
    .from("players")
    .select("id, display_name, primary_position, player_type")
    .eq("id", playerId)
    .maybeSingle();

  if (!player) notFound();

  // Anyone who already has a computed archetype is retesting, not being
  // onboarded — their previous answers seed the form so they adjust what
  // changed rather than starting from a blank slate.
  const playerType = (player.player_type ?? {}) as {
    archetype?: string;
    ratings?: Record<RatingCategoryValue, number>;
    style_tags?: StyleTagValue[];
    goal?: string;
  };
  const isRetest = Boolean(playerType.archetype);

  return (
    <div className="court-glow flex flex-1 flex-col justify-center px-4 py-10 sm:py-16">
      <AssessmentFlow
        playerId={player.id}
        playerName={player.display_name}
        initialPosition={player.primary_position}
        isRetest={isRetest}
        previousRatings={playerType.ratings ?? null}
        previousStyleTags={playerType.style_tags ?? null}
        previousGoal={playerType.goal ?? null}
      />
    </div>
  );
}
