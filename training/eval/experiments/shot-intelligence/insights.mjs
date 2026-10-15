// Evidence-backed coaching insights from shot fingerprints. Every statement carries its evidence; the engine abstains with a reason code when the evidence is not enough.
// It describes where the ball was OBSERVED in the image. It never names a body, release or mechanical cause. Rules are fixed in criteria.json (workstream_C_coaching).
import { median, mad, bootstrapDiff, permP, fisherP, holm } from "./stats.mjs";

export const LIMITS = { minPerGroup: 8, minAvailability: 0.6, practical: { S1: 0.25, S2: 0.25, ratioHi: 1.5, ratioLo: 1 / 1.5, or: 3 }, alpha: 0.05, resamples: 2000, perms: 5000, lastBlock: 8 };
export const BANNED = /\b(elbow|wrist|shoulder|grip|follow-through|follow through|form|mechanics|release|posture|stance|you should|because)\b/i;
export const INTERPRETATION = "This describes where the ball was observed in the image; it does not identify a cause.";
const AMBIGUOUS_VIEW = new Set(["IMG_4851"]); // side-on camera (README): image-horizontal there is largely depth, not lateral error
const logRatio = (a, b) => { const x = mad(a), y = mad(b); return x > 0 && y > 0 ? Math.log(x / y) : null; };

function base(id, set, shots, extra) {
  return { id, set, status: "abstained", supporting_shot_ids: shots.map((s) => s.id), ...extra };
}
export function abstain(id, set, shots, reason, detail = "") { return { ...base(id, set, shots, {}), reason, detail, claim_observation: null, interpretation_limit: INTERPRETATION }; }

/**
 * set: { name, clips: [ids], shots: [{id, clip, first, outcome, x (rim_level_x_bw|null), usable, cluster|null, stable}] (matched shots only), stable: { rim_level_x_bw: bool }, clusteringRepeatable: bool }
 * options: { seed } . Returns { statements: [...], tried }.
 */
export function generateInsights(set, { seed = 1, early = true } = {}) {
  const out = [], matched = set.shots, withX = matched.filter((s) => s.x !== null && s.usable);
  const availability = matched.length ? withX.length / matched.length : 0;
  const makes = withX.filter((s) => s.outcome === "make"), misses = withX.filter((s) => s.outcome === "miss");
  const quality = { matched_shots: matched.length, with_measurement: withX.length, availability: +availability.toFixed(2), measurement_stable_30_vs_15fps: !!set.stable.rim_level_x_bw };
  const gate = (id) => {
    if (set.clips.some((c) => AMBIGUOUS_VIEW.has(c)) && id !== "S4" && id !== "S5") return abstain(id, set.name, withX, "ambiguous_camera_view", "side-on camera: image-horizontal offset is mostly depth, not lateral error");
    if (!set.stable.rim_level_x_bw) return abstain(id, set.name, withX, "unstable_measure", "the measurement is not repeatable between 30 and 15 fps");
    if (availability < LIMITS.minAvailability) return abstain(id, set.name, withX, "low_availability", `measurement available on ${(availability * 100).toFixed(0)}% of matched shots, need ${LIMITS.minAvailability * 100}%`);
    return null;
  };
  const candidates = [];
  // group statements S1-S3
  for (const [id, f] of [["S1", (a, b) => median(b.map(Math.abs)) - median(a.map(Math.abs))], ["S2", (a, b) => median(b) - median(a)], ["S3", (a, b) => logRatio(b, a)]]) {
    const g = gate(id); if (g) { out.push(g); continue; }
    if (makes.length < LIMITS.minPerGroup || misses.length < LIMITS.minPerGroup) { out.push(abstain(id, set.name, withX, "insufficient_n", `${makes.length} makes and ${misses.length} misses with the measurement; need ${LIMITS.minPerGroup} of each`)); continue; }
    const A = makes.map((s) => s.x), B = misses.map((s) => s.x), eff = f(A, B);
    candidates.push({ id, kind: "outcome", A, B, f, eff, shotsA: makes, shotsB: misses });
  }
  // S4 recent variability: last block vs earlier, time order, outcome not used
  { const g = gate("S4"); if (g) out.push(g); else { const ord = [...withX].sort((a, b) => a.first - b.first), last = ord.slice(-LIMITS.lastBlock), early_ = ord.slice(0, -LIMITS.lastBlock); if (last.length < LIMITS.lastBlock || early_.length < LIMITS.minPerGroup) out.push(abstain("S4", set.name, withX, "insufficient_n", `${ord.length} shots with the measurement; need ${LIMITS.lastBlock} recent plus ${LIMITS.minPerGroup} earlier`)); else candidates.push({ id: "S4", kind: "block", A: early_.map((s) => s.x), B: last.map((s) => s.x), f: (a, b) => logRatio(b, a), eff: logRatio(last.map((s) => s.x), early_.map((s) => s.x)), shotsA: early_, shotsB: last }); } }
  // S5 path cluster vs outcome
  { const g = set.clusteringRepeatable ? null : abstain("S5", set.name, withX, "unstable_measure", "the rim-level path clustering does not agree between 30 and 15 fps");
    if (g) out.push(g); else { const cl = {}; for (const s of matched.filter((s) => s.cluster !== null && s.cluster !== "u" && s.outcome)) (cl[s.cluster] ??= []).push(s); const big = Object.values(cl).filter((c) => c.length >= 3).sort((a, b) => b.length - a.length);
      if (big.length < 2) out.push(abstain("S5", set.name, withX, "insufficient_n", `${big.length} repeatable path clusters with at least 3 shots; need 2`)); else { const [c1, c2] = big, m1 = c1.filter((s) => s.outcome === "make").length, m2 = c2.filter((s) => s.outcome === "make").length, a = m1, b = c1.length - m1, c = m2, d = c2.length - m2, orr = ((a + 0.5) * (d + 0.5)) / ((b + 0.5) * (c + 0.5)); candidates.push({ id: "S5", kind: "fisher", p: fisherP(a, b, c, d), eff: orr, table: [a, b, c, d], shotsA: c1, shotsB: c2 }); } } }
  // tests: permutation p first (cheap), bootstrap only when it can matter (equivalent decision, faster)
  const tested = candidates.map((c) => {
    if (c.kind === "fisher") return { ...c, p: c.p, ci: null };
    const p = permP(c.A, c.B, c.f, { perms: LIMITS.perms, seed: seed + c.id.charCodeAt(1) });
    const ci = early && (p === null || p >= LIMITS.alpha) ? null : bootstrapDiff(c.A, c.B, c.f, { resamples: LIMITS.resamples, seed: seed + 100 + c.id.charCodeAt(1) });
    return { ...c, p, ci };
  });
  const adj = holm(tested.map((t) => t.p));
  tested.forEach((t, i) => {
    const sh = [...t.shotsA, ...t.shotsB], nBy = { A: t.shotsA.length, B: t.shotsB.length };
    const ciExcl = t.kind === "fisher" ? null : t.ci && (t.ci.lo > 0 || t.ci.hi < 0);
    const practical = t.kind === "fisher" ? t.eff >= LIMITS.practical.or || t.eff <= 1 / LIMITS.practical.or : (t.id === "S1" || t.id === "S2") ? Math.abs(t.eff) >= LIMITS.practical[t.id] : Math.exp(Math.abs(t.eff)) >= LIMITS.practical.ratioHi;
    let reason = null;
    if (t.kind !== "fisher" && !ciExcl) reason = "interval_includes_zero"; else if (!practical) reason = "below_practical_size"; else if (!(adj[i] < LIMITS.alpha)) reason = "not_significant_after_correction";
    const common = { id: t.id, set: set.name, supporting_shot_ids: sh.map((s) => s.id), n_by_group: t.kind === "outcome" ? { make: nBy.A, miss: nBy.B } : t.kind === "block" ? { earlier: nBy.A, last_8: nBy.B } : { cluster_1: nBy.A, cluster_2: nBy.B }, measurement_quality: quality, uncertainty: { effect: +(t.id === "S3" || t.id === "S4" ? Math.exp(t.eff) : t.eff).toFixed(3), ci95: t.ci ? { lo: +(t.id === "S3" || t.id === "S4" ? Math.exp(t.ci.lo) : t.ci.lo).toFixed(3), hi: +(t.id === "S3" || t.id === "S4" ? Math.exp(t.ci.hi) : t.ci.hi).toFixed(3) } : null, permutation_p: +t.p.toFixed(4), holm_adjusted_p: +adj[i].toFixed(4), tried_for_set: tested.length }, interpretation_limit: INTERPRETATION };
    if (reason) { out.push({ ...common, status: "abstained", reason, claim_observation: null }); return; }
    out.push({ ...common, status: "supported", claim_observation: describe(t, nBy, set), measurement: t.id === "S5" ? "rim_level_path_bw cluster" : "rim_level_x_bw", comparison_baseline: t.kind === "outcome" ? "the same clip's makes against its misses" : t.kind === "block" ? "the same clip's earlier shots against its last 8" : "the other repeatable path cluster", observation_vs_interpretation: { observation: describe(t, nBy, set), interpretation: INTERPRETATION } });
  });
  for (const s of out) lint(s);
  return { statements: out, tried: candidates.length };
}
function describe(t, nBy, set) {
  const side = (v) => (v > 0 ? "farther toward image-right" : "farther toward image-left");
  const x = (v) => Math.abs(v).toFixed(2);
  if (t.id === "S1") return `In ${set.name}, at rim level the ball was observed ${x(t.eff)} ball widths ${t.eff > 0 ? "farther from" : "closer to"} the rim centre (image-horizontal) on misses than on makes (median absolute offset; ${nBy.A} makes, ${nBy.B} misses).`;
  if (t.id === "S2") return `In ${set.name}, the median observed rim-level position of misses was ${x(t.eff)} ball widths ${side(t.eff)} (image-horizontal) than that of makes (${nBy.A} makes, ${nBy.B} misses).`;
  if (t.id === "S3") return `In ${set.name}, the observed rim-level position varied ${Math.exp(t.eff).toFixed(2)} times as much on misses as on makes (spread = MAD; ${nBy.A} makes, ${nBy.B} misses).`;
  if (t.id === "S4") return `In ${set.name}, the observed rim-level position varied ${Math.exp(t.eff).toFixed(2)} times as much over the last 8 shots as over the ${nBy.A} before them.`;
  return `In ${set.name}, shots in one repeatable observed path group were made ${t.table[0]} of ${t.table[0] + t.table[1]} times against ${t.table[2]} of ${t.table[2] + t.table[3]} in another (odds ratio ${t.eff.toFixed(1)}).`;
}
export function lint(statement) {
  const text = [statement.claim_observation, statement.interpretation_limit, statement.observation_vs_interpretation && statement.observation_vs_interpretation.interpretation].filter(Boolean).join(" ");
  if (BANNED.test(text)) throw new Error(`coaching text contains a banned word: ${text.match(BANNED)[0]}`);
  if (/\b(left|right)\b/i.test(text.replace(/image-left|image-right/gi, ""))) throw new Error("left/right used without 'image-'");
  if (statement.status === "supported") for (const k of ["id", "set", "claim_observation", "interpretation_limit", "supporting_shot_ids", "measurement", "n_by_group", "measurement_quality", "uncertainty", "comparison_baseline", "observation_vs_interpretation"]) if (statement[k] === undefined) throw new Error(`supported statement missing ${k}`);
  return true;
}
