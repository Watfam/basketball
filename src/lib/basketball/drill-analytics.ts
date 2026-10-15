import { CATEGORY_LABELS, CATEGORY_ORDER, spotOf, type ShootingCategory } from "./drill-shooting.ts";
import type { TrackedMetrics } from "./drill-tracking.ts";

/**
 * What a player's tracked drills can and cannot say, from the existing workout log. Only genuinely comparable results are compared: the same drill
 * and spot against itself over time, or two kinds of shot from the SAME spot. Everything else is shown side by side with its sample size and no
 * verdict. Volume, tiredness and a different prescription are named as reasons a number can move without any change in skill, and nothing here
 * says driveway results carry over to games.
 */

export type TrackedRow = { logId: string; workoutSessionId: string; at: string; drillName: string; metrics: TrackedMetrics };

export const NOT_A_GAME_CLAIM = "These are results from practice drills. They do not show how the same shots go in a game.";
export const VOLUME_CAVEAT = "More or fewer shots, a different prescription, or being tired can move a make rate without any change in skill.";
export const MIN_SHOTS = 20;
export const MIN_SHOTS_FOR_A_DIFFERENCE = 30;

export type Interval = { lo: number; hi: number };
export function wilson(k: number, n: number, z = 1.96): Interval {
  if (n <= 0) return { lo: 0, hi: 1 };
  const p = k / n, d = 1 + (z * z) / n, c = (p + (z * z) / (2 * n)) / d, h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { lo: Math.max(0, c - h), hi: Math.min(1, c + h) };
}
const pct = (k: number, n: number) => (n > 0 ? Math.round((100 * k) / n) : null);
const overlap = (a: Interval, b: Interval) => a.lo <= b.hi && b.lo <= a.hi;

export type CategoryStat = {
  category: ShootingCategory; label: string; drills: number; attempts: number; makes: number; pct: number | null; ci: Interval;
  /** How the shots were counted, summed over the drills. */
  counted: { camera: number; taps: number; mixed: number };
  /** Calls the player changed and shots the player added, summed. */
  playerChanges: { flipped: number; added: number };
  enough: boolean;
};

/** Makes and attempts by kind of shot. Drills with no shooting category are left out; a category no drill has been tracked in does not appear. */
export function categoryStats(rows: TrackedRow[]): CategoryStat[] {
  const out: CategoryStat[] = [];
  for (const c of CATEGORY_ORDER) {
    const mine = rows.filter((r) => r.metrics.category === c);
    if (mine.length === 0) continue;
    const attempts = mine.reduce((a, r) => a + r.metrics.attempts, 0), makes = mine.reduce((a, r) => a + r.metrics.makes, 0);
    out.push({
      category: c, label: CATEGORY_LABELS[c], drills: mine.length, attempts, makes, pct: pct(makes, attempts), ci: wilson(makes, attempts),
      counted: { camera: mine.filter((r) => r.metrics.tracking.source === "camera").length, taps: mine.filter((r) => r.metrics.tracking.source === "taps").length, mixed: mine.filter((r) => r.metrics.tracking.source === "mixed").length },
      playerChanges: { flipped: mine.reduce((a, r) => a + r.metrics.tracking.flipped, 0), added: mine.reduce((a, r) => a + r.metrics.tracking.added_by_hand, 0) },
      enough: attempts >= MIN_SHOTS,
    });
  }
  return out;
}

export type SeriesPoint = { at: string; makes: number; attempts: number; pct: number | null; ci: Interval; targetKind: "shots" | "time" | null; targetValue: number | null };
export type Series = { key: string; drillName: string; variant: string | null; category: ShootingCategory | null; points: SeriesPoint[] };

/** The same drill entry (name and variant) over time, oldest first. */
export function drillSeries(rows: TrackedRow[]): Series[] {
  const by = new Map<string, TrackedRow[]>();
  for (const r of rows) { const k = `${r.drillName.toLowerCase()}|${(r.metrics.variant ?? "").toLowerCase()}`; (by.get(k) ?? by.set(k, []).get(k)!).push(r); }
  return [...by.entries()].map(([key, rs]) => {
    const sorted = [...rs].sort((a, b) => a.at.localeCompare(b.at));
    return { key, drillName: sorted[0].drillName, variant: sorted[0].metrics.variant, category: sorted[0].metrics.category, points: sorted.map((r) => ({ at: r.at, makes: r.metrics.makes, attempts: r.metrics.attempts, pct: pct(r.metrics.makes, r.metrics.attempts), ci: wilson(r.metrics.makes, r.metrics.attempts), targetKind: r.metrics.target?.kind ?? null, targetValue: r.metrics.target?.value ?? null })) };
  });
}

export type Statement = { kind: "supported" | "not_distinguishable" | "not_comparable" | "too_few" | "single"; text: string; caveats: string[] };

/** The first against the latest result of one drill entry. "Supported" only when both are big enough and their intervals do not overlap. */
export function describeSeries(s: Series): Statement {
  const p = s.points;
  const name = `${s.drillName}${s.variant ? ` (${s.variant})` : ""}`;
  if (p.length < 2) return { kind: "single", text: `${name}: one tracked result so far (${p[0]?.makes} of ${p[0]?.attempts}). A trend needs at least two.`, caveats: [] };
  const a = p[0], b = p[p.length - 1], caveats = [VOLUME_CAVEAT, NOT_A_GAME_CLAIM];
  const label = (x: SeriesPoint) => `${x.pct}% of ${x.attempts}`;
  if (a.targetKind !== b.targetKind) return { kind: "not_comparable", text: `${name}: not compared. One result was shot to a clock and the other to a number of shots, which are different challenges.`, caveats };
  if (a.attempts < MIN_SHOTS || b.attempts < MIN_SHOTS) return { kind: "too_few", text: `${name}: ${label(a)} first, ${label(b)} latest. Too few shots in one of them (under ${MIN_SHOTS}) to say anything about a change.`, caveats };
  if (a.targetValue && b.targetValue && Math.abs(b.targetValue - a.targetValue) / a.targetValue > 0.25) caveats.unshift("The amount of work in the two results was quite different.");
  const text = `${name}: ${label(a)} first, ${label(b)} latest`;
  if (a.attempts >= MIN_SHOTS_FOR_A_DIFFERENCE && b.attempts >= MIN_SHOTS_FOR_A_DIFFERENCE && !overlap(a.ci, b.ci)) {
    return { kind: "supported", text: `${text}. That gap is larger than normal shot-to-shot variation would usually give (${b.pct! > a.pct! ? "higher" : "lower"} the second time).`, caveats };
  }
  return { kind: "not_distinguishable", text: `${text}. That is within normal variation, so it is not a change you can rely on.`, caveats };
}

export type SpotComparison = { spot: string; a: { label: string; pct: number | null; attempts: number }; b: { label: string; pct: number | null; attempts: number }; statement: Statement };

/** Two kinds of shot compared ONLY from the same spot on the floor; spots with too few shots in either kind, or no named spot, are not compared. */
export function compareCategoriesAtSameSpot(rows: TrackedRow[], catA: ShootingCategory, catB: ShootingCategory): SpotComparison[] {
  const spotName = (r: TrackedRow) => { const s = spotOf(r.drillName, r.metrics.variant); return s.family === "unspecified" ? null : s.family === "wing" || s.family === "elbow" ? `${s.side ? `${s.side} ` : ""}${s.family}` : s.family.replace(/_/g, " "); };
  const spots = new Set(rows.map(spotName).filter((x): x is string => !!x));
  const out: SpotComparison[] = [];
  for (const spot of spots) {
    const take = (c: ShootingCategory) => { const rs = rows.filter((r) => r.metrics.category === c && spotName(r) === spot); const attempts = rs.reduce((a, r) => a + r.metrics.attempts, 0), makes = rs.reduce((a, r) => a + r.metrics.makes, 0); return { attempts, makes }; };
    const A = take(catA), B = take(catB);
    if (A.attempts < MIN_SHOTS || B.attempts < MIN_SHOTS) continue;
    const ciA = wilson(A.makes, A.attempts), ciB = wilson(B.makes, B.attempts);
    const big = A.attempts >= MIN_SHOTS_FOR_A_DIFFERENCE && B.attempts >= MIN_SHOTS_FOR_A_DIFFERENCE;
    const la = `${CATEGORY_LABELS[catA]} ${pct(A.makes, A.attempts)}% of ${A.attempts}`, lb = `${CATEGORY_LABELS[catB]} ${pct(B.makes, B.attempts)}% of ${B.attempts}`;
    const supported = big && !overlap(ciA, ciB);
    out.push({
      spot, a: { label: CATEGORY_LABELS[catA], pct: pct(A.makes, A.attempts), attempts: A.attempts }, b: { label: CATEGORY_LABELS[catB], pct: pct(B.makes, B.attempts), attempts: B.attempts },
      statement: { kind: supported ? "supported" : "not_distinguishable", text: `From the ${spot}: ${la}; ${lb}. ${supported ? "That gap is larger than normal variation would usually give." : "That is within normal variation."}`, caveats: ["These are different shots, so a gap is expected and is not a verdict on either skill.", VOLUME_CAVEAT, NOT_A_GAME_CLAIM] },
    });
  }
  return out;
}

/** Said whenever kinds of shot are listed together: why no overall ranking is given. */
export const CATEGORY_COMPARISON_NOTE = "Different kinds of shot are different shots, from different spots. They are shown side by side, and compared only when they were shot from the same spot.";
