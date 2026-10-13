/**
 * What the camera did in real sets, from the saved sessions: how many shots
 * it rang as unsure, how many calls the player changed in review, how many
 * shots were added by hand because it missed them, and whether its makes run
 * higher than the final ones. For the Camera lab; pure, so it is tested.
 *
 * "Changed" is only what a player changed when reviewing. A set saved
 * without looking shows none, so it is not evidence the camera was right.
 */

export type RealSetSession = {
  id: string;
  player_id: string;
  started_at: string;
  ended_at: string | null;
  label: string | null;
  attempts: number;
  makes: number;
  rule_version: string | null;
  model_version: string | null;
  rim_x: number | null;
  rim_y: number | null;
  is_test: boolean;
};

export type RealSetShot = {
  session_id: string;
  source: string;
  made: boolean;
  detected_made: boolean | null;
  flagged: boolean;
  added_by_hand: boolean;
};

export type RealSet = {
  id: string;
  playerId: string;
  startedAt: string;
  minutes: number | null;
  label: string | null;
  attempts: number;
  makes: number;
  /** Shots the camera counted (the rest were added by hand). */
  cameraShots: number;
  addedByHand: number;
  ringed: number;
  changed: number;
  /** Makes the camera called, and what they ended up as, among the shots it counted. */
  cameraSaidMakes: number;
  finalMakes: number;
  ruleVersion: string | null;
  modelVersion: string | null;
  rimX: number | null;
  rimY: number | null;
  isTest: boolean;
};

export type RealSetTotals = {
  sets: number;
  cameraShots: number;
  ringed: number;
  changed: number;
  addedByHand: number;
  cameraSaidMakes: number;
  finalMakes: number;
};

export function summarizeRealSets(sessions: RealSetSession[], shots: RealSetShot[]): RealSet[] {
  const bySession = new Map<string, RealSetShot[]>();
  for (const s of shots) bySession.set(s.session_id, [...(bySession.get(s.session_id) ?? []), s]);
  return sessions.map((s) => {
    const mine = bySession.get(s.id) ?? [];
    const camera = mine.filter((x) => x.source === "camera");
    const minutes = s.ended_at ? Math.round(((Date.parse(s.ended_at) - Date.parse(s.started_at)) / 60000) * 10) / 10 : null;
    return {
      id: s.id,
      playerId: s.player_id,
      startedAt: s.started_at,
      minutes,
      label: s.label,
      attempts: s.attempts,
      makes: s.makes,
      cameraShots: camera.length,
      addedByHand: mine.filter((x) => x.added_by_hand).length,
      ringed: mine.filter((x) => x.flagged).length,
      changed: camera.filter((x) => x.detected_made !== null && x.detected_made !== x.made).length,
      cameraSaidMakes: camera.filter((x) => x.detected_made === true).length,
      finalMakes: camera.filter((x) => x.made).length,
      ruleVersion: s.rule_version,
      modelVersion: s.model_version,
      rimX: s.rim_x === null ? null : Number(s.rim_x),
      rimY: s.rim_y === null ? null : Number(s.rim_y),
      isTest: s.is_test,
    };
  });
}

export function totalsOf(sets: RealSet[]): RealSetTotals {
  const sum = (f: (s: RealSet) => number) => sets.reduce((a, s) => a + f(s), 0);
  return {
    sets: sets.length,
    cameraShots: sum((s) => s.cameraShots),
    ringed: sum((s) => s.ringed),
    changed: sum((s) => s.changed),
    addedByHand: sum((s) => s.addedByHand),
    cameraSaidMakes: sum((s) => s.cameraSaidMakes),
    finalMakes: sum((s) => s.finalMakes),
  };
}
