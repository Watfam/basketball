// Detection and localization scoring against annotated frames. Pure functions.
import { wilson, describe } from "./stats.mjs";

const centre = (b) => [(b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2];

/**
 * One frame. `balls` are annotated (cx, cy, diameter); `boxes` are detector boxes at or above `threshold`.
 * A box matches an annotated ball when its centre is within `matchFrac` of the ball's diameter of the annotated centre
 * (thresholds.json: 0.5). Greedy, best score first, one box per ball.
 */
export function matchFrame(balls, boxes, { threshold = 0.25, matchFrac = 0.5, ignore = [] } = {}) {
  const live = boxes.filter((b) => b.score >= threshold).sort((a, b) => b.score - a.score);
  const taken = new Set();
  const pairs = [];
  const fpBoxes = [];
  for (const box of live) {
    const [bx, by] = centre(box);
    let best = -1, bd = Infinity;
    balls.forEach((ball, i) => {
      if (taken.has(i)) return;
      const d = Math.hypot(bx - ball.cx, by - ball.cy);
      if (d <= matchFrac * ball.diameter && d < bd) { bd = d; best = i; }
    });
    if (best >= 0) {
      taken.add(best);
      const ball = balls[best];
      pairs.push({ err_px: bd, err_frac: bd / ball.diameter, width_ratio: (box.x2 - box.x1) / ball.diameter, score: box.score, ball: best });
    } else if (!ignore.some((g) => Math.hypot(bx - g.cx, by - g.cy) <= matchFrac * g.diameter)) fpBoxes.push(box);
    // a box on an ignored (low-confidence) annotation is neither a hit nor a false positive
  }
  return { tp: pairs.length, fp: fpBoxes.length, fn: balls.length - taken.size, pairs, fpBoxes, fnBalls: balls.filter((_, i) => !taken.has(i)) };
}

/** Aggregate over frames. `frames`: [{ id, stratum, balls, boxes }]. Each stratum is reported on its own. */
export function summarizeDetection(frames, options = {}) {
  const groups = {};
  const add = (key, f, m) => {
    const g = (groups[key] ??= { frames: 0, tp: 0, fp: 0, fn: 0, errs: [], fracs: [], widths: [], labels: [], fpFrames: [], fnFrames: [] });
    g.frames += 1; g.tp += m.tp; g.fp += m.fp; g.fn += m.fn;
    for (const p of m.pairs) { g.errs.push(p.err_px); g.fracs.push(p.err_frac); g.widths.push(p.width_ratio); g.labels.push(f.id); }
    if (m.fp) g.fpFrames.push(f.id);
    if (m.fn) g.fnFrames.push(f.id);
  };
  for (const f of frames) {
    const m = matchFrame(f.balls, f.boxes, { ...options, ignore: f.ignore ?? [] });
    add("all", f, m);
    add("stratum:" + f.stratum, f, m);
  }
  const out = {};
  for (const [k, g] of Object.entries(groups)) {
    out[k] = {
      frames: g.frames, annotated_balls: g.tp + g.fn, boxes: g.tp + g.fp, tp: g.tp, fp: g.fp, fn: g.fn,
      recall: wilson(g.tp, g.tp + g.fn), precision: wilson(g.tp, g.tp + g.fp),
      centre_error_px: g.errs.length >= 5 ? describe(g.errs, { labels: g.labels }) : { n: g.errs.length, unavailable: "fewer than 5 matched balls" },
      centre_error_fraction_of_diameter: g.fracs.length >= 5 ? describe(g.fracs, { labels: g.labels }) : { n: g.fracs.length, unavailable: "fewer than 5 matched balls" },
      box_width_over_ball_diameter: g.widths.length ? { n: g.widths.length, median: [...g.widths].sort((a, b) => a - b)[g.widths.length >> 1] } : { n: 0 },
      false_positive_frames: g.fpFrames, missed_ball_frames: g.fnFrames,
    };
  }
  return out;
}

/** How far two annotation passes of the same frame disagree: the floor under any localization claim. */
export function repeatability(pairs) {
  const errs = [], presence = { agree: 0, total: 0 };
  for (const [a, b] of pairs) {
    presence.total += 1;
    if (a.balls.length === b.balls.length) presence.agree += 1;
    if (a.balls.length !== 1 || b.balls.length !== 1) continue;
    errs.push(Math.hypot(a.balls[0].cx - b.balls[0].cx, a.balls[0].cy - b.balls[0].cy));
  }
  return { frames: presence.total, ball_count_agreement: presence.total ? wilson(presence.agree, presence.total) : null, centre_difference_px: errs.length >= 5 ? describe(errs) : { n: errs.length, unavailable: "fewer than 5 comparable pairs" } };
}
