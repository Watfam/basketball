import Link from "next/link";
import { computeWorkoutDifficulty } from "@/lib/basketball/workout-matching";
import { type Workout } from "@/components/workout-card";

const DIFFICULTY_PIPS: Record<string, number> = { beginner: 1, intermediate: 2, advanced: 3 };

const SKILL_LABELS: Record<string, string> = {
  ball_handling: "Ball Handling",
  shooting: "Shooting",
  defense: "Defense",
  athleticism: "Athleticism",
};

/**
 * The rest of the queue as a horizontal rail. A rail rather than a vertical
 * list on purpose: it shows there's a library behind the one recommendation
 * without letting the hub turn into an endless scroll of equal-weight cards.
 */
export function WorkoutRail({
  workouts,
  playerId,
  reasons,
}: {
  workouts: Workout[];
  playerId: string;
  reasons: Record<string, string>;
}) {
  return (
    <div className="rail -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
      {workouts.map((workout) => {
        const drills = [...workout.workout_drills].sort((a, b) => a.sort_order - b.sort_order);
        const difficulty = computeWorkoutDifficulty(drills.map((wd) => wd.drills?.difficulty));
        const pips = difficulty ? DIFFICULTY_PIPS[difficulty] : 0;
        const focus = workout.focus_areas?.[0];

        return (
          <Link
            key={workout.id}
            href={`/players/${playerId}/workouts`}
            className="group w-[63%] shrink-0 snap-start rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-[var(--line-strong)] sm:w-[46%]"
          >
            <div className="flex items-center justify-between">
              {focus && (
                <span className="truncate text-[9px] font-extrabold uppercase tracking-[0.14em] text-accent">
                  {SKILL_LABELS[focus] ?? focus}
                </span>
              )}
              <div className="flex shrink-0 gap-0.5">
                {[1, 2, 3].map((n) => (
                  <span
                    key={n}
                    className="h-1 w-2.5 rounded-full"
                    style={{ background: n <= pips ? "var(--accent)" : "var(--data-dim)" }}
                  />
                ))}
              </div>
            </div>

            <p className="font-display mt-2 line-clamp-2 text-lg uppercase leading-[1.05] tracking-tight text-foreground">
              {workout.name}
            </p>

            <p className="mt-1.5 line-clamp-1 text-[11px] text-foreground-mute">
              {reasons[workout.id]}
            </p>

            <div className="mt-3 flex items-center gap-3 border-t border-line pt-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-foreground-dim">
                {workout.estimated_minutes ?? "—"} min
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-foreground-mute">
                {drills.length} {drills.length === 1 ? "drill" : "drills"}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
