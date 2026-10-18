import { PlayerBottomNav } from "@/components/player-bottom-nav";
import { RememberProfile } from "@/components/remember-profile";
import { CoachViewBar } from "@/components/coach-view-bar";

/**
 * Every player screen: the bottom bar, and opening any of them makes this
 * player the active profile on the phone (see src/lib/profile.ts).
 */
export default async function PlayerLayout({ children, params }: LayoutProps<"/players/[playerId]">) {
  const { playerId } = await params;

  return (
    <div className="flex min-h-[100dvh] flex-1 flex-col">
      <RememberProfile profile={{ kind: "player", playerId }} />
      <CoachViewBar />
      {children}
      <PlayerBottomNav playerId={playerId} />
    </div>
  );
}
