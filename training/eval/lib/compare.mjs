// Before/after comparison of two regression reports, applying the registered thresholds mechanically.
import { mcnemarExact } from "./stats.mjs";

const pct = (x) => (x === null || x === undefined ? "n/a" : (100 * x).toFixed(1) + "%");
const BASELINE_METHODS = new Set(["linear", "constant_velocity", "constant_acceleration", "last_value"]);

export function compareReports(a, b, thr) {
  const out = { valid: true, warnings: [], findings: [] };
  const add = (area, verdict, text) => out.findings.push({ area, verdict, text });

  // 0. Is the comparison fair at all?
  if (a.reproducibility.datasets_sha256 !== b.reproducibility.datasets_sha256) out.warnings.push("datasets.json differs between the reports: the evaluation set changed, claims are NOT valid");
  if (a.reproducibility.thresholds_sha256 !== b.reproducibility.thresholds_sha256) out.warnings.push("thresholds.json differs: the success rules changed between the reports, claims are NOT valid");
  if (out.warnings.length) out.valid = false;

  // 1. Shot classification, paired shot by shot where the matched shots are the same list
  for (const key of ["current_ball6_30fps", "current_ball6_15fps"]) {
    const sa = a.sections.shot_classification?.[key], sb = b.sections.shot_classification?.[key];
    if (!sa?.clips || !sb?.clips) { add("shots/" + key, "unavailable", "missing in one report"); continue; }
    let gained = 0, lost = 0, clipRegression = [];
    for (const ca of sa.clips) {
      const cb = sb.clips.find((x) => x.clip === ca.clip);
      if (!cb) { add(`shots/${key}/${ca.clip}`, "unavailable", "clip missing in the candidate"); continue; }
      const dv = cb.correct.v4 - ca.correct.v4;
      if (dv <= -2) clipRegression.push(`${ca.clip} ${dv}`);
      // paired per WRITTEN shot: a shot never counted is wrong, so finding more shots can only help and losing one can only hurt
      const right = (s) => s.seen && s.v4 === s.truth;
      if (ca.per_shot.length === cb.per_shot.length && ca.per_shot.every((s, i) => s.truth === cb.per_shot[i].truth)) {
        ca.per_shot.forEach((s, i) => { const r0 = right(s), r1 = right(cb.per_shot[i]); if (r1 && !r0) gained += 1; if (r0 && !r1) lost += 1; });
      } else add(`shots/${key}/${ca.clip}`, "unavailable", "the written lists differ between the reports, so a paired comparison is not possible");
    }
    const p = mcnemarExact(gained, lost), net = gained - lost;
    let verdict = "no change";
    if (clipRegression.length || net <= -3) verdict = "REGRESSION";
    else if (net >= 5 && !clipRegression.length) verdict = "improvement";
    add("shots/" + key, verdict, `V4 paired: ${gained} gained, ${lost} lost, net ${net >= 0 ? "+" : ""}${net}, exact p=${p.toFixed(3)}${clipRegression.length ? "; clips losing 2+: " + clipRegression.join(", ") : ""}`);
  }

  // 2. Detection and localization on annotated frames (out-of-sample strata only for claims)
  const da = a.sections.detection_and_localization?.ball6?.out_of_sample_clips?.all, db = b.sections.detection_and_localization?.ball6?.out_of_sample_clips?.all;
  if (da && db) {
    const dr = db.recall.p - da.recall.p, dp = db.precision.p - da.precision.p;
    let verdict = "no change";
    if (dr < -0.03 || dp < -0.03) verdict = "REGRESSION";
    else if ((dr >= 0.03 && dp >= -0.01) || (dp >= 0.03 && dr >= -0.01)) verdict = "improvement";
    add("detection/out_of_sample", verdict, `recall ${pct(da.recall.p)} -> ${pct(db.recall.p)} (${dr >= 0 ? "+" : ""}${(100 * dr).toFixed(1)} pts), precision ${pct(da.precision.p)} -> ${pct(db.precision.p)} (${dp >= 0 ? "+" : ""}${(100 * dp).toFixed(1)} pts); n=${db.annotated_balls} balls, ${db.boxes} boxes; intervals overlap-check is left to the reader`);
    const ea = da.centre_error_px, eb = db.centre_error_px;
    if (!ea.unavailable && !eb.unavailable) {
      const floor = a.sections.detection_and_localization?.annotation_repeatability?.centre_difference_px?.median ?? 0;
      const growth = (eb.median - ea.median) / ea.median, g95 = (eb.p95 - ea.p95) / ea.p95;
      add("localization", growth > 0.25 || g95 > 0.25 ? "REGRESSION" : "no change", `median ${ea.median.toFixed(2)} -> ${eb.median.toFixed(2)} px, p95 ${ea.p95.toFixed(2)} -> ${eb.p95.toFixed(2)} px; annotation repeatability floor about ${floor.toFixed(2)} px: differences below it are not claims`);
    } else add("localization", "unavailable", "fewer than 5 matched balls in one report");
  } else add("detection", "unavailable", "annotated-frame results missing in one report");

  // 3. Tracking cells: a candidate method against the BEST baseline in the same cell
  for (const part of ["interpolation", "prediction"]) {
    const ta = a.sections.tracking?.[part], tb = b.sections.tracking?.[part];
    if (!ta || !tb) continue;
    let better = 0, worse = 0, cells = 0, noCandidate = true;
    for (const [fps, groups] of Object.entries(tb)) for (const [g, regs] of Object.entries(groups)) for (const [reg, ks] of Object.entries(regs)) for (const [k, methods] of Object.entries(ks)) {
      const base = Object.entries(methods).filter(([m, v]) => BASELINE_METHODS.has(m) && !v.unavailable);
      const cand = Object.entries(methods).filter(([m, v]) => !BASELINE_METHODS.has(m) && !v.unavailable);
      if (!base.length || !cand.length) continue;
      noCandidate = false; cells += 1;
      const best = base.reduce((x, y) => (y[1].median < x[1].median ? y : x));
      for (const [m, v] of cand) {
        if (v.median <= 0.8 * best[1].median && v.p95 <= 1.1 * best[1].p95) better += 1;
        else if (v.median > best[1].median * 1.1 || v.p95 > best[1].p95 * 1.2) worse += 1;
      }
    }
    if (noCandidate) add("tracking/" + part, "no candidate", "the candidate report has no method beyond the baselines");
    else add("tracking/" + part, worse > better ? "REGRESSION" : better > 0 ? "improvement (cell-wise, see the table)" : "no change", `${better} cells meet the improvement rule (median >= 20% below the best baseline AND p95 within +10%), ${worse} are worse, of ${cells} cells; k and region are never pooled`);
  }

  // 4. Performance
  const pa = a.sections.performance?.offline_inference_desktop, pb = b.sections.performance?.offline_inference_desktop;
  if (pa?.ms_median && pb?.ms_median) {
    const g = (pb.ms_median - pa.ms_median) / pa.ms_median;
    add("performance/inference", g > 0.1 ? "REGRESSION" : "no change", `desktop median ${pa.ms_median.toFixed(1)} -> ${pb.ms_median.toFixed(1)} ms (${(100 * g).toFixed(1)}%); desktop numbers, not phone numbers`);
  } else add("performance/inference", "unavailable", "missing in one report");
  return out;
}

export function renderComparison(c) {
  const lines = ["# Comparison", ""];
  if (c.warnings.length) lines.push("**NOT A VALID COMPARISON**", ...c.warnings.map((w) => "- " + w), "");
  lines.push("| Area | Verdict | Detail |", "|---|---|---|");
  for (const f of c.findings) lines.push(`| ${f.area} | ${f.verdict} | ${f.text} |`);
  return lines.join("\n") + "\n";
}
