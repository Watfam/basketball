import { describeGoal, type Goal } from "./goals.ts";
import { formatPercentage } from "./shooting.ts";

/**
 * The words on the Shoot tab's setup card. Pure, so they are tested without a screen. The card says what pressing Start will do (the drill, how it
 * is counted, the goal, and how the last sets went), and each part has one short name.
 */
export type Setup = { label: string; goal: Goal | null };

export const countingName = (camera: boolean) => (camera ? "Camera" : "Tap counter");
export const goalName = (goal: Goal | null) => (goal ? describeGoal(goal) : "No goal");
export const drillName = (label: string) => label.trim() || "Shooting";

/** The drill to go again with: what the player picked, else the one they used last, else none yet. */
export function effectiveLabel(picked: string | null, recent: Setup[]): string | null {
  if (picked !== null) return picked;
  return recent.length > 0 ? recent[0].label : null;
}

/** "Camera · 50 shots · last 6 sets 53%". The last sets are of this drill (or of everything, when no drill is named). */
export function cardDetail(input: { camera: boolean | null; goal: Goal | null; six: { pct: number; sessions: number } | null; name: string }): string {
  const parts: string[] = [];
  if (input.camera !== null) parts.push(countingName(input.camera));
  parts.push(input.goal ? goalName(input.goal) : "no goal");
  if (input.six) parts.push(`last ${input.six.sessions === 1 ? "set" : `${input.six.sessions} sets`} ${formatPercentage(input.six.pct)}`);
  return parts.join(" · ");
}

/** The card's small heading: "Go again" while it is still the last setup, "Your setup" once the player has changed something. */
export function cardEyebrow(changed: boolean, hasRecent: boolean): string {
  return changed || !hasRecent ? "Your setup" : "Go again";
}

/** Recent setups other than the one on the card, for the "Recent" group of the drill picker. */
export function otherRecent(recent: Setup[], currentLabel: string, currentGoal: Goal | null): Setup[] {
  const key = (s: Setup) => `${s.label.trim().toLowerCase()}|${s.goal ? describeGoal(s.goal) : ""}`;
  const here = key({ label: currentLabel, goal: currentGoal });
  return recent.filter((r) => key(r) !== here);
}

export const GOAL_HELP: Record<Goal["kind"], string> = {
  shots: "Ends after this many shots",
  makes: "Ends after this many makes",
  time: "Ends after this many minutes",
  streak: "Ends when you make this many in a row",
};
