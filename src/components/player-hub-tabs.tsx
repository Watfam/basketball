"use client";

import { useState } from "react";
import { haptic } from "@/lib/haptics";

/**
 * The hub had grown to roughly ten stacked sections in one scroll —
 * next session, program, workouts, ratings, charts, film, milestones,
 * level, history. All of it reachable, none of it scannable, and the
 * thing you open the app for (what am I doing today) buried under the
 * things you check monthly.
 *
 * Four tabs, by how often you'd want each: Today is the only one you
 * need on a training day, Progress is the weekly check-in, Film is its
 * own trip, Profile is monthly.
 *
 * The hero stays outside these — it's identity, not a destination.
 */
const TABS = [
  { value: "today" as const, label: "Today" },
  { value: "progress" as const, label: "Progress" },
  { value: "film" as const, label: "Film" },
  { value: "profile" as const, label: "Me" },
];

type TabValue = (typeof TABS)[number]["value"];

export function PlayerHubTabs({
  initialTab = "today",
  today,
  progress,
  film,
  profile,
}: {
  /** Which tab opens first; the bottom bar's Me opens "profile". */
  initialTab?: TabValue;
  today: React.ReactNode;
  progress: React.ReactNode;
  film: React.ReactNode;
  profile: React.ReactNode;
}) {
  const [tab, setTab] = useState<TabValue>(initialTab);
  // The bottom bar's Home and Me both land on this page: follow it when
  // it changes the tab without a fresh mount.
  const [shownFor, setShownFor] = useState(initialTab);
  if (shownFor !== initialTab) {
    setShownFor(initialTab);
    setTab(initialTab);
  }

  return (
    <div>
      <div role="tablist" aria-label="Player" className="flex border-b border-line">
        {TABS.map((t) => {
          const isActive = tab === t.value;
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                haptic("tap");
                setTab(t.value);
              }}
              className={`-mb-px flex-1 border-b-2 px-2 py-2.5 text-[10.5px] font-extrabold uppercase tracking-[0.08em] transition-colors ${
                isActive
                  ? "border-accent text-foreground"
                  : "border-transparent text-foreground-mute hover:text-foreground-dim"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Kept mounted rather than swapped — same reasoning as the Film
          Room tabs: switching away shouldn't discard a picker mid-change. */}
      <div className="mt-4">
        <div hidden={tab !== "today"}>{today}</div>
        <div hidden={tab !== "progress"}>{progress}</div>
        <div hidden={tab !== "film"}>{film}</div>
        <div hidden={tab !== "profile"}>{profile}</div>
      </div>
    </div>
  );
}
