"use client";

import { motion } from "framer-motion";
import {
  RATING_CATEGORIES,
  RATING_SCALE_MAX,
  STYLE_TAGS,
  type RatingCategoryValue,
  type StyleTagValue,
} from "@/lib/basketball/assessment";
import { PRIMARY_POSITIONS } from "@/lib/basketball/taxonomy";

/**
 * The visual Player Card — shared between the onboarding reveal moment
 * (which wraps this in its own entrance animation) and the persistent
 * view on the player's hub page, so a player's card doesn't just flash
 * once during onboarding and disappear forever. A Server Component (the
 * hub page) can render this Client Component as a child without issue.
 */
export function PlayerCard({
  playerName,
  archetype,
  primaryPosition,
  styleTags,
  ratings,
  animateBars = false,
}: {
  playerName: string;
  archetype: string;
  primaryPosition: string;
  styleTags: StyleTagValue[];
  ratings: Record<RatingCategoryValue, number>;
  animateBars?: boolean;
}) {
  const positionLabel = PRIMARY_POSITIONS.find((p) => p.value === primaryPosition)?.label ?? "";

  return (
    <div className="court-glow relative w-full overflow-hidden rounded-3xl border-2 border-accent bg-elevated p-6 shadow-2xl sm:p-8">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Player Card</p>
        <span className="rounded-full border border-accent px-3 py-1 text-xs font-bold uppercase text-accent">
          {positionLabel}
        </span>
      </div>

      <h2 className="mt-4 text-2xl font-extrabold leading-tight tracking-tight text-foreground sm:text-3xl">
        {archetype}
      </h2>
      <p className="mt-1 text-sm font-medium text-foreground-dim">{playerName}</p>

      <div className="mt-6 space-y-3">
        {RATING_CATEGORIES.map((cat) => {
          const width = `${(ratings[cat.value] / RATING_SCALE_MAX) * 100}%`;
          return (
            <div key={cat.value}>
              <div className="flex items-center justify-between text-xs font-semibold text-foreground-dim">
                <span>{cat.label}</span>
                <span>
                  {ratings[cat.value]}/{RATING_SCALE_MAX}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface">
                {animateBars ? (
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width }}
                    transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
                    className="h-full rounded-full bg-accent"
                  />
                ) : (
                  <div className="h-full rounded-full bg-accent" style={{ width }} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {styleTags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-foreground-dim"
          >
            {STYLE_TAGS.find((t) => t.value === tag)?.label}
          </span>
        ))}
      </div>
    </div>
  );
}
