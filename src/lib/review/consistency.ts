import { framingGroups } from "./history-core.ts";
import type { HistorySession, HistoryShot } from "./history-types.ts";

/**
 * Basic consistency analytics over saved tracking history. Uses ONLY the validated measurement (rim_level_x_bw: where the ball was observed at
 * the height of the rim, in ball widths, image-horizontal; stable between 30 and 15 fps in Phase 4) and only shots whose path is tracked or partial.
 * Sessions are compared only inside one framing group. Every statement carries its sample sizes, an interval or test, a baseline and the same
 * limit sentence; the engine ABSTAINS with a reason code when the evidence is not enough. Nothing here says anything about shooting form,
 * release or improvement: it describes where the ball was observed in the picture.
 */
export const LIMITS = { minPerGroup: 8, minSessionShots: 8, minEarlier: 12, minSessionsForTrend: 5, alpha: 0.05, resamples: 2000, perms: 5000, maxShotsPerGroup: 400, practicalOffset: 0.25, ratioHi: 1.5, trendRho: 0.7 } as const;
export const INTERPRETATION = "This describes where the ball was observed in the picture; it does not identify a cause or show a change in how the shot was taken.";
export const CAUTION_FRAMING = "Sessions are grouped when the camera showed the hoop the same size and in the same place. That cannot detect a different camera angle, which changes image-horizontal positions.";
export const CAUTION_OUTCOME = "A miss is a ball that was not near the rim line, so this mostly shows the measurement follows the result; it is not a finding about how the shot was taken.";
export const BANNED = /\b(elbow|wrist|shoulder|grip|follow-through|follow through|form|mechanics|release|posture|stance|improv\w*|better|worse|you should|because|fix\w*)\b/i;

export type Statement = {
  id: "V1" | "V2" | "V3" | "V4a" | "V4b";
  status: "supported" | "abstained";
  group: string;
  reason?: "insufficient_n" | "too_few_sessions" | "interval_includes_zero" | "below_practical_size" | "not_significant_after_correction" | "no_comparable_framing";
  detail?: string;
  claim_observation: string | null;
  interpretation_limit: string;
  supporting_shot_ids: string[];
  measurement: "rim_level_x_bw";
  n: Record<string, number>;
  sessions: number;
  measurement_quality: { shots_in_group: number; with_measurement: number; availability: number };
  uncertainty: { effect: number | null; ci95: { lo: number; hi: number } | null; p: number | null; p_adjusted: number | null };
  comparison_baseline: string;
  /** What a reader should not conclude from this statement. */
  caution: string;
};

export type Coverage = { sessionKey: string; startedAt: string; label: string | null; shots: number; tracked: number; withMeasure: number; availability: number; quality: Record<string, number>; framingGroup: number };

/** A spread below this is measurement noise (a hundredth of a ball width is about a quarter pixel). */
const SPREAD_FLOOR = 0.05;
const median = (a: number[]) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mad = (a: number[]) => { const m = median(a); return 1.4826 * median(a.map((x) => Math.abs(x - m))); };
function rng(seed: number) { let t = seed >>> 0; return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

/** Iteration counts shrink as samples grow so the cost stays bounded on a phone: 2000 resamples and 5000 permutations up to 100 shots, never fewer than 600 and 1500. */
const resamplesFor = (n: number) => Math.max(600, Math.min(LIMITS.resamples, Math.round(200_000 / Math.max(1, n))));
const permsFor = (n: number) => Math.max(1500, Math.min(LIMITS.perms, Math.round(500_000 / Math.max(1, n))));

function bootstrap(A: number[], B: number[] | null, stat: (a: number[], b: number[]) => number, seed: number) {
  const r = rng(seed), vals: number[] = [], R = resamplesFor(A.length + (B?.length ?? 0));
  for (let k = 0; k < R; k += 1) { const a = A.map(() => A[Math.floor(r() * A.length)]), b = B ? B.map(() => B[Math.floor(r() * B.length)]) : []; const v = stat(a, b); if (Number.isFinite(v)) vals.push(v); }
  return vals.length ? { lo: q(vals, 0.025), hi: q(vals, 0.975) } : null;
}
function permP(A: number[], B: number[], stat: (a: number[], b: number[]) => number, seed: number) {
  const obs = stat(A, B); if (!Number.isFinite(obs)) return null;
  const all = [...A, ...B], r = rng(seed), P = permsFor(all.length); let ge = 0, n = 0;
  for (let k = 0; k < P; k += 1) { for (let i = all.length - 1; i > 0; i -= 1) { const j = Math.floor(r() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; } const v = stat(all.slice(0, A.length), all.slice(A.length)); if (!Number.isFinite(v)) continue; n += 1; if (Math.abs(v) >= Math.abs(obs) - 1e-12) ge += 1; }
  return (ge + 1) / (n + 1);
}
function holm(ps: (number | null)[]) { const idx = ps.map((p, i) => [p, i] as const).filter((x): x is readonly [number, number] => x[0] !== null).sort((a, b) => a[0] - b[0]), out: (number | null)[] = ps.map(() => null); let run = 0; idx.forEach(([p, i], k) => { run = Math.max(run, Math.min(1, (idx.length - k) * p)); out[i] = run; }); return out; }
function ranks(a: number[]) { const ix = a.map((v, i) => [v, i] as const).sort((x, y) => x[0] - y[0]), r = Array(a.length).fill(0); for (let i = 0; i < ix.length;) { let j = i; while (j + 1 < ix.length && ix[j + 1][0] === ix[i][0]) j += 1; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k += 1) r[ix[k][1]] = avg; i = j + 1; } return r; }
export function spearman(x: number[], y: number[]) { if (x.length < 3) return NaN; const a = ranks(x), b = ranks(y), n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n; let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i += 1) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; } return saa && sbb ? sab / Math.sqrt(saa * sbb) : NaN; }

/** A shot that may enter an analysis: tracked, a measurable rim-level position, a path that is not unreliable, and no unclear identity near the rim. */
export function usableShot(s: HistoryShot): number | null {
  if (!s.tracked || !s.fingerprint || !s.fingerprint.usable) return null;
  if (s.quality.level !== "tracked" && s.quality.level !== "partial") return null;
  const v = s.fingerprint.m.rim_level_x_bw;
  return typeof v === "number" ? v : null;
}

function skeleton(id: Statement["id"], group: string, ctx: { shots: HistoryShot[]; usable: HistoryShot[]; sessions: number }): Statement {
  return { id, status: "abstained", group, claim_observation: null, interpretation_limit: INTERPRETATION, supporting_shot_ids: [], measurement: "rim_level_x_bw", n: {}, sessions: ctx.sessions, measurement_quality: { shots_in_group: ctx.shots.length, with_measurement: ctx.usable.length, availability: ctx.shots.length ? +(ctx.usable.length / ctx.shots.length).toFixed(2) : 0 }, uncertainty: { effect: null, ci95: null, p: null, p_adjusted: null }, comparison_baseline: "", caution: CAUTION_FRAMING };
}
const ab = (s: Statement, reason: NonNullable<Statement["reason"]>, detail: string): Statement => ({ ...s, status: "abstained", reason, detail });

/** Coverage of the measurement across sessions (descriptive; no test). */
export function coverage(sessions: HistorySession[], shots: HistoryShot[]): Coverage[] {
  const groups = framingGroups(sessions);
  return sessions.map((s) => {
    const mine = shots.filter((x) => x.sessionKey === s.sessionKey), quality: Record<string, number> = { tracked: 0, partial: 0, unreliable: 0, none: 0 };
    for (const x of mine) quality[x.quality.level] += 1;
    const withMeasure = mine.filter((x) => usableShot(x) !== null).length;
    return { sessionKey: s.sessionKey, startedAt: s.startedAt, label: s.label, shots: mine.length, tracked: mine.filter((x) => x.tracked).length, withMeasure, availability: mine.length ? +(withMeasure / mine.length).toFixed(2) : 0, quality, framingGroup: groups.findIndex((g) => g.includes(s)) + 1 };
  });
}

/** Statements for ONE framing group of sessions. */
export function analyseGroup(sessions: HistorySession[], shots: HistoryShot[], groupName: string): Statement[] {
  const keys = new Set(sessions.map((s) => s.sessionKey)), mine = shots.filter((s) => keys.has(s.sessionKey));
  const order = new Map(sessions.map((s) => [s.sessionKey, s.startedAt]));
  const allRows = mine.map((s) => ({ s, v: usableShot(s) })).filter((x): x is { s: HistoryShot; v: number } => x.v !== null).sort((a, b) => (order.get(a.s.sessionKey) ?? "").localeCompare(order.get(b.s.sessionKey) ?? "") || a.s.seq - b.s.seq);
  const capped = allRows.length > LIMITS.maxShotsPerGroup, rows = capped ? allRows.slice(-LIMITS.maxShotsPerGroup) : allRows;
  const usable = allRows.map((x) => x.s), ctx = { shots: mine, usable, sessions: sessions.length };
  const seed = hash(groupName + sessions.map((s) => s.sessionKey).join("|"));
  const out: Statement[] = [];
  const ids = (xs: { s: HistoryShot }[]) => xs.map((x) => x.s.id);
  // V1: variability of the rim-level position (descriptive)
  {
    const st = skeleton("V1", groupName, ctx); st.comparison_baseline = "none: a description of this group's own shots (no comparison)";
    if (rows.length < LIMITS.minEarlier) out.push(ab(st, "insufficient_n", `${rows.length} shots with a measurable rim-level position; need ${LIMITS.minEarlier}`));
    else {
      const A = rows.map((x) => x.v), sp = mad(A), ci = bootstrap(A, null, (a) => mad(a), seed + 1);
      out.push({ ...st, status: "supported", claim_observation: `In ${groupName}, where the ball was observed at rim height varied by about ${sp.toFixed(2)} ball widths (spread of ${rows.length} shots in ${sessions.length} session${sessions.length === 1 ? "" : "s"}; image-horizontal).`, supporting_shot_ids: ids(rows), n: { shots: rows.length }, uncertainty: { effect: +sp.toFixed(3), ci95: ci ? { lo: +ci.lo.toFixed(3), hi: +ci.hi.toFixed(3) } : null, p: null, p_adjusted: null } });
    }
  }
  const tested: { st: Statement; p: number | null; effect: number; ci: { lo: number; hi: number } | null; practical: boolean; ciExcl: boolean; text: (e: number) => string; supporting: string[]; n: Record<string, number> }[] = [];
  // per-session rows for trend
  const perSession = sessions.map((s) => ({ s, v: rows.filter((x) => x.s.sessionKey === s.sessionKey).map((x) => x.v) })).filter((x) => x.v.length >= LIMITS.minSessionShots).sort((a, b) => a.s.startedAt.localeCompare(b.s.startedAt));
  // V2: trend across sessions (two measures, rank correlation with session order)
  {
    const base = skeleton("V2", groupName, ctx); base.comparison_baseline = "the same sessions with their order shuffled (permutation test on the order)";
    if (perSession.length < LIMITS.minSessionsForTrend) out.push(ab(base, "too_few_sessions", `${perSession.length} sessions with at least ${LIMITS.minSessionShots} measurable shots; need ${LIMITS.minSessionsForTrend} to test a trend`));
    else {
      const order = perSession.map((_, i) => i);
      for (const [label, f] of [["spread", (v: number[]) => mad(v)], ["typical distance from the rim centre", (v: number[]) => median(v.map(Math.abs))]] as const) {
        const y = perSession.map((x) => f(x.v)), rho = spearman(order, y), r = rng(seed + 7 + label.length); let ge = 0, n = 0;
        for (let k = 0; k < LIMITS.perms; k += 1) { const o = [...order]; for (let i = o.length - 1; i > 0; i -= 1) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } const v = spearman(o, y); if (!Number.isFinite(v)) continue; n += 1; if (Math.abs(v) >= Math.abs(rho) - 1e-12) ge += 1; }
        const p = Number.isFinite(rho) ? (ge + 1) / (n + 1) : null;
        tested.push({ st: { ...base, n: { sessions: perSession.length, shots: perSession.reduce((a, x) => a + x.v.length, 0) }, supporting_shot_ids: rows.filter((x) => perSession.some((p2) => p2.s.sessionKey === x.s.sessionKey)).map((x) => x.s.id) }, p, effect: rho, ci: null, practical: Math.abs(rho) >= LIMITS.trendRho, ciExcl: true, text: (e) => `In ${groupName}, across ${perSession.length} sessions the ${label} of where the ball was observed at rim height ${e > 0 ? "rose" : "fell"} from session to session (rank correlation ${e.toFixed(2)}, ${perSession.reduce((a, x) => a + x.v.length, 0)} shots).`, supporting: [], n: {} });
      }
    }
  }
  // V3: the last session against the earlier ones (spread ratio)
  {
    const base = skeleton("V3", groupName, ctx); base.comparison_baseline = "the same group's earlier sessions, pooled";
    const ord = [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt)), last = ord[ord.length - 1];
    const L = rows.filter((x) => x.s.sessionKey === last?.sessionKey), E = rows.filter((x) => x.s.sessionKey !== last?.sessionKey);
    if (sessions.length < 2) out.push(ab(base, "too_few_sessions", "only one session in this framing"));
    else if (L.length < LIMITS.minSessionShots || E.length < LIMITS.minEarlier) out.push(ab(base, "insufficient_n", `${L.length} shots in the latest session and ${E.length} earlier; need ${LIMITS.minSessionShots} and ${LIMITS.minEarlier}`));
    else {
      const a = E.map((x) => x.v), b = L.map((x) => x.v), f = (x: number[], y: number[]) => Math.log(Math.max(mad(y), SPREAD_FLOOR) / Math.max(mad(x), SPREAD_FLOOR));
      tested.push({ st: { ...base, n: { earlier: a.length, latest: b.length }, supporting_shot_ids: ids([...E, ...L]) }, p: permP(a, b, f, seed + 3), effect: f(a, b), ci: bootstrap(a, b, f, seed + 4), practical: Math.exp(Math.abs(f(a, b))) >= LIMITS.ratioHi, ciExcl: false, text: (e) => `In ${groupName}, where the ball was observed at rim height varied ${Math.exp(e).toFixed(2)} times as much in the latest session as in the ${a.length} earlier shots (spread; ${b.length} shots).`, supporting: [], n: {} });
    }
  }
  // V4: successful against unsuccessful shots (written outcome as recorded; never an input to the measurement)
  {
    const M = rows.filter((x) => x.s.made), X = rows.filter((x) => !x.s.made);
    for (const [id, label, f, practicalFn, text] of [
      ["V4a", "median distance from the rim centre", (a: number[], b: number[]) => median(b.map(Math.abs)) - median(a.map(Math.abs)), (e: number) => Math.abs(e) >= LIMITS.practicalOffset, (e: number, nm: number, nx: number) => `In ${groupName}, at rim height the ball was observed ${Math.abs(e).toFixed(2)} ball widths ${e > 0 ? "farther from" : "closer to"} the rim centre (image-horizontal) on misses than on makes (median; ${nm} makes, ${nx} misses).`],
      ["V4b", "spread", (a: number[], b: number[]) => Math.log(Math.max(mad(b), SPREAD_FLOOR) / Math.max(mad(a), SPREAD_FLOOR)), (e: number) => Math.exp(Math.abs(e)) >= LIMITS.ratioHi, (e: number, nm: number, nx: number) => `In ${groupName}, the observed rim-level position varied ${Math.exp(e).toFixed(2)} times as much on misses as on makes (spread; ${nm} makes, ${nx} misses).`],
    ] as const) {
      const base = skeleton(id, groupName, ctx); base.comparison_baseline = `this group's makes against its misses (${label})`; base.caution = `${CAUTION_OUTCOME} ${CAUTION_FRAMING}`;
      if (M.length < LIMITS.minPerGroup || X.length < LIMITS.minPerGroup) { out.push(ab(base, "insufficient_n", `${M.length} makes and ${X.length} misses with a measurable position; need ${LIMITS.minPerGroup} of each`)); continue; }
      const a = M.map((x) => x.v), b = X.map((x) => x.v);
      tested.push({ st: { ...base, n: { make: a.length, miss: b.length }, supporting_shot_ids: ids([...M, ...X]) }, p: permP(a, b, f, seed + 11 + id.length), effect: f(a, b), ci: bootstrap(a, b, f, seed + 13 + id.length), practical: practicalFn(f(a, b)), ciExcl: false, text: (e) => text(e, a.length, b.length), supporting: [], n: {} });
    }
  }
  const adj = holm(tested.map((t) => t.p));
  tested.forEach((t, i) => {
    const ciExcl = t.ci ? t.ci.lo > 0 || t.ci.hi < 0 : t.ciExcl;
    const show = (x: number) => (t.st.id === "V3" || t.st.id === "V4b" ? Math.exp(x) : x);
    const unc = { effect: +show(t.effect).toFixed(3), ci95: t.ci ? { lo: +show(t.ci.lo).toFixed(3), hi: +show(t.ci.hi).toFixed(3) } : null, p: t.p === null ? null : +t.p.toFixed(4), p_adjusted: adj[i] === null ? null : +(adj[i] as number).toFixed(4) };
    const st: Statement = { ...t.st, uncertainty: unc };
    if (!ciExcl) out.push({ ...st, status: "abstained", reason: "interval_includes_zero", detail: "the interval around the difference includes no difference" });
    else if (!t.practical) out.push({ ...st, status: "abstained", reason: "below_practical_size", detail: "the difference is smaller than the size worth reporting" });
    else if (!(adj[i] !== null && (adj[i] as number) < LIMITS.alpha)) out.push({ ...st, status: "abstained", reason: "not_significant_after_correction", detail: "not distinguishable from chance after allowing for the comparisons made" });
    else out.push({ ...st, status: "supported", claim_observation: t.text(t.effect) });
  });
  if (capped) for (const s of out) s.caution = `${s.caution} Only the most recent ${LIMITS.maxShotsPerGroup} of ${allRows.length} measurable shots were used.`;
  for (const s of out) lint(s);
  return out;
}

export function lint(s: Statement) {
  const text = [s.claim_observation, s.interpretation_limit, s.caution].filter(Boolean).join(" ");
  if (BANNED.test(text)) throw new Error(`analytics text contains a banned word: ${text.match(BANNED)?.[0]}`);
  if (/\b(left|right)\b/i.test(text.replace(/image-left|image-right|image-horizontal/gi, ""))) throw new Error("left/right used without 'image-'");
  if (s.status === "supported") for (const k of ["id", "group", "claim_observation", "interpretation_limit", "supporting_shot_ids", "measurement", "n", "measurement_quality", "uncertainty", "comparison_baseline", "caution"] as const) if (s[k] === undefined || s[k] === null || s[k] === "") throw new Error(`supported statement missing ${k}`);
}

/** All analytics for a player's history: one set of statements per framing group; sessions of different framings are never pooled. */
export function analyseHistory(sessions: HistorySession[], shots: HistoryShot[]): { groups: { name: string; sessions: HistorySession[]; statements: Statement[] }[]; coverage: Coverage[] } {
  const groups = framingGroups(sessions);
  return { groups: groups.map((g, i) => { const name = `framing ${i + 1} (${g.length} session${g.length === 1 ? "" : "s"})`; return { name, sessions: g, statements: analyseGroup(g, shots, name) }; }), coverage: coverage(sessions, shots) };
}
