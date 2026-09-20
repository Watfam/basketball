"use client";

import { useRef, useState } from "react";
import { WorkoutCard, type Workout } from "@/components/workout-card";

/**
 * Swipe between "Up Next" workout options on the player hub. Uses native
 * CSS scroll-snap for the actual swipe gesture rather than a JS animation
 * library — framer-motion's exit-animation tracking (both mode="wait" and
 * mode="popLayout") proved unreliable in this stack (see session-player.tsx),
 * getting visibly stuck under fast interaction. Scroll-snap is just the
 * browser's native touch scrolling, so there's no animation state to get
 * stuck in; the only JS here drives the decorative dot indicator, and if
 * that ever misfires the worst case is a wrong dot, never a frozen screen.
 */
export function WorkoutCarousel({ workouts, playerId }: { workouts: Workout[]; playerId: string }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  function handleScroll() {
    const el = scrollerRef.current;
    if (!el || el.clientWidth === 0) return;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  }

  return (
    <div>
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {workouts.map((workout) => (
          <div key={workout.id} className="w-full shrink-0 snap-center">
            <WorkoutCard workout={workout} playerId={playerId} />
          </div>
        ))}
      </div>

      {workouts.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
          {workouts.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === active ? "w-4 bg-accent" : "w-1.5 bg-line"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
