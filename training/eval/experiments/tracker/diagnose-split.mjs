// POST-HOC: where do the extra counted shots of the track machine come from? Exploratory; changes nothing registered.
import { loadVision } from "../../lib/transpile.mjs";
import { loadRegistry, readJSON } from "../../lib/registry.mjs";
import { legacyCounter } from "./decide.mjs";
import { createTracker } from "./tracker.mjs";
import { createShotMachine } from "./shotmachine.mjs";
const V = await loadVision(), R = V.shotRules, reg = loadRegistry(), sel = readJSON("training/eval/experiments/tracker/results/selection.json");
const cx = (b) => (b.x1 + b.x2) / 2, cy = (b) => (b.y1 + b.y2) / 2;
const agg = { new_shots: 0, matches_baseline_shot: 0, split_fragment_within_60f_after_a_match: 0, isolated_extra: 0, baseline_shots_lost: 0, extra_zone_sightings: [], extra_tracks_obs: [], extra_owner_confirmed: 0, extra_owner_tentative: 0, extra_owner_motion: {} };
const examples = [];
for (const id of ["IMG_4839", "IMG_4840", "IMG_4867", "IMG_4872", "IMG_4874"]) {
  const clip = reg.clips.find((c) => c.id === id), d = readJSON(clip.detections.ball6), [rx, ry] = clip.window.rim_native;
  const rim = V.counting.createCountingCore({ frameW: 1920, frameH: 1080, rim: { x: rx / 1920, y: ry / 1080 }, scale: clip.window.scale, autoSize: false }).window.rim;
  const byF = new Map(); for (const x of d.detections) (byF.get(x.f) ?? byF.set(x.f, []).get(x.f)).push(x);
  const lc = legacyCounter(rim, R), tr = createTracker({ associator: "kalman", model: sel.selected.model, modelParams: sel.selected.params, interpW: sel.selected.interpolation_W }), M = createShotMachine({ rim, scene: tr.scene, rules: R });
  const base = [], mine = [];
  for (let f = 0; f < d.frames; f += 1) { base.push(...lc.push((f * 1000) / R.REFERENCE_FPS, byF.get(f) ?? [])); mine.push(...M.push(tr.push(f, byF.get(f) ?? []))); }
  base.push(...lc.flush()); mine.push(...M.flush(d.frames - 1));
  const b = base.filter((c) => c.counted), m = mine.filter((c) => c.counted);
  const matched = new Set();
  for (const s of m) {
    agg.new_shots += 1;
    const hit = b.findIndex((x) => Math.abs(x.first - s.first) <= 15);
    if (hit >= 0 && !matched.has(hit)) { matched.add(hit); agg.matches_baseline_shot += 1; continue; }
    const prior = b.some((x) => s.first > x.first && s.first - x.last <= 60 && s.first - x.first <= 130);
    if (prior) agg.split_fragment_within_60f_after_a_match += 1; else agg.isolated_extra += 1;
    agg.extra_zone_sightings.push(s.zoneSightings);
    const own = tr.track(s.owner); agg.extra_tracks_obs.push(own.obs.length);
    agg.extra_owner_motion[own.obs.some((o) => o.moving) ? "ever_moving" : "never_moving"] = (agg.extra_owner_motion[own.obs.some((o) => o.moving) ? "ever_moving" : "never_moving"] ?? 0) + 1;
    if (examples.length < 6) examples.push({ id, first: s.first, zone: s.zoneSightings, ownerObs: own.obs.length, ownerState: own.state, v4: s.v4, nearestBaselineFirstBefore: [...b].reverse().find((x) => x.first < s.first)?.first, widths: own.obs.slice(0, 4).map((o) => +o.w.toFixed(0)), scores: own.obs.slice(0, 4).map((o) => +o.score.toFixed(2)) });
  }
  agg.baseline_shots_lost += b.filter((_, i) => !matched.has(i)).length;
}
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };
console.log(JSON.stringify({ ...agg, extra_zone_sightings: { n: agg.extra_zone_sightings.length, median: q(agg.extra_zone_sightings, 0.5), p90: q(agg.extra_zone_sightings, 0.9) }, extra_tracks_obs: { median: q(agg.extra_tracks_obs, 0.5), p90: q(agg.extra_tracks_obs, 0.9) } }, null, 1));
console.log(examples.map((e) => JSON.stringify(e)).join("\n"));
