// Shot-separation diagnostic: time-based matching of predicted shots to reference shots (rules in criteria.json). A SEPARATE VIEW; the frozen scorer is untouched.
import fs from "node:fs";
import path from "node:path";
import { EVAL, loadRegistry, readJSON } from "../../lib/registry.mjs";
import { align } from "../../lib/shots.mjs";

export const COVER = { before: 25, after: 15 }, BOUNDARY_TOL = 15;
export const PHANTOM_ADJUDICATED = { IMG_4872: [1], IMG_4873: [892, 4021] };   // by eye, before registration, list closed
const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** frames by source -> clusters supported by >= 2 sources. sources: { name: [frames] } */
export function buildReference(sources, phantoms = []) {
  const ev = Object.entries(sources).flatMap(([n, fr]) => fr.map((f) => [f, n])).sort((a, b) => a[0] - b[0]), cl = [];
  for (const [f, n] of ev) { const l = cl[cl.length - 1]; if (l && f - l.fs[l.fs.length - 1] <= 30) { l.fs.push(f); l.src.add(n); } else cl.push({ fs: [f], src: new Set([n]) }); }
  return cl.filter((c) => c.src.size >= 2).map((c) => ({ t: median(c.fs), sources: [...c.src] })).filter((r) => !phantoms.some((p) => Math.abs(p - r.t) <= 30));
}
/** Classify predictions (counted calls with first,last,v4) against references [{t, outcome}]. */
export function classify(preds, refs) {
  const covers = preds.map((p) => refs.map((r, j) => (p.first - COVER.before <= r.t && r.t <= p.last + COVER.after ? j : -1)).filter((j) => j >= 0));
  const coveredBy = refs.map((_, j) => preds.map((p, i) => (covers[i].includes(j) ? i : -1)).filter((i) => i >= 0));
  const out = { predictions: preds.length, references: refs.length, matched: 0, boundary_correct: 0, merged_predictions: 0, merged_references: 0, split_references: 0, missing: 0, extra: 0, outcome_correct: 0, outcome_incorrect: 0, merged_not_scored: 0, detail: [] };
  preds.forEach((p, i) => {
    const c = covers[i];
    if (c.length === 0) { out.extra += 1; out.detail.push({ kind: "extra", first: p.first }); }
    else if (c.length >= 2) { out.merged_predictions += 1; out.merged_references += c.length; out.detail.push({ kind: "merged", first: p.first, last: p.last, refs: c.map((j) => refs[j].t) }); }
    else if (coveredBy[c[0]].length === 1) { out.matched += 1; const r = refs[c[0]]; if (Math.abs(p.first - r.t) <= BOUNDARY_TOL) out.boundary_correct += 1; if (r.outcome) { if (p.v4 === r.outcome) out.outcome_correct += 1; else { out.outcome_incorrect += 1; out.detail.push({ kind: "outcome_wrong", first: p.first, ref: r.t, called: p.v4, written: r.outcome }); } } }
  });
  refs.forEach((r, j) => { if (coveredBy[j].length === 0) { out.missing += 1; out.detail.push({ kind: "missing", ref: r.t }); } else if (coveredBy[j].length >= 2) { out.split_references += 1; out.detail.push({ kind: "split", ref: r.t, preds: coveredBy[j].map((i) => preds[i].first) }); } });
  out.merged_not_scored = refs.filter((_, j) => coveredBy[j].length === 1 && covers[coveredBy[j][0]].length >= 2).length;
  return out;
}
/** reference shots with written outcomes attached (rule e). Returns { refs, ambiguous }. */
export function withOutcomes(refs, truth, shotsForAlign) {
  if (refs.length === truth.length) return { refs: refs.map((r, i) => ({ ...r, outcome: truth[i] })), ambiguous: false };
  const a = align(shotsForAlign, truth), by = new Map(a.pairs.map((p) => [p.s.first, p.t]));
  return { refs: refs.map((r) => ({ ...r, outcome: by.get(shotsForAlign.find((s) => Math.abs(s.first - r.t) <= 15)?.first) ?? null })), ambiguous: true };
}
