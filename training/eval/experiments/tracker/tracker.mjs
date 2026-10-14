// Persistent ball tracker. Consumes detections per processed frame, keeps tracks with identity, lifecycle, motion state, uncertainty,
// OBSERVED points and (separately) PREDICTED and RECONSTRUCTED points. It knows nothing about the rim, shots or make/miss.
// Experimental and isolated: nothing in the app imports this.
import { createMotion, interpolate } from "./motion.mjs";
import { createSpotMemory } from "./spotmemory.mjs";

export const DEFAULTS = {
  associator: "kalman",          // "kalman" | "nearest_last" | "cv_nearest"
  model: "bal",                  // cv | ca | bal | hyb (default until the registered selection is run)
  modelParams: {},               // q2, q3, R
  interpW: 4,                    // points each side for the gap reconstruction
  gate: { chi2: 9.21, floor: 6, cap: 30, maneuver: 2.0, ballFraction: 0.5, lastObs: true },   // round 3 reach: max(floor, ballFraction x track width, maneuver x speed x dt); maneuver 0, ballFraction 0, lastObs false reproduce round 2
  sizeRatio: [0.5, 2],
  weights: { size: 0.4, score: 0.5, fixedSigma: 4 },
  restartSpeed: 6,               // px per reference frame: a stationary track that steps this fast restarts its motion model (criteria-addendum-1)
  releaseAllowance: 10,          // px per reference frame of extra velocity uncertainty for a stationary track (criteria-addendum-1)
  confirmHits: 3,
  coastMax: 8,
  motion: { window: 20, spread: 10 },
  spot: { cell: 8, window: 1200, minHistory: 90, share: 0.03 },
  retainFrames: 1500,            // ended tracks older than this are forgotten (Infinity keeps everything, for evaluation)
};

const cx = (b) => (b.x1 + b.x2) / 2, cy = (b) => (b.y1 + b.y2) / 2, wd = (b) => b.x2 - b.x1, ht = (b) => b.y2 - b.y1;
const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function createTracker(options = {}) {
  const P = { ...DEFAULTS, ...options, gate: { ...DEFAULTS.gate, ...options.gate }, weights: { ...DEFAULTS.weights, ...options.weights }, motion: { ...DEFAULTS.motion, ...options.motion }, spot: { ...DEFAULTS.spot, ...options.spot } };
  const R = { q2: 0.2, q3: 0.005, R: 2.25, ...P.modelParams }.R;
  const spot = createSpotMemory(P.spot);
  const tracks = new Map(); let live = []; let nextId = 1;

  function spread(t, f) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = t.obs.length - 1; i >= 0 && f - t.obs[i].f < P.motion.window; i -= 1) { const o = t.obs[i]; x0 = Math.min(x0, o.x); x1 = Math.max(x1, o.x); y0 = Math.min(y0, o.y); y1 = Math.max(y1, o.y); }
    return Math.hypot(x1 - x0, y1 - y0);
  }
  function predictFor(t, f) {
    const last = t.obs[t.obs.length - 1], dt = f - last.f;
    if (P.associator === "kalman") { const p = t.model.predict(f), extra = t.motion === "stationary" ? (P.releaseAllowance * dt) ** 2 : 0; return { x: p.x, y: p.y, sx2: p.varX + R + extra, sy2: p.varY + R + extra, reach: Math.max(P.gate.floor, P.gate.ballFraction * widthRef(t), P.gate.maneuver * Math.hypot(p.vx ?? 0, p.vy ?? 0) * dt) }; }
    if (P.associator === "cv_nearest" && t.obs.length > 1) { const q = t.obs[t.obs.length - 2]; return { x: last.x + ((last.x - q.x) / (last.f - q.f)) * dt, y: last.y + ((last.y - q.y) / (last.f - q.f)) * dt, fixed: true }; }
    return { x: last.x, y: last.y, fixed: true };
  }
  function widthRef(t) { return median(t.obs.slice(-5).map((o) => o.w)); }
  function view(t, f) {
    const e = t.model.estimate(), last = t.obs[t.obs.length - 1];
    return { id: t.id, state: t.state, motion: t.motion, lastF: last.f, startF: t.startF, obs: t.obs, predicted: t.predicted, gaps: t.gaps,
      est: { f: e.f, x: e.x, y: e.y, vx: e.vx, vy: e.vy, ax: e.ax, ay: e.ay }, sigma: Math.sqrt(t.model.predict(f).varX + R), framesSinceObs: t.framesSinceObs, occlusion: { ...t.occlusion },
      confidence: t.scoreSum / t.obs.length, lastMoveF: t.lastMoveF, stats: { hits: t.obs.length, misses: t.misses, age: last.f - t.startF, meanScore: t.scoreSum / t.obs.length, medianWidth: widthRef(t) } };
  }

  return {
    config: P,
    scene: { occupied: (x, y, f) => spot.occupied(x, y, f), occupancy: (x, y, f) => spot.occupancy(x, y, f), historyFrames: (f) => spot.historyFrames(f) },
    track: (id) => tracks.get(id) ?? null,
    all: () => [...tracks.values()],

    push(f, boxes) {
      const events = [], active = [];
      // ---- candidate pairs
      const pairs = [];
      live.forEach((t, ti) => {
        const dt = f - t.obs[t.obs.length - 1].f, p = predictFor(t, f), wref = widthRef(t), cap = P.gate.cap * dt;
        boxes.forEach((b, bi) => {
          const x = cx(b), y = cy(b), dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy), last = t.obs[t.obs.length - 1];
          if (Math.hypot(x - last.x, y - last.y) > cap) return;
          const ratio = wd(b) / wref;
          if (ratio < P.sizeRatio[0] || ratio > P.sizeRatio[1]) return;
          let m2;
          if (p.fixed) { if (d > cap) return; m2 = (d / P.weights.fixedSigma) ** 2; }
          else { const sx2 = Math.max(p.sx2, 1.98 ** 2), sy2 = Math.max(p.sy2, 1.98 ** 2); m2 = dx * dx / sx2 + dy * dy / sy2; if (m2 > P.gate.chi2 && d > p.reach && (!P.gate.lastObs || Math.hypot(x - last.x, y - last.y) > Math.max(P.gate.floor, P.gate.ballFraction * wref))) return; }
          const cost = m2 + (Math.log(ratio) / P.weights.size) ** 2 + ((1 - b.score) / P.weights.score) ** 2;
          pairs.push([cost, ti, bi]);
        });
      });
      pairs.sort((a, b) => a[0] - b[0]);
      const usedT = new Set(), usedB = new Set(), assigned = [];
      for (const [, ti, bi] of pairs) { if (usedT.has(ti) || usedB.has(bi)) continue; usedT.add(ti); usedB.add(bi); assigned.push([ti, bi]); }

      // ---- update matched tracks
      for (const [ti, bi] of assigned) {
        const t = live[ti], b = boxes[bi], last = t.obs[t.obs.length - 1], dt = f - last.f, x = cx(b), y = cy(b);
        const wasCoasting = t.state === "coasting";
        if (t.motion === "stationary" && Math.hypot(x - last.x, y - last.y) / dt >= P.restartSpeed) t.model.init({ x: last.x, y: last.y }, last.f);
        const o = { f, x, y, w: wd(b), h: ht(b), score: b.score, moving: false, speed: Math.hypot(x - last.x, y - last.y) / dt };
        if (wasCoasting) {
          const before = t.obs.slice(-P.interpW), after = [{ f, x, y }];
          const rec = [];
          for (let g = last.f + 1; g < f; g += 1) { const r = interpolate(P.model === "hyb" ? "hyb" : P.model, P.interpW, before, after, g); if (r) rec.push({ f: g, x: r.x, y: r.y, reconstructed: true }); }
          t.gaps.push({ from: last.f + 1, to: f - 1, predicted: t.predicted.slice(), reconstructed: rec });
          t.predicted = []; t.occlusion = { status: "reacquired", since: last.f, gaps: t.occlusion.gaps };
        } else t.occlusion = { ...t.occlusion, status: "none" };
        t.obs.push(o);
        const sp = spread(t, f);
        o.moving = sp >= P.motion.spread;
        Object.freeze(o);
        t.motion = o.moving ? "moving" : f - t.startF >= P.motion.window ? "stationary" : "unknown";
        if (o.moving) t.lastMoveF = f;
        t.model.update({ x, y }, f);
        t.scoreSum += b.score; t.framesSinceObs = 0;
        if (t.state === "tentative" && (t.obs.length >= P.confirmHits || o.moving)) { t.state = "confirmed"; events.push({ type: "confirm", id: t.id, f }); }
        else if (wasCoasting) { t.state = "confirmed"; events.push({ type: "reacquire", id: t.id, f }); }
        active.push(t);
      }
      // ---- misses
      const next = [];
      live.forEach((t, ti) => {
        if (usedT.has(ti)) { next.push(t); return; }
        const last = t.obs[t.obs.length - 1];
        t.framesSinceObs = f - last.f; t.misses += 1;
        if (t.state === "tentative" || t.framesSinceObs > P.coastMax) { t.state = "ended"; events.push({ type: "end", id: t.id, f }); return; }
        if (t.state !== "coasting") { t.state = "coasting"; t.occlusion = { status: "occluded", since: last.f, gaps: t.occlusion.gaps + 1 }; events.push({ type: "coast", id: t.id, f }); }
        const p = t.model.predict(f);
        t.predicted.push({ f, x: p.x, y: p.y, sigma: Math.sqrt(p.varX + R), predicted: true });
        next.push(t); active.push(t);
      });
      // ---- new tracks
      boxes.forEach((b, bi) => {
        if (usedB.has(bi)) return;
        const x = cx(b), y = cy(b), o = Object.freeze({ f, x, y, w: wd(b), h: ht(b), score: b.score, moving: false, speed: 0 });
        const t = { id: nextId++, state: "tentative", motion: "unknown", obs: [o], predicted: [], gaps: [], startF: f, misses: 0, scoreSum: b.score, framesSinceObs: 0, lastMoveF: null, occlusion: { status: "none", since: null, gaps: 0 }, model: createMotion(P.model, P.modelParams) };
        t.model.init({ x, y }, f);
        tracks.set(t.id, t); next.push(t); active.push(t); events.push({ type: "start", id: t.id, f });
      });
      live = next;
      if (f % 128 === 0 && Number.isFinite(P.retainFrames)) for (const [id, t] of tracks) if (t.state === "ended" && f - t.obs[t.obs.length - 1].f > P.retainFrames) tracks.delete(id);
      spot.add(f, boxes.map((b) => ({ x: cx(b), y: cy(b) })));
      return { f, tracks: active.map((t) => view(t, f)), events };
    },
  };
}
