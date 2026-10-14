// Performance and deployment measurements. Each number says WHERE it was measured. Phone numbers come only from the phone.
//   node training/eval/perf.mjs     (run on an otherwise idle machine)  -> training/eval/reports/performance.json
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT, EVAL, loadRegistry } from "./lib/registry.mjs";
import { createRunner } from "./lib/model.mjs";
import { windowFrames } from "./lib/frames.mjs";
import { quantile } from "./lib/stats.mjs";

const reg = loadRegistry();
const hook = fs.readFileSync(path.join(ROOT, "src/lib/vision/use-camera-counter.ts"), "utf8");
const num = (name) => Number(new RegExp(`const ${name} = ([\\d_.]+)`).exec(hook)?.[1].replace(/_/g, ""));
const constants = { loop_fps_target: num("FPS"), slow_fps_floor: num("SLOW_FPS"), no_ball_warning_ms: num("NO_BALL_MS"), replay_frame_px: num("REPLAY_SIZE"), replay_jpeg_quality: num("REPLAY_QUALITY"), motion_threshold: num("MOTION_THRESHOLD"), still_hold_ms: num("STILL_HOLD_MS") };

const sizeOf = (f) => (fs.existsSync(path.join(ROOT, f)) ? fs.statSync(path.join(ROOT, f)).size : null);
const ortDir = path.join(ROOT, "public/ort");
const ortFiles = fs.existsSync(ortDir) ? fs.readdirSync(ortDir).filter((f) => f.endsWith(".wasm")).map((f) => ({ file: f, bytes: sizeOf("public/ort/" + f) })) : [];

// offline inference timing on real frames (IMG_4874 window, mid-clip), one WASM thread
const clip = reg.clips.find((c) => c.id === "IMG_4874");
const runner = await createRunner(path.join(ROOT, "public/models/ball-6.onnx"));
const frames = [];
for (const { n, rgb } of windowFrames(clip)) { if (n >= 1500 && n < 1620) frames.push(Buffer.from(rgb)); if (n >= 1620) break; }
const times = [];
for (let i = 0; i < frames.length; i += 1) { const r = await runner.detect(frames[i]); if (i >= 8) times.push(r.ms); } // first 8 are warm-up
const gate = {};
for (const c of reg.clips) {
  const f = path.join(ROOT, `training/work/eval/activity-${c.id}.json`);
  if (fs.existsSync(f)) { const a = JSON.parse(fs.readFileSync(f, "utf8")); gate[c.id] = { frames_15fps: a.processed_15fps, model_runs: a.model_runs, share_of_frames_sent_to_model: a.gate_open_share }; }
}
const gateShares = Object.values(gate).map((g) => g.share_of_frames_sent_to_model);
const appFile = path.join(EVAL, "reports/performance-app.json");

const out = {
  measured_on: { machine: `${os.cpus()[0].model}, ${os.cpus().length} cores, ${Math.round(os.totalmem() / 2 ** 30)} GB`, node: process.version, label: "DESKTOP, not a phone" },
  app_constants_from_source: constants,
  sizes_bytes: { ball6_model: runner.bytes, ort_wasm_files: ortFiles },
  offline_inference_desktop: {
    what: "ball-6 on 416 px window frames, onnxruntime-web WASM, 1 thread, preprocess + run + decode",
    frames_timed: times.length, ms_median: quantile(times, 0.5), ms_p95: quantile(times, 0.95), ms_max: Math.max(...times),
    caution: "a desktop CPU is far faster than an iPhone; use only as a relative baseline for 'did a change make inference slower'",
  },
  motion_gate: {
    what: "share of 15 fps frames on which the app's motion gate (threshold and hold read from source) opens, so the model runs; simulated on the saved clips, independent of the detector",
    per_clip: gate,
    range: gateShares.length ? { min: Math.min(...gateShares), max: Math.max(...gateShares) } : null,
    reading: "the model is sent most frames on these clips: plan for near-continuous inference, not for a mostly idle model",
    caution: "scene-dependent (wind, people in the window); the phone camera's own noise may differ from decoded video",
  },
  replay_buffer_estimate: {
    what: "DERIVED from source constants, not measured: frames kept for the 6 s replay",
    frames: Math.round(6 * constants.loop_fps_target), approx_bytes_per_frame_assumed: 15000,
    approx_total_bytes: Math.round(6 * constants.loop_fps_target * 15000),
  },
  phone: {
    documented_not_reproduced: [{ source: "training/README.md, 'First 10-minute live soak on Matt's iPhone (2026-10-06)'", model: "ball-5 (same architecture and size as ball-6)", result: "20.5 fps in minute 1, 15.3 in minute 5, 12.1 in minute 10; model time per frame 39 ms rising to 68 ms; average 15.4 fps; speed fell steadily with heat" }],
    ball6_soak: { unavailable: "no 10-minute soak with ball-6 and the current app has been run on a phone" },
    memory: { unavailable: "iOS Safari exposes no per-page memory; desktop Chromium numbers below are not phone numbers" },
    field_speed: { unavailable: "camera_report (migration 0022, live) now records average and slowest fps per saved set; no sets saved since, so there is nothing to read yet" },
  },
  app_in_chromium: fs.existsSync(appFile) ? JSON.parse(fs.readFileSync(appFile, "utf8")) : { unavailable: "perf-app.mjs not run" },
};
fs.writeFileSync(path.join(EVAL, "reports/performance.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`inference median ${out.offline_inference_desktop.ms_median.toFixed(1)} ms (p95 ${out.offline_inference_desktop.ms_p95.toFixed(1)}), model ${(runner.bytes / 1e6).toFixed(2)} MB, gate share ${gateShares.length ? Object.values(out.motion_gate.range).map((v) => v.toFixed(2)).join("-") : "n/a"}`);
