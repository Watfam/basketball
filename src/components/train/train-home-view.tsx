import Link from "next/link";
import { PlayerTabHeader } from "@/components/player-tab-header";
import { EmptyState } from "@/components/empty-state";
import { CardLink } from "@/components/ui/card";
import { ProgramOffer, type OfferedProgram } from "@/components/program-offer";
import { StartSessionButton } from "@/components/start-session-button";
import { SKILL_LABELS } from "@/lib/basketball/film";

export type TrainHomeProps = {
  playerId: string;
  playerName: string;
  workoutsError: boolean;
  next: { id: string; name: string; skills: string[]; why: string | null; minutes: number | null } | null;
  workoutCount: number;
  filmTotal: number;
  filmStudied: number;
  nextFilm: { id: string; title: string } | null;
  activeProgram: { id: string; name: string; week_count: number; days_per_week: number } | null;
  programs: OfferedProgram[];
  programReasons: Record<string, string>;
  mine: { id: string; name: string; skills: string[]; minutes: number | null; drills: number }[];
  saved: string | null;
};

/**
 * Train: what to do next, and the doors to everything that builds the player: the workout library, the Film Room, building a workout of
 * your own, the program they're on (or the one that fits best), and the workouts they have saved. Each door says how much is behind it.
 */
export function TrainHomeView(p: TrainHomeProps) {
  const { playerId } = p;
  const door = "panel-lit flex flex-col rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-line-strong";
  const skillNames = (list: string[]) => list.map((a) => SKILL_LABELS[a] ?? a).join(", ");
  const savedWorkout = p.saved ? p.mine.find((w) => w.id === p.saved) ?? null : null;
  return (
    <div className="flex flex-1 flex-col">
      <PlayerTabHeader playerId={playerId} name={p.playerName} />

      <main className="mx-auto w-full max-w-lg flex-1 space-y-5 px-4 py-5 sm:py-8">
        <h1 className="font-display text-3xl uppercase leading-none tracking-wide text-foreground">Train</h1>

        {savedWorkout && (
          <p role="status" className="rounded-xl border border-accent/40 bg-accent/5 px-4 py-3 text-sm text-foreground">
            Saved <b>{savedWorkout.name}</b>. It is under <b>Your workouts</b> below.
          </p>
        )}

        {p.workoutsError ? (
          <EmptyState eyebrow="Couldn't load workouts" title="The workouts didn't load" subtitle="Check the signal and try again." />
        ) : p.next ? (
          <section aria-label="Next up" className="theme-dark hero-sheen panel-lit relative overflow-hidden rounded-3xl border border-line bg-background p-5 text-foreground shadow-[var(--shadow-panel)]">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-accent">Next up{p.next.minutes ? ` · ${p.next.minutes} min` : ""}</p>
            <h2 className="mt-1.5 font-display text-3xl uppercase leading-[0.95] tracking-tight">{p.next.name}</h2>
            <p className="mt-2 text-sm text-foreground-dim">{[skillNames(p.next.skills), p.next.why].filter(Boolean).join(" · ")}</p>
            <div className="mt-4"><StartSessionButton playerId={playerId} workoutId={p.next.id} fullWidth label="Start workout" /></div>
          </section>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Link href={`/players/${playerId}/workouts/library`} className={door}>
            <span className="font-display text-4xl leading-none text-accent-hover">{p.workoutCount}</span>
            <span className="mt-1.5 font-display text-xl uppercase leading-none tracking-tight text-foreground">Workouts</span>
            <span className="mt-1 text-xs text-foreground-dim">Filter by skill, time, level</span>
          </Link>
          <Link href={`/players/${playerId}/film?tab=library`} className={door}>
            <span className="font-display text-4xl leading-none text-accent-hover">{p.filmTotal}</span>
            <span className="mt-1.5 font-display text-xl uppercase leading-none tracking-tight text-foreground">Film room</span>
            <span className="mt-1 text-xs text-foreground-dim">Skills, pros, trainers · {p.filmStudied} studied</span>
          </Link>
        </div>

        {p.nextFilm && (
          <Link href={`/players/${playerId}/film?lesson=${p.nextFilm.id}`} className="-mt-2 flex min-h-11 items-center justify-between gap-3 px-1 text-xs text-foreground-dim">
            <span className="min-w-0 truncate">Next lesson, picked for your weak spots: <b className="text-foreground">{p.nextFilm.title}</b></span>
            <span className="shrink-0 font-extrabold uppercase tracking-wide text-accent">Open →</span>
          </Link>
        )}

        <Link href={`/players/${playerId}/workouts/build`} className="flex items-center gap-3 rounded-2xl border border-dashed border-accent bg-accent/5 p-4">
          <span aria-hidden className="text-2xl font-extrabold text-accent-hover">＋</span>
          <span>
            <span className="block font-display text-xl uppercase leading-none tracking-tight text-foreground">Build your own</span>
            <span className="mt-1 block text-xs text-foreground-dim">Pick the time and the skills. It drafts a workout, you change it.</span>
          </span>
        </Link>

        {p.activeProgram ? (
          <section>
            <SectionHeading title="Your program" />
            <CardLink href={`/players/${playerId}/programs/${p.activeProgram.id}`} className="panel-lit p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-display text-xl uppercase leading-none text-foreground">{p.activeProgram.name}</p>
                  <p className="mt-1.5 text-xs text-foreground-dim">
                    {p.activeProgram.week_count} weeks · {p.activeProgram.days_per_week} days a week · today&rsquo;s day is on Today
                  </p>
                </div>
                <span className="shrink-0 text-xs font-extrabold uppercase tracking-wide text-accent">Plan →</span>
              </div>
            </CardLink>
          </section>
        ) : (
          p.programs.length > 0 && (
            <section>
              <SectionHeading title="Programs" caption="A few weeks, planned for you" />
              <ProgramOffer playerId={playerId} programs={p.programs.slice(0, 1)} reasons={p.programReasons} />
              {p.programs.length > 1 && (
                <details className="group mt-3">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center rounded-xl border border-line text-xs font-extrabold uppercase tracking-[0.1em] text-foreground-dim">
                    <span className="group-open:hidden">{p.programs.length - 1} more {p.programs.length === 2 ? "program" : "programs"}</span>
                    <span className="hidden group-open:inline">Fewer programs</span>
                  </summary>
                  <div className="mt-3">
                    <ProgramOffer playerId={playerId} programs={p.programs.slice(1)} reasons={p.programReasons} />
                  </div>
                </details>
              )}
            </section>
          )
        )}

        {p.mine.length > 0 && (
          <section>
            <SectionHeading title="Your workouts" caption={`${p.mine.length} saved`} />
            <div className="space-y-2">
              {p.mine.map((w) => (
                <div key={w.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
                  <Link href={`/players/${playerId}/workouts/build?edit=${w.id}`} className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold text-foreground">{w.name}</span>
                    <span className="block text-xs text-foreground-dim">{skillNames(w.skills)}{w.minutes ? ` · ${w.minutes} min` : ""} · {w.drills} {w.drills === 1 ? "drill" : "drills"} · Edit</span>
                  </Link>
                  <StartSessionButton playerId={playerId} workoutId={w.id} />
                </div>
              ))}
            </div>
          </section>
        )}

        <Link href={`/players/${playerId}/sessions`} className="flex min-h-11 items-center justify-center text-xs font-extrabold uppercase tracking-[0.1em] text-foreground-dim hover:text-foreground">
          Workout history →
        </Link>
      </main>
    </div>
  );
}

function SectionHeading({ title, caption }: { title: string; caption?: string }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-3">
      <h2 className="font-display text-xl uppercase leading-none tracking-wide text-foreground">{title}</h2>
      {caption && <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-foreground-mute">{caption}</span>}
    </div>
  );
}
