"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TEAM_TABS, activeTeamTab, isImmersiveTeamRoute } from "@/lib/basketball/team-nav";
import { haptic } from "@/lib/haptics";

function TabIcon({ tab, className }: { tab: string; className?: string }) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (tab) {
    case "roster":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
          <path d="M16 5.5a3 3 0 0 1 0 5M18 14.5c2 .7 3 2.6 3 5.5" />
        </svg>
      );
    case "practice":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="15" rx="3" />
          <path d="M8 3v4M16 3v4M4 10h16" />
        </svg>
      );
    case "games":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 3.5v17M3.5 12h17M5.5 6.2c3 2.2 10 2.2 13 0M5.5 17.8c3-2.2 10-2.2 13 0" />
        </svg>
      );
    case "history":
      return (
        <svg {...common}>
          <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6" />
          <path d="m20 20-4-4" />
        </svg>
      );
  }
}

/**
 * The team area's persistent bottom bar. Every destination a coach opens
 * a team for is one tap from anywhere, replacing the two-tap trip back
 * through the hub's tile grid.
 *
 * Hides itself on Run Practice — that screen is meant to be read across
 * a gym, and a nav bar there is both visual noise and one mis-tap away
 * from dumping the coach out mid-practice.
 */
export function TeamBottomNav({ teamId }: { teamId: string }) {
  const pathname = usePathname();
  if (isImmersiveTeamRoute(pathname)) return null;

  const active = activeTeamTab(pathname, teamId);

  return (
    <nav
      aria-label="Team"
      className="sticky bottom-0 z-20 border-t border-line bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="mx-auto flex w-full max-w-lg px-1.5 py-1.5">
        {TEAM_TABS.map((tab) => {
          const isActive = active === tab.key;
          return (
            <Link
              key={tab.key}
              href={tab.href(teamId)}
              onClick={() => haptic("tap")}
              aria-current={isActive ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-[9px] font-extrabold uppercase tracking-[0.08em] transition-colors ${
                isActive
                  ? "bg-accent/10 text-accent"
                  : "text-foreground-mute hover:text-foreground-dim"
              }`}
            >
              <TabIcon tab={tab.key} className="h-5 w-5" />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
