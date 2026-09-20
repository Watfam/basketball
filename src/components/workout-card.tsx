import { StartSessionButton } from "@/components/start-session-button";
import { computeWorkoutDifficulty } from "@/lib/basketball/workout-matching";

const SKILL_LABELS: Record<string, string> = {
  ball_handling: "Ball Handling",
  shooting: "Shooting",
  defense: "Defense",
  athleticism: "Athleticism",
};

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

// Three pips rather than a word alone — difficulty is a scale, and a scale
// should look like one at a glance.
const DIFFICULTY_PIPS: Record<string, number> = { beginner: 1, intermediate: 2, advanced: 3 };

type Drill = {
  id: string;
  name: string;
  description: string | null;
  video_url: string | null;
  source_trainer: string | null;
  difficulty: string | null;
};

type WorkoutDrill = {
  // hoops.workout_drills has a composite primary key (workout_id, drill_id)
  // — no standalone id column — so drill_id doubles as the React key here.
  drill_id: string;
  sort_order: number;
  target_sets: number | null;
  target_reps: number | null;
  target_duration_seconds: number | null;
  drills: Drill | null;
};

export type Workout = {
  id: string;
  name: string;
  description: string | null;
  focus_areas: string[] | null;
  estimated_minutes: number | null;
  player_type_tags: { positions?: string[]; style_tags?: string[] } | null;
  workout_drills: WorkoutDrill[];
};

function targetLabel(wd: WorkoutDrill): string | null {
  if (wd.target_sets && wd.target_reps) return `${wd.target_sets}×${wd.target_reps}`;
  if (wd.target_duration_seconds) return `${wd.target_duration_seconds}s`;
  return null;
}

export function WorkoutCard({ workout, playerId }: { workout: Workout; playerId: string }) {
  const drills = [...workout.workout_drills].sort((a, b) => a.sort_order - b.sort_order);
  const difficulty = computeWorkoutDifficulty(drills.map((wd) => wd.drills?.difficulty));
  const pips = difficulty ? DIFFICULTY_PIPS[difficulty] : 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="px-5 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {workout.focus_areas?.map((area) => (
              <span
                key={area}
                className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-accent"
              >
                {SKILL_LABELS[area] ?? area}
              </span>
            ))}
          </div>

          {difficulty && (
            <div className="flex shrink-0 items-center gap-2">
              <div className="flex gap-0.5">
                {[1, 2, 3].map((n) => (
                  <span
                    key={n}
                    className="h-1 w-3 rounded-full"
                    style={{ background: n <= pips ? "var(--accent)" : "var(--data-dim)" }}
                  />
                ))}
              </div>
              <span className="text-[9px] font-extrabold uppercase tracking-wider text-foreground-mute">
                {DIFFICULTY_LABELS[difficulty]}
              </span>
            </div>
          )}
        </div>

        <h3 className="font-display mt-2 text-2xl uppercase leading-[0.98] tracking-tight text-foreground">
          {workout.name}
        </h3>
        {workout.description && (
          <p className="mt-1.5 text-xs leading-relaxed text-foreground-dim">{workout.description}</p>
        )}

        <div className="mt-3 flex items-center gap-4 border-y border-line py-2.5">
          <Metric value={`${workout.estimated_minutes ?? "—"}`} unit="min" />
          <Metric value={`${drills.length}`} unit={drills.length === 1 ? "drill" : "drills"} />
        </div>
      </div>

      <div className="space-y-2 px-5 py-3">
        {drills.map((wd) => {
          const drill = wd.drills;
          if (!drill) return null;
          const target = targetLabel(wd);
          return (
            <div key={wd.drill_id} className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{drill.name}</p>
                {drill.source_trainer && (
                  <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-foreground-mute">
                    {drill.source_trainer}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-baseline gap-2.5">
                {target && (
                  <span className="text-xs font-extrabold tabular-nums text-foreground-dim">
                    {target}
                  </span>
                )}
                {drill.video_url && (
                  <a
                    href={drill.video_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-extrabold uppercase tracking-wider text-accent transition-colors hover:text-accent-hover"
                  >
                    Film ↗
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-line px-5 py-3.5">
        <StartSessionButton playerId={playerId} workoutId={workout.id} fullWidth />
      </div>
    </div>
  );
}

function Metric({ value, unit }: { value: string; unit: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="font-display text-lg leading-none text-foreground">{value}</span>
      <span className="text-[10px] font-extrabold uppercase tracking-wider text-foreground-mute">
        {unit}
      </span>
    </div>
  );
}
