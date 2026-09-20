import { StartSessionButton } from "@/components/start-session-button";
import { computeWorkoutDifficulty } from "@/lib/basketball/workout-matching";
import { type Workout } from "@/components/workout-card";

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

// Three pips rather than a word alone — difficulty is a scale, and a scale
// should look like one at a glance.
const DIFFICULTY_PIPS: Record<string, number> = { beginner: 1, intermediate: 2, advanced: 3 };

const SKILL_LABELS: Record<string, string> = {
  ball_handling: "Ball Handling",
  shooting: "Shooting",
  defense: "Defense",
  athleticism: "Athleticism",
};

export function FeaturedWorkout({
  workout,
  playerId,
  reason,
  lastCompleted,
}: {
  workout: Workout;
  playerId: string;
  reason: string;
  lastCompleted: string | null;
}) {
  const drills = [...workout.workout_drills].sort((a, b) => a.sort_order - b.sort_order);
  const difficulty = computeWorkoutDifficulty(drills.map((wd) => wd.drills?.difficulty));
  const pips = difficulty ? DIFFICULTY_PIPS[difficulty] : 0;

  return (
    <div className="panel-lit relative overflow-hidden rounded-3xl border border-line bg-surface shadow-[var(--shadow-panel)]">
      <div
        className="absolute inset-x-0 top-0 h-32 opacity-70"
        style={{
          background:
            "radial-gradient(90% 100% at 20% 0%, var(--glow), transparent 70%)",
        }}
        aria-hidden
      />

      <div className="relative px-5 pt-5">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-accent px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white">
            Today&rsquo;s Session
          </span>
          {lastCompleted ? (
            <span className="text-[10px] font-bold uppercase tracking-wider text-foreground-mute">
              {lastCompleted}
            </span>
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--data-cyan)]">
              New for you
            </span>
          )}
        </div>

        <h3 className="font-display mt-3 text-3xl uppercase leading-[0.95] tracking-tight text-foreground">
          {workout.name}
        </h3>

        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-accent">
          <span className="inline-block h-1 w-1 rounded-full bg-accent" />
          {reason}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-line py-3">
          <Metric value={`${workout.estimated_minutes ?? "—"}`} unit="min" />
          <Metric value={`${drills.length}`} unit={drills.length === 1 ? "drill" : "drills"} />

          {difficulty && (
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {[1, 2, 3].map((n) => (
                  <span
                    key={n}
                    className="h-1.5 w-4 rounded-full"
                    style={{ background: n <= pips ? "var(--accent)" : "var(--data-dim)" }}
                  />
                ))}
              </div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-foreground-dim">
                {DIFFICULTY_LABELS[difficulty]}
              </span>
            </div>
          )}
        </div>

        <ul className="mt-3 space-y-1.5">
          {drills.slice(0, 3).map((wd) => (
            <li key={wd.id} className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate font-semibold text-foreground-dim">
                {wd.drills?.name}
                {wd.variant_label && (
                  <span className="ml-1.5 text-[var(--data-cyan)]">{wd.variant_label}</span>
                )}
              </span>
              <span className="shrink-0 font-bold text-foreground-mute">
                {wd.target_sets && wd.target_reps
                  ? `${wd.target_sets}×${wd.target_reps}`
                  : wd.target_duration_seconds
                    ? `${wd.target_duration_seconds}s`
                    : ""}
              </span>
            </li>
          ))}
          {drills.length > 3 && (
            <li className="text-xs font-bold text-foreground-mute">
              +{drills.length - 3} more
            </li>
          )}
        </ul>

        {workout.focus_areas && workout.focus_areas.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {workout.focus_areas.map((area) => (
              <span
                key={area}
                className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent"
              >
                {SKILL_LABELS[area] ?? area}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="relative mt-4 px-5 pb-5">
        <StartSessionButton playerId={playerId} workoutId={workout.id} fullWidth />
      </div>
    </div>
  );
}

function Metric({ value, unit }: { value: string; unit: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="font-display text-xl leading-none text-foreground">{value}</span>
      <span className="text-[10px] font-extrabold uppercase tracking-wider text-foreground-mute">
        {unit}
      </span>
    </div>
  );
}
