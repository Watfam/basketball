"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { PLAYER_TABS, activePlayerTab, isImmersivePlayerRoute } from "@/lib/basketball/player-nav";
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
    case "home":
      return (
        <svg {...common}>
          <path d="M4 11.5 12 5l8 6.5V20h-5v-5h-6v5H4z" />
        </svg>
      );
    case "train":
      return (
        <svg {...common}>
          <path d="M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12" />
        </svg>
      );
    case "shoot":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 3.5v17M3.5 12h17M5.5 6.2c3 2.2 10 2.2 13 0M5.5 17.8c3-2.2 10-2.2 13 0" />
        </svg>
      );
    case "me":
      return (
        <svg {...common}>
          <circle cx="12" cy="8.5" r="3.5" />
          <path d="M5 20c1.2-3.6 3.8-5.5 7-5.5s5.8 1.9 7 5.5" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="3.5" y="6" width="17" height="12" rx="2.5" />
          <path d="m10.5 9.5 4 2.5-4 2.5z" />
        </svg>
      );
  }
}

/** The player area's persistent bottom bar; same shape as TeamBottomNav. */
export function PlayerBottomNav({ playerId }: { playerId: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  if (isImmersivePlayerRoute(pathname)) return null;

  const active = activePlayerTab(pathname, playerId, search.toString());

  return (
    <nav
      aria-label="Player"
      className="sticky bottom-0 z-20 border-t border-line bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="mx-auto flex w-full max-w-lg px-1.5 py-1.5">
        {PLAYER_TABS.map((tab) => {
          const isActive = active === tab.key;
          return (
            <Link
              key={tab.key}
              href={tab.href(playerId)}
              onClick={() => haptic("tap")}
              aria-current={isActive ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-[9px] font-extrabold uppercase tracking-[0.08em] transition-colors ${
                isActive ? "bg-accent/10 text-accent" : "text-foreground-mute hover:text-foreground-dim"
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
