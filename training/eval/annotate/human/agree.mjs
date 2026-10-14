// Compares a HUMAN annotation file with the AI annotator's labels (and with ball-6) on the 20 package frames. Separate from the automated tests
// and from the frozen baseline: it never edits annotations.json or the lock. Small n: a sanity check on the ground truth, not a benchmark.
//   node training/eval/annotate/human/agree.mjs [path to human-annotations.json]
import fs from "node:fs";
import path from "node:path";
import { ROOT, readJSON } from "../../lib/registry.mjs";
import { wilson, describe } from "../../lib/stats.mjs";

const dist = (a, b) => Math.hypot(a.cx - b.cx, a.cy - b.cy);

/** One frame: does presence agree, and if both mark a ball, how far apart are the centres? `other` and `human` are { balls }. */
export function compareFrame(human, other) {
  const h = human.balls ?? [], o = other.balls ?? [];
  const presence = (h.length > 0) === (o.length > 0);
  let centre = null, sizeRatio = null, within = null;
  if (h.length && o.length) {
    centre = dist(h[0], o[0]);
    if (h[0].diameter && o[0].diameter) sizeRatio = h[0].diameter / o[0].diameter;
    within = centre <= 0.5 * (o[0].diameter ?? 24);
  }
  return { presence, centre, sizeRatio, within };
}

export function summarize(rows) {
  const both = rows.filter((r) => r.centre !== null);
  return {
    frames: rows.length,
    presence_agreement: wilson(rows.filter((r) => r.presence).length, rows.length),
    both_marked_a_ball: both.length,
    centres_within_half_a_ball_diameter: both.length ? wilson(both.filter((r) => r.within).length, both.length) : null,
    centre_difference_px: both.length >= 5 ? describe(both.map((r) => r.centre)) : { n: both.length, unavailable: "fewer than 5 frames where both marked a ball" },
    size_ratio_median: (() => { const s = both.map((r) => r.sizeRatio).filter(Boolean).sort((a, b) => a - b); return s.length ? s[s.length >> 1] : null; })(),
  };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const file = path.resolve(process.argv[2] ?? path.join(ROOT, "training/eval/annotate/human/human-annotations.json"));
  if (!fs.existsSync(file)) { console.log(`no human annotation file at ${file}`); process.exit(1); }
  const human = JSON.parse(fs.readFileSync(file, "utf8")), sel = readJSON("training/eval/annotate/human/human-selection.json"), ai = readJSON("training/eval/annotate/annotations.json");
  const det = JSON.parse(fs.readFileSync(path.join(ROOT, "training/work/eval/annotated-detections.json"), "utf8")).ball6;
  const rows = [];
  for (const f of human.frames.filter((x) => x.answered)) {
    const s = sel.frames.find((x) => x.blind_id === f.id), a = ai.frames.find((x) => x.id === s.internal);
    const modelBoxes = (det[s.internal] ?? []).filter((b) => b.score >= 0.25).map((b) => ({ cx: (b.x1 + b.x2) / 2, cy: (b.y1 + b.y2) / 2, diameter: b.x2 - b.x1 }));
    rows.push({ blind_id: f.id, internal: s.internal, category: s.category, clip: s.clip, vs_ai: compareFrame(f, a), vs_ball6: compareFrame(f, { balls: modelBoxes }), human_balls: f.balls.length, ai_balls: a.balls.length, ai_confidence: a.balls[0]?.confidence ?? null, human_confidence: f.balls[0]?.confidence ?? null });
  }
  const byCat = {}; for (const r of rows) (byCat[r.category] ??= []).push(r);
  const out = {
    note: "20 frames, one human, one AI annotator, one model: intervals are wide. Human = ground-truth candidate 2; disagreements are listed so they can be resolved by eye, not averaged away.",
    human: human.annotator, frames_answered: rows.length,
    human_vs_ai_annotator: summarize(rows.map((r) => r.vs_ai)), human_vs_ball6: summarize(rows.map((r) => r.vs_ball6)),
    by_category: Object.fromEntries(Object.entries(byCat).map(([k, v]) => [k, { frames: v.length, presence_agreement_with_ai: `${v.filter((r) => r.vs_ai.presence).length} of ${v.length}` }])),
    disagreements_with_ai: rows.filter((r) => !r.vs_ai.presence || r.vs_ai.within === false).map((r) => ({ blind_id: r.blind_id, internal: r.internal, category: r.category, clip: r.clip, human_balls: r.human_balls, ai_balls: r.ai_balls, ai_confidence: r.ai_confidence, centre_px: r.vs_ai.centre })),
  };
  fs.writeFileSync(path.join(ROOT, "training/eval/annotate/human/human-agreement.json"), JSON.stringify(out, null, 1) + "\n");
  console.log(JSON.stringify(out, null, 1));
}
