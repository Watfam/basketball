"use client";

import { useState } from "react";
import { haptic } from "@/lib/haptics";

/**
 * The Film Room had grown into one very long scroll — study sessions,
 * a recommendation, pro film grouped by player, three more groups by
 * lesson type, then the trainers. Everything was reachable and nothing
 * was findable.
 *
 * Three tabs instead, because they answer three different questions:
 * "what should I do now" (Sessions), "show me everything" (Library),
 * "who should I follow" (Trainers).
 */
export function FilmRoomTabs({
  sessions,
  library,
  trainers,
  initialTab = "sessions",
}: {
  sessions: React.ReactNode;
  library: React.ReactNode;
  trainers: React.ReactNode;
  initialTab?: "sessions" | "library" | "trainers";
}) {
  const [tab, setTab] = useState<"sessions" | "library" | "trainers">(initialTab);

  const TABS = [
    { value: "sessions" as const, label: "Sessions" },
    { value: "library" as const, label: "Library" },
    { value: "trainers" as const, label: "Trainers" },
  ];

  return (
    <div>
      <div className="flex gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => {
              haptic("tap");
              setTab(t.value);
            }}
            className={`flex-1 rounded-lg border px-2 py-2.5 text-[11px] font-extrabold uppercase tracking-wide transition-colors ${
              tab === t.value
                ? "border-accent bg-accent text-white"
                : "border-line bg-surface text-foreground-dim hover:border-accent/50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {/* Kept mounted rather than swapped, so switching tabs doesn't
            throw away an open lesson sheet or a half-typed takeaway. */}
        <div hidden={tab !== "sessions"}>{sessions}</div>
        <div hidden={tab !== "library"}>{library}</div>
        <div hidden={tab !== "trainers"}>{trainers}</div>
      </div>
    </div>
  );
}
