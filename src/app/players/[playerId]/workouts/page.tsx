import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rankWorkouts, type PlayerType } from "@/lib/basketball/workout-matching";
import { rankPrograms, explainProgram } from "@/lib/basketball/program";
import { rankFilm } from "@/lib/basketball/film";
import { WorkoutCard, type Workout } from "@/components/workout-card";
import { ProgramOffer, type OfferedProgram } from "@/components/program-offer";
import { PlayerTabHeader } from "@/components/player-tab-header";
import { EmptyState } from "@/components/empty-state";
import { CardLink } from "@/components/ui/card";
import { playerLevel, WEAKNESS_THRESHOLD, type ComputedPlayerType } from "@/lib/basketball/assessment";

/**
 * Train: everything that builds the player. The program they're on (or
 * the two that fit them best), the film room, and the workout library,
 * ordered for them. Programs and film used to sit on the home screen.
 */
export default async function TrainPage({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  const supabase = await createClient();
  const hoops = supabase.schema("hoops");

  const [
    { data: { user } },
    { data: player },
    { data: workouts, error: workoutsError },
    { data: completed },
    { data: enrollment },
    { data: programs },
    { data: filmRows },
    { data: filmViews },
  ] = await Promise.all([
    supabase.auth.getUser(),
    hoops.from("players").select("id, display_name, player_type").eq("id", playerId).maybeSingle(),
    // The library is readable by anyone signed in; it's loaded by the coach, not written here.
    hoops
      .from("workouts")
      .select(
        "id, name, description, focus_areas, estimated_minutes, player_type_tags, workout_drills(id, drill_id, sort_order, block, variant_label, levels, level_targets, target_sets, target_reps, target_duration_seconds, drills(id, name, description, video_url, source_trainer, difficulty))"
      ),
    hoops
      .from("workout_sessions")
      .select("workout_id, completed_at")
      .eq("player_id", playerId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false }),
    hoops
      .from("player_programs")
      .select("program_id, programs(id, name, week_count, days_per_week)")
      .eq("player_id", playerId)
      .eq("status", "active")
      .maybeSingle(),
    hoops.from("programs").select("id, name, description, focus_areas, player_type_tags, level, week_count, days_per_week"),
    hoops.from("film_resources").select("id, title, kind, skill_tags, position_tags, sort_order"),
    hoops.from("film_views").select("film_resource_id").eq("player_id", playerId),
  ]);

  if (!user) redirect("/login");
  if (!player) notFound();
  if (workoutsError) console.error("[train] workouts fetch failed:", workoutsError);

  const playerType = (player.player_type ?? {}) as ComputedPlayerType & PlayerType;
  if (!playerType.archetype) redirect(`/players/${playerId}/assessment`);
  const level = playerLevel(player.player_type);

  const lastDone: Record<string, string> = {};
  for (const s of completed ?? []) {
    if (s.workout_id && s.completed_at && !lastDone[s.workout_id]) lastDone[s.workout_id] = s.completed_at;
  }
  const ranked = rankWorkouts(playerType, (workouts ?? []) as unknown as Workout[], {
    playerLevel: level,
    lastCompletedByWorkoutId: lastDone,
  });

  const activeProgram = enrollment?.programs as unknown as
    | { id: string; name: string; week_count: number; days_per_week: number }
    | null
    | undefined;
  // Committing to a block is a real decision: offer the two that fit
  // best, the rest one tap away, and nothing at all while on one.
  const rankedPrograms = activeProgram ? [] : rankPrograms(playerType, level, programs ?? [], WEAKNESS_THRESHOLD);
  const programReasons: Record<string, string> = {};
  for (const p of rankedPrograms) programReasons[p.id] = explainProgram(playerType, p, WEAKNESS_THRESHOLD);

  const watched = new Set((filmViews ?? []).map((v) => v.film_resource_id));
  const nextFilm = rankFilm(playerType, (filmRows ?? []) as Parameters<typeof rankFilm>[1], watched, WEAKNESS_THRESHOLD)[0] ?? null;

  return (
    <div className="flex flex-1 flex-col">
      <PlayerTabHeader playerId={playerId} name={player.display_name} />

      <main className="mx-auto w-full max-w-lg flex-1 space-y-6 px-4 py-5 sm:py-8">
        <h1 className="font-display text-3xl uppercase leading-none tracking-wide text-foreground">Train</h1>

        {activeProgram ? (
          <section>
            <SectionHeading title="Your program" />
            <CardLink href={`/players/${playerId}/programs/${activeProgram.id}`} className="panel-lit p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-display text-xl uppercase leading-none text-foreground">{activeProgram.name}</p>
                  <p className="mt-1.5 text-xs text-foreground-dim">
                    {activeProgram.week_count} weeks · {activeProgram.days_per_week} days a week · today&rsquo;s day is on Today
                  </p>
                </div>
                <span className="shrink-0 text-xs font-extrabold uppercase tracking-wide text-accent">Plan →</span>
              </div>
            </CardLink>
          </section>
        ) : (
          rankedPrograms.length > 0 && (
            <section>
              <SectionHeading title="Programs" caption="A few weeks, planned for you" />
              <ProgramOffer
                playerId={playerId}
                programs={rankedPrograms.slice(0, 2) as OfferedProgram[]}
                reasons={programReasons}
              />
              {rankedPrograms.length > 2 && (
                <details className="group mt-3">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center rounded-xl border border-line text-xs font-extrabold uppercase tracking-[0.1em] text-foreground-dim">
                    <span className="group-open:hidden">{rankedPrograms.length - 2} more programs</span>
                    <span className="hidden group-open:inline">Fewer programs</span>
                  </summary>
                  <div className="mt-3">
                    <ProgramOffer
                      playerId={playerId}
                      programs={rankedPrograms.slice(2) as OfferedProgram[]}
                      reasons={programReasons}
                    />
                  </div>
                </details>
              )}
            </section>
          )
        )}

        <section>
          <SectionHeading title="Film room" caption={`${watched.size} studied`} />
          <CardLink
            href={nextFilm ? `/players/${playerId}/film?lesson=${nextFilm.id}` : `/players/${playerId}/film`}
            className="panel-lit p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-xl uppercase leading-none tracking-tight text-foreground">
                  {nextFilm?.title ?? "Study the game"}
                </p>
                <p className="mt-1.5 text-xs text-foreground-dim">
                  {nextFilm ? "Next lesson, picked for your weak spots" : "Lessons that tell you what to look for"}
                </p>
              </div>
              <span className="shrink-0 text-xs font-extrabold uppercase tracking-wide text-accent">Open →</span>
            </div>
          </CardLink>
        </section>

        <section className="space-y-3">
          <SectionHeading title="Workouts" caption={`${ranked.length} · ordered for you`} />
          {workoutsError ? (
            <EmptyState eyebrow="Couldn't load workouts" title="The workouts didn't load" subtitle="Check the signal and try again." />
          ) : ranked.length === 0 ? (
            <EmptyState
              eyebrow="No workouts yet"
              title="Workouts aren't loaded"
              subtitle="The workouts aren't loaded yet. Ask your coach to set them up."
            />
          ) : (
            ranked.map((workout) => <WorkoutCard key={workout.id} workout={workout} playerId={playerId} />)
          )}
          <Link
            href={`/players/${playerId}/sessions`}
            className="flex min-h-11 items-center justify-center text-xs font-extrabold uppercase tracking-[0.1em] text-foreground-dim hover:text-foreground"
          >
            Workout history →
          </Link>
        </section>
      </main>
    </div>
  );
}

function SectionHeading({ title, caption }: { title: string; caption?: string }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-3">
      <h2 className="font-display text-xl uppercase leading-none tracking-wide text-foreground">{title}</h2>
      {caption && (
        <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-foreground-mute">{caption}</span>
      )}
    </div>
  );
}
