import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/empty-state";
import { Options, PickLink, SheetPicker } from "@/components/ui/sheet";
import { WorkoutRow } from "@/components/workout-row";
import type { Workout } from "@/components/workout-card";
import { LEVEL_OPTIONS, TIME_BANDS, WORKOUT_SKILLS, describeFilters, filterHref, filterWorkouts, hasFilters, optionCounts, type WorkoutFilters } from "@/lib/basketball/train-library";
import { workoutMinutes } from "@/lib/basketball/workout-minutes";
import { lastCompletedLabel } from "@/lib/basketball/workout-matching";
import type { DrillEntry } from "@/lib/basketball/prescription";
import type { SkillLevel } from "@/lib/basketball/assessment";

/**
 * The whole workout library, with filters. Train shows what to do next; this is where a player finds what they want to train:
 * a skill, a length, a level. The count always says how many of how many are showing. `ranked` is already in the player's order.
 */
export function WorkoutLibraryView({ playerId, ranked, filters, level, lastDone, error, basePath }: { playerId: string; ranked: Workout[]; filters: WorkoutFilters; level: SkillLevel; lastDone: Record<string, string>; error: boolean; basePath?: string }) {
  const minutesOf = (w: Workout) => workoutMinutes({ estimated_minutes: w.estimated_minutes, workout_drills: w.workout_drills as unknown as DrillEntry[] }, level);
  const shown = filterWorkouts(ranked, filters, minutesOf);
  const base = basePath ?? `/players/${playerId}/workouts/library`;
  const link = (change: Partial<WorkoutFilters>) => filterHref(base, filters, change);
  const count = (dim: keyof WorkoutFilters, options: readonly string[]) => optionCounts(ranked, filters, dim, options, minutesOf);
  const skillCounts = count("skill", WORKOUT_SKILLS.map((s) => s.value));
  const timeCounts = count("time", TIME_BANDS.map((t) => t.value));
  const levelCounts = count("level", LEVEL_OPTIONS.map((l) => l.value));
  const allCount = (dim: keyof WorkoutFilters) => filterWorkouts(ranked, { ...filters, [dim]: null }, minutesOf).length;

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader back={{ href: `/players/${playerId}/workouts`, label: "Train" }} />
      <main className="mx-auto w-full max-w-lg flex-1 space-y-4 px-4 py-5 sm:py-8">
        <h1 className="font-display text-3xl uppercase leading-none tracking-wide text-foreground">Workouts</h1>

        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Filter workouts">
          <SheetPicker chip label="Skill" title="Skill" active={Boolean(filters.skill)} value={filters.skill ? WORKOUT_SKILLS.find((s) => s.value === filters.skill)!.label : "Any skill"}>
            <Options label="Skill">
              <PickLink href={link({ skill: null })} selected={!filters.skill} title="Any skill" right={String(allCount("skill"))} />
              {WORKOUT_SKILLS.map((s) => <PickLink key={s.value} href={link({ skill: s.value })} selected={filters.skill === s.value} title={s.label} right={String(skillCounts[s.value])} disabled={skillCounts[s.value] === 0 && filters.skill !== s.value} />)}
            </Options>
          </SheetPicker>
          <SheetPicker chip label="Time" title="How long" active={Boolean(filters.time)} value={filters.time ? TIME_BANDS.find((t) => t.value === filters.time)!.label : "Any time"}>
            <Options label="How long">
              <PickLink href={link({ time: null })} selected={!filters.time} title="Any time" right={String(allCount("time"))} />
              {TIME_BANDS.map((t) => <PickLink key={t.value} href={link({ time: t.value })} selected={filters.time === t.value} title={t.label} right={String(timeCounts[t.value])} disabled={timeCounts[t.value] === 0 && filters.time !== t.value} />)}
            </Options>
          </SheetPicker>
          <SheetPicker chip label="Level" title="Level" active={Boolean(filters.level)} value={filters.level ? LEVEL_OPTIONS.find((l) => l.value === filters.level)!.label : "Any level"}>
            <Options label="Level">
              <PickLink href={link({ level: null })} selected={!filters.level} title="Any level" right={String(allCount("level"))} />
              {LEVEL_OPTIONS.map((l) => <PickLink key={l.value} href={link({ level: l.value })} selected={filters.level === l.value} title={l.label} right={String(levelCounts[l.value])} disabled={levelCounts[l.value] === 0 && filters.level !== l.value} />)}
            </Options>
          </SheetPicker>
        </div>

        <p className="flex items-center justify-between gap-3 px-0.5 text-xs text-foreground-dim" aria-live="polite">
          <span>
            Showing <b className="text-foreground">{shown.length} of {ranked.length}</b> workouts{hasFilters(filters) ? ` · ${describeFilters(filters)}` : " · ordered for you"}
          </span>
          {hasFilters(filters) && <Link href={base} scroll={false} className="-my-3 inline-flex min-h-11 shrink-0 items-center font-extrabold text-accent">Clear</Link>}
        </p>

        {error ? (
          <EmptyState eyebrow="Couldn't load workouts" title="The workouts didn't load" subtitle="Check the signal and try again." />
        ) : ranked.length === 0 ? (
          <EmptyState eyebrow="No workouts yet" title="Workouts aren't loaded" subtitle="The workouts aren't loaded yet. Ask your coach to set them up." />
        ) : shown.length === 0 ? (
          <EmptyState eyebrow="Nothing matches" title="No workouts like that" subtitle="Try fewer filters, or build your own." action={<Link href={base} className="inline-flex min-h-11 items-center text-sm font-extrabold text-accent">Show all workouts</Link>} />
        ) : (
          <div className="space-y-2">
            {shown.map((w) => <WorkoutRow key={w.id} workout={w} playerId={playerId} minutes={minutesOf(w)} lastDone={lastCompletedLabel(lastDone[w.id])} />)}
          </div>
        )}

        <Link href={`/players/${playerId}/workouts/build`} className="flex min-h-14 items-center justify-center rounded-2xl border border-dashed border-accent bg-accent/5 text-sm font-extrabold text-accent-hover">＋ Build your own workout</Link>
      </main>
    </div>
  );
}
