// Runs the ball models on exactly the annotated frames (the 416 px window the model would see) and saves every box at score >= 0.2.
// The models never see the annotations, and the annotations were made without seeing any model box.
//   node training/eval/annotate/score-annotated.mjs   -> training/work/eval/annotated-detections.json
import fs from "node:fs";
import path from "node:path";
import { ROOT, readJSON } from "../lib/registry.mjs";
import { createRunner } from "../lib/model.mjs";

const manifest = readJSON("training/eval/annotate/manifest.json");
const work = path.join(ROOT, "training/work/eval");
const models = { ball6: path.join(ROOT, "public/models/ball-6.onnx"), ball5: path.join(ROOT, "Training Video/ball-5.onnx") };
const out = {};
for (const [name, file] of Object.entries(models)) {
  if (!fs.existsSync(file)) { console.log(`${name}: model file missing, skipped`); continue; }
  const runner = await createRunner(file);
  out[name] = {};
  for (const f of manifest.frames) {
    const rgb = fs.readFileSync(path.join(work, "frames", f.id + ".rgb"));
    out[name][f.id] = (await runner.detect(rgb)).boxes;
  }
  console.log(`${name}: ${manifest.frames.length} frames scored`);
}
fs.writeFileSync(path.join(work, "annotated-detections.json"), JSON.stringify(out));
