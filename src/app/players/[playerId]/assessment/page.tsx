import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AssessmentFlow } from "@/components/assessment-flow";

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
    .select("id, display_name, primary_position")
    .eq("id", playerId)
    .maybeSingle();

  if (!player) notFound();

  return (
    <div className="court-glow flex flex-1 flex-col justify-center px-4 py-10 sm:py-16">
      <AssessmentFlow
        playerId={player.id}
        playerName={player.display_name}
        initialPosition={player.primary_position}
      />
    </div>
  );
}
