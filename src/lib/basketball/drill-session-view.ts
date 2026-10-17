import { lessonsForDrill, lessonUrl, studySessionFor, type Lesson, type StudySession } from "./drill-film.ts";
import { benchmarkForEntry, type BenchmarkProtocol } from "./benchmarks.ts";
import { CATEGORY_LABELS, shootingProfile, trackingGoal, type ShootingCategory, type TrackingGoal } from "./drill-shooting.ts";
import { resolvePrescription, type DrillEntry } from "./prescription.ts";
import type { SkillLevel } from "./assessment.ts";

/**
 * What the workout screen needs to know about each shooting drill, worked out once on the server from the drill's own definition, the
 * existing Film Room lessons and the household's own video links. Drills that are not about shooting get nothing here and look exactly as before.
 */
export type LessonView = {
  id: string; title: string; watchFor: string[]; url: string | null; basis: "linked" | "related"; watched: boolean;
  /** Other lessons the Film Room links to the same drill, and the existing study session they belong to. Both empty for most drills. */
  more: { id: string; title: string; url: string | null; watched: boolean }[];
  studySession: { id: string; name: string; lessonCount: number } | null;
};
export type TrackingInfo = { trackable: boolean; category: ShootingCategory | null; categoryLabel: string | null; why: string; goal: TrackingGoal | null };
export type EntryExtras = { lesson: LessonView | null; tracking: TrackingInfo; /** Set when this entry is exactly a benchmark protocol (benchmarks.ts). */ benchmark: BenchmarkProtocol | null };

type Entry = DrillEntry & { drills: { id: string; name: string; skill_tags?: string[] | null } | null };

export function buildEntryExtras(args: {
  entries: Entry[];
  level: SkillLevel;
  volumeStep: number;
  lessons: Lesson[];
  householdLinks: ReadonlyMap<string, string>;
  watched: ReadonlySet<string>;
  studySessions?: StudySession[];
}): Record<string, EntryExtras> {
  const out: Record<string, EntryExtras> = {};
  for (const e of args.entries) {
    if (!e.drills) continue;
    const profile = shootingProfile(e.drills);
    if (profile.category === null) continue;
    const found = lessonsForDrill({ id: e.drills.id, name: e.drills.name }, args.lessons);
    const view = (l: Lesson) => ({ id: l.id, title: l.title, url: lessonUrl(l, args.householdLinks), watched: args.watched.has(l.id) });
    const linkedIds = found && found.basis === "linked" ? [found.primary, ...found.more].map((l) => l.id) : [];
    out[e.id] = {
      lesson: found ? { id: found.primary.id, title: found.primary.title, watchFor: found.primary.watch_for ?? [], url: lessonUrl(found.primary, args.householdLinks), basis: found.basis, watched: args.watched.has(found.primary.id), more: found.more.map(view), studySession: studySessionFor(linkedIds, args.studySessions ?? []) } : null,
      tracking: {
        trackable: profile.trackable, category: profile.category, categoryLabel: CATEGORY_LABELS[profile.category], why: profile.why,
        goal: profile.trackable ? trackingGoal(resolvePrescription(e, args.level, args.volumeStep)) : null,
      },
      benchmark: benchmarkForEntry({ drillName: e.drills.name, variantLabel: e.variant_label, sets: e.target_sets, reps: e.target_reps, seconds: e.target_duration_seconds, levels: e.levels, levelTargets: e.level_targets }),
    };
  }
  return out;
}
