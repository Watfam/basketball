// Experiment A (criteria.json, registered before this ran): can 'possibly two attempts' be flagged from flight continuity?
//   node experiment-a.mjs   -> results/experiment-a.json
import fs from "node:fs";
import { CLIPS, loadClip, countFrames, sightingsOf } from "./lib.mjs";
import { readJSON } from "../../lib/registry.mjs";
import { countClip } from "../../lib/shots.mjs";
import { attemptsIn } from "./attempts.ts";
const ref = readJSON("training/eval/experiments/shot-separation/results/diagnostic-all.json").reference;
const annotations = readJSON("training/eval/annotate/annotations.json"), ph = {};
for (const e of annotations.events ?? []) if (e.type === "no_shot") (ph[e.clip] ??= []).push(e.frame);
const GAPS = [10, 15, 20, 25, 30, 40, 60];
const out = { registered: "criteria.json", real: {}, spliced: {}, checks: {} };
const covers = (p, t) => p.first - 25 <= t && t <= p.last + 15;
const clips = {};
for (const id of CLIPS) clips[id] = await loadClip(id);

// ---- Real clips: flags on calls that cover exactly one reference shot (all false flags) + the merged calls ----
for (const thin of [1, 2]) {
  const row = { single_calls: 0, false_flags: [], merged_calls: [], flagged_total: 0 };
  for (const id of CLIPS) {
    const c = clips[id];
    const calls = countClip(c.vision, c.clip, c.clip.detections.ball6, { thin }).calls.filter((x) => !(ph[id] ?? []).some((f) => Math.abs(x.first - f) <= 3));
    for (const p of calls) {
      const cov = ref[id].times.filter((t) => covers(p, t));
      const rep = attemptsIn(sightingsOf(c, c.frames, p.first - 30, p.last + 30, thin));
      if (rep.possiblyTwo) row.flagged_total += 1;
      if (cov.length === 1) { row.single_calls += 1; if (rep.possiblyTwo) row.false_flags.push({ clip: id, first: p.first, attempts: rep.attempts, links: rep.links.map((l) => ({ gap: l.gap, rms: l.rms, accel: l.accel, followed: l.followed, continuous: l.continuous })) }); }
      else if (cov.length >= 2) row.merged_calls.push({ clip: id, first: p.first, last: p.last, references: cov.length, ref_times: cov, attempts_found: rep.attempts.length, flagged: rep.possiblyTwo, attempt_arrivals: rep.attempts.map((a) => a.f1) });
    }
  }
  out.real[`${30 / thin}fps`] = row;
  console.log(`real ${30 / thin} fps: single-shot calls ${row.single_calls}, false flags ${row.false_flags.length}, merged calls ${row.merged_calls.length} (flagged ${row.merged_calls.filter((m) => m.flagged).length}); all flagged ${row.flagged_total}`);
  for (const f of row.false_flags) console.log("   false flag", f.clip, f.first, JSON.stringify(f.links));
  for (const m of row.merged_calls) console.log("   merged", m.clip, m.first, "refs", m.references, "attempts", m.attempts_found, "flagged", m.flagged);
}

// ---- Spliced pairs ----
const pairs = [];
for (const id of CLIPS) {
  const c = clips[id];
  const calls = countClip(c.vision, c.clip, c.clip.detections.ball6, { thin: 1 }).calls.filter((x) => !(ph[id] ?? []).some((f) => Math.abs(x.first - f) <= 3));
  const T = ref[id].times, single = T.map((t) => { const cv = calls.filter((p) => covers(p, t)); return cv.length === 1 && T.filter((u) => covers(cv[0], u)).length === 1 ? cv[0] : null; });
  for (let i = 0; i + 1 < T.length; i += 1) if (single[i] && single[i + 1]) pairs.push({ id, A: single[i], B: single[i + 1], actualGap: single[i + 1].first - single[i].last });
}
out.spliced.pairs = pairs.length;
console.log("pairs", pairs.length);
for (const variant of ["S1", "S2"]) {
  for (const thin of [1, 2]) {
    for (const g of GAPS) {
      let n = 0, one = 0, two = 0, flaggedOfMerged = 0, systemTwo = 0;
      for (const { id, A, B } of pairs) {
        const c = clips[id], frames = new Map(), shift = A.last + g - B.first, base = A.first - 60;
        const put = (f, arr) => { if (f < 0) return; (frames.get(f) ?? frames.set(f, []).get(f)).push(...arr); };
        const aEnd = variant === "S1" ? A.last : A.last + 70;
        for (let f = base; f <= aEnd; f += 1) put(f - base, c.frames.get(f) ?? []);
        for (let f = B.first - 60; f <= B.last + 80; f += 1) { const nf = f + shift - base; if (variant === "S1" && nf + base <= A.last) continue; put(nf, c.frames.get(f) ?? []); }
        const N = B.last + 80 + shift - base + 2;
        const calls = countFrames(c, frames, N, thin);
        n += 1;
        if (calls.length === 1) {
          one += 1;
          const rep = attemptsIn(sightingsOf(c, frames, calls[0].first - 30, calls[0].last + 30, thin));
          if (rep.possiblyTwo) { flaggedOfMerged += 1; systemTwo += 1; }
        } else if (calls.length >= 2) { two += 1; systemTwo += 1; }
      }
      const key = `${variant}_${30 / thin}fps_gap${g}`;
      out.spliced[key] = { pairs: n, shipped_one_call: one, shipped_two_calls: two, flagged_of_merged: flaggedOfMerged, system_two_attempts: systemTwo, flagged_of_merged_rate: one ? +(flaggedOfMerged / one).toFixed(3) : null, system_rate: +(systemTwo / n).toFixed(3) };
      console.log(key.padEnd(22), `pairs ${n} shipped-merged ${one} shipped-split ${two} flagged-of-merged ${flaggedOfMerged} (${one ? Math.round((100 * flaggedOfMerged) / one) : "-"}%) system two ${systemTwo} (${Math.round((100 * systemTwo) / n)}%)`);
    }
  }
}
fs.mkdirSync("results", { recursive: true });
fs.writeFileSync("results/experiment-a.json", JSON.stringify(out, null, 1));
