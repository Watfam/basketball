// Assembles annotations.json from the hand-written parts in annotate/parts/*.json (one per sheet, plus events.json).
// A part is { "frames": [...] } and/or { "events": [...] }. The annotator block is fixed here so it cannot drift between parts.
//   node training/eval/annotate/merge.mjs
import fs from "node:fs";
import path from "node:path";
import { ROOT, readJSON } from "../lib/registry.mjs";
import { validate } from "./validate.mjs";

const dir = path.join(ROOT, "training/eval/annotate/parts");
const frames = [], events = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
  const part = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  frames.push(...(part.frames ?? [])); events.push(...(part.events ?? []));
}
const manifest = readJSON("training/eval/annotate/manifest.json");
const annotations = {
  schema: "eval-annotations-v1",
  coordinate_system: "416 px hoop window as the model sees it (the registry window cut and scaled to 416), x right, y down, pixels; diameter is the ball's apparent width",
  annotator: {
    id: "claude-visual-1",
    kind: "single AI visual annotator (no human second opinion yet)",
    blind_to: ["detector output", "circle-fit", "clip id", "frame number", "stratum"],
    protocol: "Looked at gridded sheets (grid every 25 px, labels every 50) of four frames at a time, in blind id order; centre read to about 2 px against the grid; a ball is annotated when at least half of it is visible, occluded_guess when its position is inferred from context; distractors listed by type; 12 frames were repeated under new ids to measure repeatability.",
    reviewed_by_human: false,
    repeatability_caveat: "the 12 repeats were annotated in the same session by the same annotator, who had seen the earlier sheets: they are not independent of memory, so the measured repeatability is an OPTIMISTIC floor on the annotation error",
  },
  frames, events,
};
const problems = validate(manifest, annotations);
fs.writeFileSync(path.join(ROOT, "training/eval/annotate/annotations.json"), JSON.stringify(annotations, null, 1) + "\n");
console.log(`${frames.length} frames, ${events.length} events; ${problems.length ? "PROBLEMS:\n" + problems.slice(0, 20).join("\n") : "valid"}`);
