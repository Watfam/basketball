import { lessonForDrill, lessonUrl, type Lesson } from "./drill-film.ts";
import { CATEGORY_LABELS, shootingProfile, trackingGoal, type ShootingCategory, type TrackingGoal } from "./drill-shooting.ts";
import { resolvePrescription, type DrillEntry } from "./prescription.ts";
import type { SkillLevel } from "./assessment.ts";

/**
 * What the workout screen needs to know about each shooting drill, worked out once on the server from the drill's own definition, the
 * existing Film Room lessons and the household's own video links. Drills that are not about shooting get nothing here and look exactly as before.
 */
export type LessonView = { id: string; title: string; watchFor: string[]; url: string | null; basis: "linked" | "related"; watched: boolean };
export type TrackingInfo = { trackable: boolean; category: ShootingCategory | null; categoryLabel: string | null; why: string; goal: TrackingGoal | null };
export type EntryExtras = { lesson: LessonView | null; tracking: TrackingInfo };

type Entry = DrillEntry & { drills: { id: string; name: string; skill_tags?: string[] | null } | null };

export function buildEntryExtras(args: {
  entries: Entry[];
  level: SkillLevel;
  volumeStep: number;
  lessons: Lesson[];
  householdLinks: ReadonlyMap<string, string>;
  watched: ReadonlySet<string>;
}): Record<string, EntryExtras> {
  const out: Record<string, EntryExtras> = {};
  for (const e of args.entries) {
    if (!e.drills) continue;
    const profile = shootingProfile(e.drills);
    if (profile.category === null) continue;
    const found = lessonForDrill({ id: e.drills.id, name: e.drills.name }, args.lessons);
    out[e.id] = {
      lesson: found ? { id: found.lesson.id, title: found.lesson.title, watchFor: found.lesson.watch_for ?? [], url: lessonUrl(found.lesson, args.householdLinks), basis: found.basis, watched: args.watched.has(found.lesson.id) } : null,
      tracking: {
        trackable: profile.trackable, category: profile.category, categoryLabel: CATEGORY_LABELS[profile.category], why: profile.why,
        goal: profile.trackable ? trackingGoal(resolvePrescription(e, args.level, args.volumeStep)) : null,
      },
    };
  }
  return out;
}
