// Renders a regression report (JSON) as a readable Markdown document.
const f = (x, d = 2) => (typeof x === "number" ? x.toFixed(d) : "n/a");
const p = (w) => (w ? `${(100 * w.p).toFixed(0)}% (${(100 * w.lo).toFixed(0)}-${(100 * w.hi).toFixed(0)}, n=${w.n})` : "n/a");
const dist = (d) => (!d ? "n/a" : d.unavailable ? `unavailable (${d.unavailable})` : `n=${d.n}, median ${f(d.median)} [${f(d.median_ci95?.lo)}-${f(d.median_ci95?.hi)}], p90 ${f(d.p90, 1)}, p95 ${f(d.p95, 1)}, max ${f(d.max, 1)}`);

export function renderReport(r) {
  const L = [];
  L.push(`# Regression report: ${r.id}`, "", `Generated ${r.generated}. Code ${r.code.git_commit?.slice(0, 10) ?? "?"}${r.code.working_tree_dirty ? " (src/ had uncommitted changes)" : ""}.`);
  L.push(`App under test: rule ${r.app_under_test.live_rule}, model ${r.app_under_test.model_version}, model sha256 ${r.app_under_test.model_sha256.slice(0, 12)}.`);
  L.push(`Evaluation set: datasets sha256 ${r.reproducibility.datasets_sha256.slice(0, 12)}, thresholds sha256 ${r.reproducibility.thresholds_sha256.slice(0, 12)}, lock problems: ${r.reproducibility.lock_problems.length || "none"}.`, "");
  L.push("## Limitations (read first)", ...r.limitations.map((x) => "- " + x), "");

  const sc = r.sections.shot_classification;
  L.push("## 1. Shot classification", "", `Alignment caveat: ${sc.alignment_caveat}`, "");
  for (const key of ["current_ball6_30fps", "current_ball6_15fps", "previous_ball5_30fps_reference"]) {
    const s = sc[key];
    if (!s) continue;
    L.push(`### ${s.model}, ${s.fps_mode}, window: ${s.window}`, "", "| Clip | Role | Detector in-sample | Written | Counted | Matched | V1 | V2 | V3 | V4 (live) | V4 of all written (95% interval) | Pairing |", "|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const c of s.clips) L.push(`| ${c.clip} | ${c.role} | ${c.detector_in_sample ? "yes" : "NO"} | ${c.written} | ${c.counted} | ${c.matched} | ${c.correct.v1} | ${c.correct.v2} | ${c.correct.v3} | **${c.correct.v4}** | ${p(c.accuracy_of_written.v4)} | ${c.alignment} |`);
    for (const k of s.skipped) L.push(`| ${k.clip} | | | | | | | | | | | not scored: ${k.reason} |`);
    L.push("");
    if (s.pooled_all) L.push(`Pooled over ${s.pooled_all.clips} clips (${s.pooled_all.written} written shots, ${s.pooled_all.matched} matched): V4 right on **${s.pooled_all.correct.v4} of ${s.pooled_all.written}** written shots ${p(s.pooled_all.accuracy_of_written.v4)}; on matched shots only ${p(s.pooled_all.accuracy.v4)}; V2 of all written ${p(s.pooled_all.accuracy_of_written.v2)}. ${s.pooled_note}.`);
    if (s.clip_level_mean_accuracy_v4_ci95) L.push(`Clip-level mean V4 accuracy, bootstrap 95% interval: ${f(100 * s.clip_level_mean_accuracy_v4_ci95.lo, 0)}-${f(100 * s.clip_level_mean_accuracy_v4_ci95.hi, 0)}%.`);
    for (const [role, v] of Object.entries(s.by_role)) L.push(`- ${role}: V4 ${v.correct.v4} of ${v.written} written (${p(v.accuracy_of_written.v4)}); ${v.matched} matched`);
    L.push("");
  }

  const d = r.sections.detection_and_localization;
  L.push("## 2. Detection and localization on annotated frames", "");
  if (d.ball6) {
    L.push(`Annotator: ${d.annotator.id} (${d.annotator.kind}). ${d.frames_annotated} frame records. ${d.note}.`, "", `**Annotation repeatability** (12 frames annotated twice): ball count agreement ${p(d.annotation_repeatability.ball_count_agreement)}; centre difference ${dist(d.annotation_repeatability.centre_difference_px)} px. Localization differences below this are not claims.`, "");
    for (const grp of ["out_of_sample_clips", "in_sample_clips"]) {
      L.push(`### ball-6, ${grp === "out_of_sample_clips" ? "clips ball-6 never trained on" : "clips ball-6 trained on (in-sample)"} (${d.ball6.n[grp === "out_of_sample_clips" ? "out_of_sample" : "in_sample"]} frames)`, "", "| Stratum | Frames | Annotated balls | Recall | Precision | Centre error (px) | Box width / ball |", "|---|---|---|---|---|---|---|");
      for (const [k, v] of Object.entries(d.ball6[grp])) L.push(`| ${k} | ${v.frames} | ${v.annotated_balls} | ${p(v.recall)} | ${p(v.precision)} | ${dist(v.centre_error_px)} | ${v.box_width_over_ball_diameter.median ? f(v.box_width_over_ball_diameter.median) : "n/a"} |`);
      L.push("");
    }
  } else for (const [k, v] of Object.entries(d)) L.push(`- ${k}: **unavailable** (${v.unavailable})`);

  const c = r.sections.circle_fit_independence;
  L.push("", "## 3. Is the circle-fit independent?", "");
  if (c.unavailable) L.push(`Unavailable: ${c.unavailable}`);
  else {
    L.push(c.what, "", "From the code:", ...c.from_the_code.map((x) => "- " + x), "");
    L.push(`- Seed stability: ${c.seed_stability.frames_tried} frames could be tested (${c.seed_stability.excluded_because_the_search_region_was_clamped_at_the_crop_edge} excluded: ball too near the crop edge for a fair test); ${c.seed_stability.frames_with_a_circle_at_the_true_seed} gave a circle at the true seed; when the seed moves 8-17 px the fit moves ${dist(c.seed_stability.movement_of_fit_when_seed_moves_px)} px; share landing >6 px away: ${p(c.seed_stability.share_of_shifted_fits_landing_more_than_6px_from_the_true_seed_fit)}.`);
    L.push(`- Against manual truth: accepted by the training criterion ${p(c.against_manual_truth.accepted_by_training_criterion)}; centre error ${dist(c.against_manual_truth.centre_error_px)} px.`);
    for (const [g, v] of Object.entries(c.imitation_check)) L.push(`- Imitation check, ${g} (${v.frames} frames): model vs truth ${dist(v.model_vs_truth_px)}; circle vs truth ${dist(v.circle_vs_truth_px)}; model vs circle ${dist(v.model_vs_circle_px)}.`);
    L.push("", c.imitation_reading);
  }

  const t = r.sections.tracking;
  L.push("", "## 4. Tracking (three separate evaluations)", "", `Source: ${t.source}. Clips: ${t.clips_used?.join(", ") ?? "none"}.`, "", "### Coverage and gaps (descriptive; not recall)", "", "| Clip | Role | Frames | Share with a box | Frames with 2+ boxes | Runs >=6 | Run length median / p90 | Short gaps median / p90 | Most repeated box spot (a static false box if large) |", "|---|---|---|---|---|---|---|---|---|");
  for (const [k, v] of Object.entries(t.coverage ?? {})) L.push(`| ${k} | ${v.role} | ${v.frames} | ${p({ p: v.share_of_frames_with_a_box, lo: v.share_of_frames_with_a_box, hi: v.share_of_frames_with_a_box, n: v.frames }).split(" ")[0]} | ${v.frames_with_more_than_one_box} | ${v.runs_of_consecutive_single_boxes.at_least_6} | ${v.runs_of_consecutive_single_boxes.length_median} / ${f(v.runs_of_consecutive_single_boxes.length_p90, 0)} | ${v.short_gaps_1_to_8_frames.median} / ${f(v.short_gaps_1_to_8_frames.p90, 0)} | ${v.most_repeated_box_location ? `(${v.most_repeated_box_location.x}, ${v.most_repeated_box_location.y}): ${v.most_repeated_box_location.frames_with_a_box_there} frames (${(100 * v.most_repeated_box_location.share_of_clip_frames).toFixed(1)}%), median width ${f(v.most_repeated_box_location.median_width, 0)}, score ${f(v.most_repeated_box_location.median_score)}` : "n/a"} |`);
  for (const [part, title, unit] of [["interpolation", "Interpolation: hide k frames, reconstruct from before AND after (reference = the detector's own observation)", "k"], ["prediction", "Prediction: predict h frames ahead from the past only", "h"]]) {
    L.push("", `### ${title}`);
    for (const [fps, groups] of Object.entries(t[part] ?? {})) {
      const g = groups.all ?? Object.values(groups)[0];
      L.push("", `**${fps}, all clips pooled** (per-role cells are in the JSON; k and region are never pooled). Median error px [p95, max] per method. Points inside a flight overlap, so intervals in the JSON are cluster bootstraps by flight and the honest sample size is the flight count:`, "", `| Region | ${unit} | n points (independent flights) | ${Object.keys(Object.values(Object.values(g)[0])[0]).join(" | ")} |`, `|---|---|---|${Object.keys(Object.values(Object.values(g)[0])[0]).map(() => "---").join("|")}|`);
      for (const [reg, ks] of Object.entries(g)) for (const [k, ms] of Object.entries(ks)) L.push(`| ${reg} | ${k} | ${Object.values(ms)[0].n} (${Object.values(ms)[0].n_groups ?? "?"} flights) | ${Object.values(ms).map((v) => (v.unavailable ? "unavailable" : `${f(v.median)} [${f(v.p95, 1)}, ${f(v.max, 0)}]`)).join(" | ")} |`);
    }
  }
  L.push("", "### Association (SYNTHETIC distractors; real-data association is unavailable)", "");
  for (const [fps, a] of Object.entries(t.association ?? {})) {
    if (!a.results) continue;
    L.push(`**${fps}**: ${a.kind}`, "", "| Distractor | Method | Right ball | Wrong ball (identity switch) | No pick |", "|---|---|---|---|---|");
    for (const [type, rows] of Object.entries(a.results)) for (const [m, x] of Object.entries(rows)) L.push(`| ${type} | ${m.replace("nearest_to_", "")} | ${(100 * x.true_picked / x.decisions).toFixed(1)}% | ${(100 * x.wrong_picked / x.decisions).toFixed(1)}% | ${(100 * x.none_picked / x.decisions).toFixed(1)}% |`);
    L.push("");
  }

  const pf = r.sections.performance;
  L.push("## 5. Performance and deployment", "");
  if (pf.unavailable) L.push(`Unavailable: ${pf.unavailable}`);
  else {
    L.push(`Measured on: ${pf.measured_on.machine} (${pf.measured_on.label}).`, `- App constants (from source): ${JSON.stringify(pf.app_constants_from_source)}`, `- Model ${(pf.sizes_bytes.ball6_model / 1e6).toFixed(2)} MB; runtime wasm ${pf.sizes_bytes.ort_wasm_files.map((x) => `${x.file} ${(x.bytes / 1e6).toFixed(1)} MB`).join(", ")}.`, `- Offline inference (desktop, 1 WASM thread): median ${f(pf.offline_inference_desktop.ms_median, 1)} ms, p95 ${f(pf.offline_inference_desktop.ms_p95, 1)} ms over ${pf.offline_inference_desktop.frames_timed} frames. ${pf.offline_inference_desktop.caution}`, `- Motion gate (model runs per 15 fps frame): ${pf.motion_gate.range ? `${f(pf.motion_gate.range.min)} to ${f(pf.motion_gate.range.max)}` : "n/a"}. ${pf.motion_gate.reading}`, `- Replay buffer: ${pf.replay_buffer_estimate.what} about ${(pf.replay_buffer_estimate.approx_total_bytes / 1e6).toFixed(1)} MB.`);
    for (const x of pf.phone.documented_not_reproduced) L.push(`- Phone (documented, not reproduced): ${x.model}: ${x.result}. Source: ${x.source}.`);
    L.push(`- Phone ball-6 soak: **unavailable** (${pf.phone.ball6_soak.unavailable}). Phone memory: **unavailable** (${pf.phone.memory.unavailable}). Field speed: **unavailable** (${pf.phone.field_speed.unavailable}).`);
    if (pf.app_in_chromium && !pf.app_in_chromium.unavailable) L.push(`- App in desktop Chromium: ${JSON.stringify(pf.app_in_chromium)}`);
    else L.push("- App in desktop Chromium: unavailable (not run).");
  }
  L.push("", "## Unavailable metrics", "", ...r.unavailable.map((u) => `- **${u.metric}**: ${u.reason}`), "");
  return L.join("\n");
}
