/**
 * Building a workout: how long each drill takes, a draft that fits the time, and the checks the server repeats before saving.
 * Times are estimates ("about"): a rep takes a few seconds, a set takes a rest, a drill takes a moment to set up.
 */
import type { SkillLevel } from "./assessment";

export type Block = "warmup" | "main" | "finisher";

export type BuilderDrill = {
  id: string;
  name: string;
  description: string | null;
  skill_tags: string[];
  difficulty: string | null;
  /** What this drill usually asks for in the library's workouts (or a plain default). */
  sets: number | null;
  reps: number | null;
  seconds: number | null;
};

export type BuilderEntry = {
  /** Stable across edits, for React and for moving it. */
  key: string;
  /** The saved workout_drills row, when editing a saved workout. */
  entryId?: string;
  drillId: string;
  sets: number | null;
  reps: number | null;
  seconds: number | null;
  block: Block;
};

export const LENGTHS = [15, 30, 45, 60] as const;
export const MAX_ENTRIES = 15;
const SECONDS_PER_REP = 3;
const REST_BETWEEN_SETS = 20;
const REST_TIMED = 15;
const SETUP_SECONDS = 30;
const NO_TARGET_SECONDS = 180;

export const clampInt = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

export function entrySeconds(e: Pick<BuilderEntry, "sets" | "reps" | "seconds">): number {
  const sets = e.sets ?? 1;
  if (e.seconds) return SETUP_SECONDS + sets * (e.seconds + REST_TIMED);
  if (e.reps) return SETUP_SECONDS + sets * (e.reps * SECONDS_PER_REP + REST_BETWEEN_SETS);
  return NO_TARGET_SECONDS;
}

export const entryMinutes = (e: Pick<BuilderEntry, "sets" | "reps" | "seconds">) => Math.max(1, Math.round(entrySeconds(e) / 60));
export const totalMinutes = (entries: Pick<BuilderEntry, "sets" | "reps" | "seconds">[]) => Math.round(entries.reduce((s, e) => s + entrySeconds(e), 0) / 60);

const WEIGHT: Record<string, number> = { beginner: 1, intermediate: 2, advanced: 3 };

type LibraryEntry = { drill_id: string; variant_label: string | null; target_sets: number | null; target_reps: number | null; target_duration_seconds: number | null; level_targets: Record<string, { sets?: number; reps?: number; duration_seconds?: number }> | null };

/** The most usual prescription for each drill across the library's workouts (the player's level's numbers where they exist), else three sets of ten. Benchmark entries are tests, not practice, and are left out. */
export function typicalPrescriptions(entries: LibraryEntry[], level: SkillLevel, isBenchmark: (label: string | null) => boolean): Map<string, { sets: number | null; reps: number | null; seconds: number | null }> {
  const tally = new Map<string, Map<string, { n: number; v: { sets: number | null; reps: number | null; seconds: number | null } }>>();
  for (const e of entries) {
    if (isBenchmark(e.variant_label)) continue;
    const lt = e.level_targets?.[level];
    const v = { sets: lt?.sets ?? e.target_sets ?? null, reps: lt?.reps ?? e.target_reps ?? null, seconds: lt?.duration_seconds ?? e.target_duration_seconds ?? null };
    const k = `${v.sets}|${v.reps}|${v.seconds}`;
    const m = tally.get(e.drill_id) ?? new Map();
    const cur = m.get(k) ?? { n: 0, v };
    cur.n += 1;
    m.set(k, cur);
    tally.set(e.drill_id, m);
  }
  const out = new Map<string, { sets: number | null; reps: number | null; seconds: number | null }>();
  for (const [id, m] of tally) out.set(id, [...m.values()].sort((a, b) => b.n - a.n)[0].v);
  return out;
}

export const fallbackPrescription = { sets: 3, reps: 10, seconds: null as number | null };

export function blocksFor(n: number): Block[] {
  return Array.from({ length: n }, (_, i) => (n >= 3 && i === 0 ? "warmup" : n >= 3 && i === n - 1 ? "finisher" : "main"));
}

let seq = 0;
export const newKey = () => `e${Date.now().toString(36)}${(seq++).toString(36)}`;

export function toEntry(d: BuilderDrill): BuilderEntry {
  const p = d.sets || d.reps || d.seconds ? { sets: d.sets, reps: d.reps, seconds: d.seconds } : fallbackPrescription;
  return { key: newKey(), drillId: d.id, sets: p.sets, reps: p.reps, seconds: p.seconds, block: "main" };
}

/**
 * A draft that fits the time: drills for the chosen skills, closest to the player's level first, taken in turn across the skills
 * until the minutes are used. `shuffle` moves along the list for a different draft. Stops within a couple of minutes of the target.
 */
export function draftWorkout(opts: { minutes: number; skills: string[]; level: SkillLevel; drills: BuilderDrill[]; shuffle?: number }): BuilderEntry[] {
  const { minutes, skills, level, drills, shuffle = 0 } = opts;
  if (skills.length === 0) return [];
  const fit = (d: BuilderDrill) => Math.abs((WEIGHT[d.difficulty ?? ""] ?? WEIGHT[level]) - WEIGHT[level]);
  const pools = skills.map((s) => {
    const list = drills.filter((d) => d.skill_tags.includes(s)).sort((a, b) => fit(a) - fit(b) || a.name.localeCompare(b.name));
    const rot = list.length ? shuffle % list.length : 0;
    return [...list.slice(rot), ...list.slice(0, rot)];
  });
  const picked: BuilderEntry[] = [];
  const used = new Set<string>();
  let total = 0;
  const target = minutes * 60;
  let progress = true;
  while (progress && picked.length < MAX_ENTRIES && total < target - 120) {
    progress = false;
    for (const pool of pools) {
      const next = pool.find((d) => !used.has(d.id) && total + entrySeconds(toEntry(d)) <= target + 180);
      if (!next) continue;
      const e = toEntry(next);
      used.add(next.id);
      picked.push(e);
      total += entrySeconds(e);
      progress = true;
      if (total >= target - 120) break;
    }
  }
  // Too few drills for those skills to fill the time: do more sets of what there is, a set at a time, up to six.
  let grew = true;
  while (grew && total < target - 120) {
    grew = false;
    for (const e of picked) {
      if (total >= target - 120) break;
      if ((e.sets ?? 1) >= 6) continue;
      const before = entrySeconds(e);
      e.sets = (e.sets ?? 1) + 1;
      total += entrySeconds(e) - before;
      grew = true;
    }
  }
  const blocks = blocksFor(picked.length);
  return picked.map((e, i) => ({ ...e, block: blocks[i] }));
}

export function defaultName(minutes: number, skills: string[], labels: Record<string, string>): string {
  const names = skills.map((s) => (labels[s] ?? s).toLowerCase());
  const what = names.length === 0 ? "" : names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `My ${minutes} minute ${what} workout`.replace(/\s+/g, " ").trim();
}

export type SaveInput = { id?: string | null; temporary?: boolean; name: string; skills: string[]; entries: { id?: string | null; drillId: string; sets: number | null; reps: number | null; seconds: number | null; block: string }[] };

/** What the server accepts: a name, one to fifteen entries, sane numbers. Returns the cleaned input or the first problem. */
export function cleanSave(input: SaveInput, knownSkills: string[]): { ok: true; value: SaveInput } | { ok: false; error: string } {
  const name = String(input.name ?? "").trim().slice(0, 60);
  if (!name) return { ok: false, error: "Give the workout a name." };
  if (!Array.isArray(input.entries) || input.entries.length === 0) return { ok: false, error: "Add at least one drill." };
  if (input.entries.length > MAX_ENTRIES) return { ok: false, error: `A workout holds up to ${MAX_ENTRIES} drills.` };
  const skills = [...new Set((input.skills ?? []).filter((s) => knownSkills.includes(s)))];
  const entries = input.entries.map((e) => ({
    id: e.id ?? null,
    drillId: String(e.drillId ?? ""),
    sets: e.sets === null || e.sets === undefined ? null : clampInt(e.sets, 1, 10),
    reps: e.reps === null || e.reps === undefined ? null : clampInt(e.reps, 1, 100),
    seconds: e.seconds === null || e.seconds === undefined ? null : clampInt(e.seconds, 5, 600),
    block: e.block === "warmup" || e.block === "finisher" ? e.block : "main",
  }));
  if (entries.some((e) => !e.drillId)) return { ok: false, error: "A drill is missing." };
  return { ok: true, value: { id: input.id ?? null, name, skills, entries } };
}
