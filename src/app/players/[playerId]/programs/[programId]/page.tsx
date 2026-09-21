import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WorkoutCard, type Workout } from "@/components/workout-card";
import { EnrollButton } from "@/components/enroll-button";

const SKILL_LABELS: Record<string, string> = {
  ball_handling: "Ball Handling",
  shooting: "Shooting",
  defense: "Defense",
  athleticism: "Athleticism",
};

/**
 * What's actually inside a program, before committing six weeks to it.
 * Enrolling used to be a blind decision — a name, a session count and a
 * sentence. This shows the real schedule and every workout in it.
 */
export default async function ProgramDetailPage({
  params,
}: {
  params: Promise<{ playerId: string; programId: string }>;
}) {
  const { playerId, programId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: program } = await supabase
    .schema("hoops")
    .from("programs")
    .select("id, name, description, focus_areas, level, week_count, days_per_week")
    .eq("id", programId)
    .maybeSingle();

  if (!program) notFound();

  const { data: days } = await supabase
    .schema("hoops")
    .from("program_days")
    .select("id, week_number, day_number, workout_id, is_deload, note")
    .eq("program_id", programId)
    .order("week_number", { ascending: true })
    .order("day_number", { ascending: true });

  // The distinct workouts this program draws on — a six-week block cycles
  // a handful of sessions rather than using eighteen different ones, so
  // listing every day's workout would repeat the same three cards six
  // times over.
  const workoutIds = [...new Set((days ?? []).map((d) => d.workout_id))];
  const { data: workouts } = workoutIds.length
    ? await supabase
        .schema("hoops")
        .from("workouts")
        .select(
          "id, name, description, focus_areas, estimated_minutes, player_type_tags, workout_drills(id, drill_id, sort_order, block, variant_label, levels, level_targets, target_sets, target_reps, target_duration_seconds, drills(id, name, description, video_url, source_trainer, difficulty))"
        )
        .in("id", workoutIds)
    : { data: [] as unknown[] };

  const workoutsById = new Map(
    ((workouts ?? []) as unknown as Workout[]).map((w) => [w.id, w])
  );

  const { data: activeEnrollment } = await supabase
    .schema("hoops")
    .from("player_programs")
    .select("id, program_id")
    .eq("player_id", playerId)
    .eq("status", "active")
    .maybeSingle();

  const isEnrolledHere = activeEnrollment?.program_id === programId;
  const isOnAnotherProgram = Boolean(activeEnrollment) && !isEnrolledHere;

  const weeks = new Map<number, typeof days>();
  (days ?? []).forEach((d) => {
    const list = weeks.get(d.week_number) ?? [];
    list.push(d);
    weeks.set(d.week_number, list);
  });

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-background/85 px-5 py-3 backdrop-blur">
        <div className="mx-auto w-full max-w-lg">
          <Link
            href={`/players/${playerId}`}
            className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim transition-colors hover:text-foreground"
          >
            ← Back
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-5 px-4 py-5 sm:py-8">
        <section className="theme-dark hero-sheen panel-lit relative overflow-hidden rounded-3xl border border-line p-5 shadow-[var(--shadow-panel)]">
          <div className="court-lines absolute inset-0 opacity-60" aria-hidden />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-1.5">
              {((program.focus_areas ?? []) as string[]).map((area) => (
                <span
                  key={area}
                  className="rounded-md bg-accent px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white"
                >
                  {SKILL_LABELS[area] ?? area}
                </span>
              ))}
              {program.level && (
                <span className="rounded-md border border-line-strong px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-foreground-dim">
                  {program.level}
                </span>
              )}
            </div>

            <h1 className="font-display mt-3 text-4xl uppercase leading-[0.92] tracking-tight text-foreground">
              {program.name}
            </h1>
            {program.description && (
              <p className="mt-2 text-sm leading-relaxed text-foreground-dim">
                {program.description}
              </p>
            )}

            <div className="mt-4 flex items-center gap-5 border-t border-line pt-3">
              <Metric value={String(program.week_count)} unit="weeks" />
              <Metric value={String(program.days_per_week)} unit="days / wk" />
              <Metric value={String((days ?? []).length)} unit="sessions" />
            </div>
          </div>
        </section>

        {isEnrolledHere ? (
          <p className="rounded-xl border border-accent bg-accent/10 px-4 py-3 text-center text-xs font-extrabold uppercase tracking-wider text-accent">
            You&rsquo;re on this program
          </p>
        ) : (
          <EnrollButton
            playerId={playerId}
            programId={programId}
            replacesExisting={isOnAnotherProgram}
          />
        )}

        <section>
          <h2 className="font-display text-2xl uppercase leading-none tracking-wide text-foreground">
            The Schedule
          </h2>
          <p className="mt-1.5 text-xs text-foreground-dim">
            Volume builds through the block, then eases off.
          </p>

          <div className="mt-3 space-y-2.5">
            {[...weeks.entries()].map(([weekNumber, weekDays]) => (
              <div key={weekNumber} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex items-baseline justify-between">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-accent">
                    Week {weekNumber}
                  </p>
                  {weekDays?.some((d) => d.is_deload) && (
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--data-cyan)]">
                      Deload
                    </span>
                  )}
                </div>

                <div className="mt-2 space-y-1.5">
                  {weekDays?.map((d) => (
                    <div key={d.id} className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 truncate text-xs font-semibold text-foreground-dim">
                        <span className="font-extrabold text-foreground-mute">
                          Day {d.day_number}
                        </span>{" "}
                        {workoutsById.get(d.workout_id)?.name ?? "Session"}
                      </p>
                    </div>
                  ))}
                </div>

                {weekDays?.find((d) => d.note)?.note && (
                  <p className="mt-2.5 border-l-2 border-accent pl-3 text-xs leading-relaxed text-foreground-dim">
                    {weekDays.find((d) => d.note)?.note}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-display text-2xl uppercase leading-none tracking-wide text-foreground">
            The Sessions
          </h2>
          <p className="mt-1.5 text-xs text-foreground-dim">
            {workoutsById.size} {workoutsById.size === 1 ? "workout" : "workouts"} cycled through the
            block. Targets shown are your level&rsquo;s starting numbers.
          </p>

          <div className="mt-3 space-y-3">
            {[...workoutsById.values()].map((workout) => (
              <WorkoutCard
                key={workout.id}
                workout={workout}
                playerId={playerId}
                showStart={false}
              />
            ))}
          </div>
        </section>
      </main>
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
