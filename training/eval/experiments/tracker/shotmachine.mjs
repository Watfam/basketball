// Track-based shot-state machine. Consumes tracker snapshots (never raw boxes), segments shots by track identity, decides make/miss with the
// shipped V4 decision (decide.mjs), and records a state timeline per shot. Experimental and isolated: nothing in the app imports this.
//
// States per shot (a timeline, not a straight line: a shot may start in any state, and flight history is recorded when present, never required):
//   held -> release -> flight -> approach -> rim -> complete -> aftermath ; `uncertain` whenever the owner track is coasting.
import { makeDecider } from "./decide.mjs";

export const MACHINE = {
  closeGap: 40,          // reference frames without a zone observation from the shot's tracks: the shot's sightings have ended (the rule's gapFrames)
  link: { frames: 12, px: 40 },
  restFrames: 45,        // a ball that arrived by flight may rest this long before the rest counts as clutter
  rimNeighbourhood: 20,  // clutter is only judged this near the rim zone
  held: { speed: 2, below: 100 },
  release: { rise: 20, frames: 6 },
  approachBand: [50, 120],
  decisionNotBeforeHistory: 90,
};

export function createShotMachine({ rim, scene, rules: R, params = {}, keepAllViews = false }) {
  const M = { ...MACHINE, ...params, link: { ...MACHINE.link, ...params.link }, held: { ...MACHINE.held, ...params.held }, release: { ...MACHINE.release, ...params.release } };
  const decide = makeDecider(rim, R);
  const views = new Map();      // id -> latest view (its obs array is the tracker's own, append-only)
  const shots = [];             // creation order
  const shotOf = new Map();     // track id -> shot (owner or linked)
  let nextShot = 1;
  const box = (o) => ({ x1: o.x - o.w / 2, y1: o.y - o.h / 2, x2: o.x + o.w / 2, y2: o.y + o.h / 2 });
  const inZone = (o) => R.inZone(box(o), rim);
  const nearRim = (o) => Math.abs(o.x - rim.x) <= R.RULE.zoneHalfWidth + M.rimNeighbourhood && o.y >= rim.y - R.RULE.zoneAbove - M.rimNeighbourhood && o.y <= rim.y + R.RULE.zoneBelow + M.rimNeighbourhood;

  const shotViews = (s) => (s ? [...s.tracks].map((id) => views.get(id)).filter(Boolean) : []);
  /** Was any of these tracks seen moving in the restFrames before frame f? (a linked successor inherits its predecessors' history) */
  const recentMotion = (vs, f) => vs.some((v) => v.lastMoveF !== null && v.lastMoveF < f + 1 && f - v.lastMoveF <= M.restFrames);
  /** Real-time test used to OPEN a shot: a not-moving observation on an occupied spot, with no recent motion, is not a ball arriving. */
  const clutterNow = (v, o, f, s) => !o.moving && scene.occupied(o.x, o.y, f) && !recentMotion([v, ...shotViews(s)], f);
  /** Decision-time test (retroactive, never later than `now`): same idea judged with everything seen up to the call. `ctx` = the shot's track views. */
  const clutterObs = (v, o, now, ctx) => {
    if (!nearRim(o) || o.moving || !scene.occupied(o.x, o.y, now)) return false;
    for (const w of ctx && ctx.length ? ctx : [v]) for (let i = w.obs.length - 1; i >= 0; i -= 1) { const p = w.obs[i]; if (p.f >= o.f) continue; if (o.f - p.f > M.restFrames) break; if (p.moving) return false; }
    return true;
  };

  function tryLink(v, f) {
    for (const s of shots) {
      if (s.decided || s.closed) continue;
      for (const id of s.tracks) {
        const o = views.get(id); if (!o || o.id === v.id) continue;
        const gapF = v.startF - o.lastF;
        if (gapF < 0 || gapF > M.link.frames) continue;
        const e = o.est, dt = v.startF - e.f, last = o.obs[o.obs.length - 1];
        const dPred = Math.hypot(v.obs[0].x - (e.x + e.vx * dt), v.obs[0].y - (e.y + e.vy * dt)), dLast = Math.hypot(v.obs[0].x - last.x, v.obs[0].y - last.y);
        if (Math.min(dPred, dLast) <= M.link.px) return s;
      }
    }
    return null;
  }

  function evidence(s, now) {
    const owners = new Set(s.tracks);
    const seen = [], zoneObs = [];
    const tracks = new Set(owners);
    // evidence-only tracks: not owned by another shot, not clutter, with a below-net observation during this shot's window
    for (const [id, v] of views) {
      if (tracks.has(id) || (shotOf.has(id) && shotOf.get(id) !== s)) continue;
      for (const o of v.obs) if (o.f >= s.first && o.f < s.first + R.RULE.windowV2 && o.y >= rim.y + R.RULE.belowDrop && Math.abs(o.x - rim.x) <= R.RULE.belowHalfWidth && !clutterObs(v, o, now, [v])) { tracks.add(id); break; }
    }
    const ctx = shotViews(s);
    for (const id of tracks) {
      const v = views.get(id); if (!v) continue;
      for (const o of v.obs) { if (o.f < s.first - R.CROSS.lookBackFrames || clutterObs(v, o, now, owners.has(id) ? ctx : [v])) continue; seen.push({ f: o.f, box: box(o), id }); if (inZone(o) && owners.has(id)) zoneObs.push(o); }
    }
    seen.sort((a, b) => a.f - b.f || a.id - b.id);
    zoneObs.sort((a, b) => a.f - b.f);
    return { seen, zoneObs, tracks };
  }

  function timeline(s, decidedF) {
    const v = views.get(s.owner), obs = v ? v.obs : [], tl = [], flags = {};
    const firstZone = obs.findIndex((o) => o.f >= s.first && inZone(o));
    const pre = firstZone < 0 ? obs : obs.slice(0, firstZone);
    const mv = pre.findIndex((o) => o.moving);
    const heldObs = pre.slice(0, mv < 0 ? pre.length : mv).filter((o) => o.y > rim.y + M.held.below && o.speed < M.held.speed);
    if (heldObs.length >= 3) tl.push({ state: "held", from: heldObs[0].f, to: heldObs[heldObs.length - 1].f });
    flags.heldObserved = heldObs.length >= 3;
    if (mv > 0 && heldObs.length >= 3) { const r = pre[mv - 1]; tl.push({ state: "release", at: pre[mv].f }); flags.release = { f: r.f, x: r.x, y: r.y, observed: true }; } else flags.release = null;
    if (mv >= 0) tl.push({ state: "flight", from: pre[mv].f, to: pre[pre.length - 1]?.f ?? pre[mv].f });
    const ap = pre.find((o) => o.moving && o.y >= rim.y - M.approachBand[1] && o.y <= rim.y - M.approachBand[0]);
    if (ap) tl.push({ state: "approach", at: ap.f });
    tl.push({ state: "rim", from: s.first, to: s.last });
    tl.push({ state: "complete", at: decidedF });
    const after = obs.filter((o) => o.f > s.last + 20);
    if (after.length) tl.push({ state: "aftermath", from: after[0].f, to: after[after.length - 1].f });
    const unc = (v ? v.gaps : []).filter((g) => g.to >= s.first - 45 && g.from <= decidedF).map((g) => ({ state: "uncertain", from: g.from, to: g.to }));
    tl.push(...unc);
    const o0 = obs[0];
    flags.ballFirstSeenInZone = !!o0 && inZone(o0) && o0.f >= s.first - 2;
    flags.startedInWindow = !!o0 && o0.x > 8 && o0.y > 8;
    flags.reacquired = (v ? v.gaps.length : 0) > 0 || s.tracks.size > 1;
    const rises = pre.filter((o) => o.moving);
    const minI = rises.reduce((m, o, i) => (o.y < rises[m].y ? i : m), 0);
    flags.apex = rises.length > 4 && minI > 0 && minI < rises.length - 1 && rises[minI].y > 12 ? { f: rises[minI].f, x: rises[minI].x, y: rises[minI].y, observed: true } : null;
    flags.flightObservations = pre.filter((o) => o.moving).length;
    flags.uncertain = unc.length > 0;
    return { timeline: tl, flags };
  }

  /** Forget tracks that ended long ago and belong to no undecided shot (memory and scan cost stay bounded in a long session). */
  function prune(f) {
    const live = new Set(); for (const s of shots) if (!s.decided) for (const id of s.tracks) live.add(id);
    for (const [id, v] of views) if (v.state === "ended" || v.lastF < f - 1500) { if (v.lastF < f - 1500 && !live.has(id)) views.delete(id); }
  }

  function consider(f, now) {
    const out = [];
    for (const s of shots) {
      if (s.decided) continue;
      if (!s.closed && f - s.lastZoneF > M.closeGap) s.closed = true;
      if (!s.closed) break;                                  // decide in order: an earlier shot still open holds back the later ones
      if (f < s.first + R.RULE.windowV2 - 1 || scene.historyFrames(f) < M.decisionNotBeforeHistory) break;   // not decidable yet: do not build evidence
      const ev = evidence(s, now);
      const first = ev.zoneObs.length ? ev.zoneObs[0].f : null;
      if (first === null) { if (f >= s.first + R.RULE.windowV2 - 1) { s.decided = true; s.retracted = true; } else break; continue; }
      if (f < first + R.RULE.windowV2 - 1 || scene.historyFrames(f) < M.decisionNotBeforeHistory) break;
      const last = ev.zoneObs[ev.zoneObs.length - 1].f;
      const history = ev.seen.map((x) => ({ f: x.f, box: x.box }));
      const call = decide({ first, last, firstMs: (first * 1000) / R.REFERENCE_FPS, sightings: ev.zoneObs.length }, history);
      s.decided = true;
      const t = timeline({ ...s, first, last }, f);
      out.push({ ...call, shotId: s.id, tracks: [...ev.tracks], owner: s.owner, decidedAt: f, timeline: t.timeline, flags: t.flags, evidenceObservations: ev.seen.length, evidence: ev.seen.map((x) => ({ f: x.f, id: x.id, x: (x.box.x1 + x.box.x2) / 2, y: (x.box.y1 + x.box.y2) / 2 })) });
    }
    return out;
  }

  return {
    config: M,
    /** One tracker snapshot. Returns the shots decided on this frame. */
    push(snap) {
      const f = snap.f;
      for (const v of snap.tracks) views.set(v.id, v);
      if (!keepAllViews && f % 128 === 0) prune(f);
      for (const v of snap.tracks) {
        const o = v.obs[v.obs.length - 1];
        if (o.f !== f || !inZone(o)) continue;
        let s = shotOf.get(v.id) ?? tryLink(v, f);
        if (clutterNow(v, o, f, s)) continue;
        if (!s) {
          const cur = [...shots].reverse().find((x) => !x.decided && !x.closed);
          if (cur && f - cur.lastZoneF <= M.closeGap) s = cur;
          else {
            if (cur) cur.closed = true;
            s = { id: nextShot++, owner: v.id, tracks: new Set(), first: f, last: f, lastZoneF: f, sightings: 0, closed: false, decided: false };
            shots.push(s);
          }
        }
        s.tracks.add(v.id); shotOf.set(v.id, s); s.sightings += 1; s.last = f; s.lastZoneF = f;
      }
      return consider(f, f);
    },
    /** End of the stream: decide whatever is waiting, with what has been seen. */
    flush(f) {
      const out = [];
      for (const s of shots) {
        if (s.decided) continue;
        s.closed = true;
        const ev = evidence(s, f);
        if (!ev.zoneObs.length) { s.decided = true; s.retracted = true; continue; }
        const first = ev.zoneObs[0].f, last = ev.zoneObs[ev.zoneObs.length - 1].f;
        const call = decide({ first, last, firstMs: (first * 1000) / R.REFERENCE_FPS, sightings: ev.zoneObs.length }, ev.seen.map((x) => ({ f: x.f, box: x.box })));
        s.decided = true;
        const t = timeline({ ...s, first, last }, f);
        out.push({ ...call, shotId: s.id, tracks: [...ev.tracks], owner: s.owner, decidedAt: f, timeline: t.timeline, flags: t.flags, evidenceObservations: ev.seen.length, evidence: ev.seen.map((x) => ({ f: x.f, id: x.id, x: (x.box.x1 + x.box.x2) / 2, y: (x.box.y1 + x.box.y2) / 2 })) });
      }
      return out;
    },
    /** Is this track's observation at frame f clutter, judged at `now` with the shot context? (evaluation helper) */
    clutterAt(id, f, now) { const v = views.get(id); if (!v) return null; const o = v.obs.find((x) => x.f === f); if (!o) return null; return clutterObs(v, o, now, shotViews(shotOf.get(id))); },
    shots: () => shots,
  };
}
