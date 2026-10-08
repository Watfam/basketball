/**
 * The one thing Today puts first.
 *
 * Today used to stack six to eight panels (shoot card, combine prompt,
 * quote, every program, "Up next", more workouts) and leave the kid to
 * work out which mattered. Now one card says what to do next, picked in
 * this order:
 *
 * 1. Finish what you started (an unfinished workout).
 * 2. The first combine: until it's done every rating is a guess.
 * 3. Today's program day, when on a program.
 * 4. A combine retest that's due.
 * 5. The workout picked for you.
 * 6. Otherwise, go shoot.
 *
 * A snoozed combine steps aside until the snooze runs out.
 */

export type NextUp =
  | { kind: "resume"; sessionId: string; name: string }
  | { kind: "combine"; everDone: boolean }
  | { kind: "program" }
  | { kind: "workout" }
  | { kind: "shoot" };

export function pickNextUp(input: {
  unfinished: { id: string; name: string }[];
  combine: { due: boolean; snoozed: boolean; everDone: boolean };
  programDayReady: boolean;
  hasWorkout: boolean;
}): NextUp {
  const { unfinished, combine, programDayReady, hasWorkout } = input;
  if (unfinished.length > 0) return { kind: "resume", sessionId: unfinished[0].id, name: unfinished[0].name };
  const combineWanted = combine.due && !combine.snoozed;
  if (combineWanted && !combine.everDone) return { kind: "combine", everDone: false };
  if (programDayReady) return { kind: "program" };
  if (combineWanted) return { kind: "combine", everDone: true };
  if (hasWorkout) return { kind: "workout" };
  return { kind: "shoot" };
}
