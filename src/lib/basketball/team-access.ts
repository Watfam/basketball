import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Can this login change the team's games, notes and plans: the owner, or a
 * coach or assistant on its roster. Everyone else who can see the team
 * gets read-only pages instead of forms whose save would be refused.
 */
export async function canCoachTeam(supabase: Supabase, teamId: string, userId: string): Promise<boolean> {
  const hoops = supabase.schema("hoops");
  const [{ data: team }, { data: member }] = await Promise.all([
    hoops.from("teams").select("owner_id").eq("id", teamId).maybeSingle(),
    hoops
      .from("team_members")
      .select("id")
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .in("role", ["coach", "assistant_coach"])
      .limit(1)
      .maybeSingle(),
  ]);
  return team?.owner_id === userId || Boolean(member);
}
