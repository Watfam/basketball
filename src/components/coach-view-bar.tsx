"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { coachIsViewing } from "@/components/remember-profile";

const noSubscribe = () => () => {};

/**
 * Across the top of a player's pages when the coach opened them from the
 * coach home: a way straight back. The player's own tabs lead deeper into
 * the player's app, so without this the only way out was the front door.
 */
export function CoachViewBar() {
  const viewing = useSyncExternalStore(noSubscribe, coachIsViewing, () => false);
  if (!viewing) return null;
  return (
    <div className="theme-dark border-b border-line bg-background px-5 py-2 text-foreground">
      <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-3">
        <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim">Coach view</span>
        <Link
          href="/coach"
          className="-my-2 inline-flex items-center py-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-accent hover:text-accent-hover"
        >
          ← Back to coach
        </Link>
      </div>
    </div>
  );
}
