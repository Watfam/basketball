// Checks annotations.json against the manifest: every frame annotated once, fields valid, nothing outside the picture.
//   node training/eval/annotate/validate.mjs
import fs from "node:fs";
import path from "node:path";
import { ROOT, readJSON } from "../lib/registry.mjs";

export const VISIBILITY = ["clear", "partial", "occluded_guess"];
export const CONFIDENCE = ["high", "medium", "low"];
export const DISTRACTORS = ["shirt", "head", "shadow", "net", "rim", "backboard", "other"];
export const EVENT_TYPES = ["release", "rim_interaction", "no_shot"];
export const OUTCOMES = ["make", "miss", "uncertain"];
export const RIM_DETAILS = ["swish", "rim_then_in", "backboard_then_in", "rim_out", "backboard_miss", "front_rim_miss", "air_ball", "other"];
export const TAGS = ["in_flight", "at_rim", "below_net", "in_hand", "on_ground", "blurred", "occluded", "no_ball_visible", "second_ball", "against_trees", "against_sky", "against_backboard", "against_ground"];

export function validate(manifest, ann) {
  const problems = [];
  if (!ann.annotator?.id || !ann.annotator?.kind) problems.push("annotator.id and annotator.kind are required");
  const ids = new Set(manifest.frames.map((f) => f.id));
  const seen = new Set();
  for (const f of ann.frames ?? []) {
    if (!ids.has(f.id)) { problems.push(`${f.id}: not in the manifest`); continue; }
    if (seen.has(f.id)) problems.push(`${f.id}: annotated twice`);
    seen.add(f.id);
    if (!Array.isArray(f.balls)) { problems.push(`${f.id}: balls must be a list (empty if none)`); continue; }
    for (const b of f.balls) {
      for (const k of ["cx", "cy", "diameter"]) if (typeof b[k] !== "number") problems.push(`${f.id}: ball.${k} must be a number`);
      if (b.cx < 0 || b.cx > 416 || b.cy < 0 || b.cy > 416) problems.push(`${f.id}: ball centre outside the 416 px window`);
      if (b.diameter < 6 || b.diameter > 90) problems.push(`${f.id}: ball diameter ${b.diameter} is not plausible`);
      if (!VISIBILITY.includes(b.visibility)) problems.push(`${f.id}: visibility must be one of ${VISIBILITY}`);
      if (!CONFIDENCE.includes(b.confidence)) problems.push(`${f.id}: confidence must be one of ${CONFIDENCE}`);
    }
    for (const d of f.distractors ?? []) if (!DISTRACTORS.includes(d.kind)) problems.push(`${f.id}: distractor kind ${d.kind}`);
    for (const t of f.tags ?? []) if (!TAGS.includes(t)) problems.push(`${f.id}: unknown tag ${t}`);
  }
  for (const id of ids) if (!seen.has(id)) problems.push(`${id}: missing`);
  for (const [i, e] of (ann.events ?? []).entries()) {
    const at = `event ${i} (${e.clip} f${e.frame})`;
    if (!EVENT_TYPES.includes(e.type)) problems.push(`${at}: type must be one of ${EVENT_TYPES}`);
    if (typeof e.frame !== "number" || typeof e.clip !== "string") problems.push(`${at}: clip and frame are required`);
    if (typeof e.visible !== "boolean") problems.push(`${at}: visible must be true or false (false = looked for it, not in the picture)`);
    if (e.type === "rim_interaction" && e.visible && !RIM_DETAILS.includes(e.detail)) problems.push(`${at}: detail must be one of ${RIM_DETAILS}`);
    if (e.type === "rim_interaction" && e.visible && !OUTCOMES.includes(e.outcome_seen)) problems.push(`${at}: outcome_seen must be one of ${OUTCOMES}`);
    if (!CONFIDENCE.includes(e.confidence)) problems.push(`${at}: confidence must be one of ${CONFIDENCE}`);
  }
  return problems;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const manifest = readJSON("training/eval/annotate/manifest.json");
  const file = path.join(ROOT, "training/eval/annotate/annotations.json");
  if (!fs.existsSync(file)) { console.log("annotations.json does not exist yet"); process.exit(1); }
  const problems = validate(manifest, JSON.parse(fs.readFileSync(file, "utf8")));
  console.log(problems.length ? problems.join("\n") : `ok: ${manifest.frames.length} frames annotated`);
  process.exit(problems.length ? 1 : 0);
}
