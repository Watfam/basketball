const SKILL_LABELS: Record<string, string> = {
  ball_handling: "Ball Handling",
  shooting: "Shooting",
  defense: "Defense",
  athleticism: "Athleticism",
};

type Drill = {
  id: string;
  name: string;
  description: string | null;
  video_url: string | null;
  source_trainer: string | null;
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
  if (wd.target_sets && wd.target_reps) return `${wd.target_sets} × ${wd.target_reps}`;
  if (wd.target_duration_seconds) return `${wd.target_duration_seconds}s`;
  return null;
}

export function WorkoutCard({ workout }: { workout: Workout }) {
  const drills = [...workout.workout_drills].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-foreground">{workout.name}</h3>
          {workout.description && (
            <p className="mt-1 text-sm text-foreground-dim">{workout.description}</p>
          )}
        </div>
        {workout.estimated_minutes && (
          <span className="shrink-0 rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-foreground-dim">
            ~{workout.estimated_minutes} min
          </span>
        )}
      </div>

      {workout.focus_areas && workout.focus_areas.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {workout.focus_areas.map((area) => (
            <span
              key={area}
              className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent"
            >
              {SKILL_LABELS[area] ?? area}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 space-y-2.5 border-t border-line pt-4">
        {drills.map((wd) => {
          const drill = wd.drills;
          if (!drill) return null;
          const target = targetLabel(wd);
          return (
            <div key={wd.drill_id} className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{drill.name}</p>
                {drill.description && (
                  <p className="mt-0.5 text-xs text-foreground-dim">{drill.description}</p>
                )}
                <p className="mt-0.5 text-xs text-foreground-dim">
                  {[drill.source_trainer, drill.video_url ? "Film available" : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {target && (
                  <span className="text-xs font-bold text-foreground-dim">{target}</span>
                )}
                {drill.video_url && (
                  <a
                    href={drill.video_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-accent hover:text-accent-hover"
                  >
                    Watch film ↗
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
