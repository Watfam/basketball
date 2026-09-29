import { TeamBottomNav } from "@/components/team-bottom-nav";

/**
 * Wraps every team screen in the persistent bottom bar. Lives at the
 * [teamId] segment so /teams/new (creating a team, which has no team to
 * navigate yet) never gets one.
 *
 * The bar hides itself on Run Practice — see TeamBottomNav.
 */
export default async function TeamLayout({
  children,
  params,
}: LayoutProps<"/teams/[teamId]">) {
  const { teamId } = await params;

  return (
    <div className="flex min-h-[100dvh] flex-1 flex-col">
      {children}
      <TeamBottomNav teamId={teamId} />
    </div>
  );
}
