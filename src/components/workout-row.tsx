import { WorkoutCard, type Workout } from "@/components/workout-card";
import { LEVEL_OPTIONS, WORKOUT_SKILLS, workoutLevel } from "@/lib/basketball/train-library";

const PIPS: Record<string, number> = { beginner: 1, intermediate: 2, advanced: 3 };

/** One workout as a line in the library: its name, skills, length and level. Opens in place to the full workout and its Start button. */
export function WorkoutRow({ workout, playerId, minutes, lastDone }: { workout: Workout; playerId: string; minutes: number | null; lastDone: string | null }) {
  const level = workoutLevel(workout);
  const pips = level ? PIPS[level] : 0;
  const skills = (workout.focus_areas ?? []).map((a) => WORKOUT_SKILLS.find((s) => s.value === a)?.label ?? a).join(", ");
  return (
    <details className="group overflow-hidden rounded-2xl border border-line bg-surface">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold text-foreground">{workout.name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-foreground-dim">
            {skills && <span>{skills}</span>}
            {minutes !== null && <span>{minutes} min</span>}
            {level && (
              <span className="inline-flex items-center gap-1">
                <span aria-hidden className="inline-flex gap-0.5">{[1, 2, 3].map((n) => <span key={n} className="h-1 w-2.5 rounded-full" style={{ background: n <= pips ? "var(--accent)" : "var(--data-dim)" }} />)}</span>
                {LEVEL_OPTIONS.find((l) => l.value === level)?.label}
              </span>
            )}
          </p>
        </div>
        {lastDone && <span className="shrink-0 rounded-full bg-raised px-2.5 py-1 text-[11px] font-bold text-foreground-dim">{lastDone}</span>}
        <span aria-hidden className="shrink-0 text-lg text-foreground-mute transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="border-t border-line p-2"><WorkoutCard workout={workout} playerId={playerId} /></div>
    </details>
  );
}
