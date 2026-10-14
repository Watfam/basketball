// A replica of the V4 decision ASSEMBLY from src/lib/vision/shotRules.ts (createShotCounter's `decide`), built from the SHIPPED functions
// (callShot, flagReasons, fallSpeed, rimCrossing, median and the RULE/FALL/CROSS constants, loaded unmodified). Only the glue is copied:
// the counted number and the session's learned rim-crossing centre. `legacyCounter` is a copy of the zone-grouping around it; feeding it
// reproduces createShotCounter exactly (criterion T13), which is what licenses the shot machine to reuse this decider.
export function makeDecider(rim, R) {
  let n = 0;
  const crossings = [];
  return function decide(shot, history) {
    const counted = shot.sightings >= R.RULE.minZoneSightings;
    if (counted) n += 1;
    const called = R.callShot(history, shot.first, shot.last, rim);
    const reasons = R.flagReasons({ ...called, zoneSightings: shot.sightings });
    const fall = called.v2 === "make" ? R.fallSpeed(history, shot.first, rim) : null;
    const v3 = called.v2 === "make" && fall !== null && fall > R.FALL.netMax ? "miss" : called.v2;
    const cross = called.v2 === "make" ? R.rimCrossing(history, shot.first, rim) : null;
    if (cross !== null && counted) crossings.push(cross);
    const learned = crossings.length >= R.CROSS.minCrossings;
    const crossCentre = learned ? R.median(crossings) : null;
    const v4 = cross !== null && Math.abs(cross - (crossCentre ?? 0)) > (learned ? R.CROSS.limit : R.CROSS.earlyLimit) ? "miss" : called.v2;
    return { n: counted ? n : 0, first: shot.first, last: shot.last, firstMs: shot.firstMs, zoneSightings: shot.sightings, counted, ...called, v3, v4, cross, crossCentre, fall, flagged: reasons.length > 0, flagReasons: reasons };
  };
}

/** The legacy zone grouping (a copy of createShotCounter's push/flush) around the replica decider. */
export function legacyCounter(rim, R) {
  const decide = makeDecider(rim, R);
  let history = [], open = null, closed = [], lastFrame = Number.NEGATIVE_INFINITY;
  return {
    push(timeMs, balls) {
      const f = Math.round((timeMs * R.REFERENCE_FPS) / 1000);
      if (f <= lastFrame) return [];
      lastFrame = f;
      if (open && f - open.last > R.RULE.gapFrames) { closed.push(open); open = null; }
      for (const box of balls) history.push({ f, box });
      const zoneHits = balls.filter((b) => R.inZone(b, rim)).length;
      if (zoneHits) { if (open) { open.last = f; open.sightings += zoneHits; } else open = { first: f, last: f, firstMs: timeMs, sightings: zoneHits }; }
      const done = [];
      while (closed.length && f >= closed[0].first + R.RULE.windowV2 - 1) done.push(decide(closed.shift(), history));
      const keepFrom = (closed.length ? closed[0].first : open ? open.first : f - R.RULE.windowV2) - R.CROSS.lookBackFrames;
      if (history.length && history[0].f < keepFrom) history = history.filter((s) => s.f >= keepFrom);
      return done;
    },
    flush() { if (open) closed.push(open); open = null; const done = closed.map((s) => decide(s, history)); closed = []; return done; },
  };
}
