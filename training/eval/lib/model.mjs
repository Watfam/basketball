// Runs a ball model on 416 px window pictures in Node, with the app's own YOLOX pre- and post-processing (src/lib/vision/yolox.ts).
// One CPU thread, WASM: the same runtime family as the phone, but a desktop CPU, so timings from here are NOT phone timings.
import fs from "node:fs";
import * as ort from "onnxruntime-web";
import { loadVision } from "./transpile.mjs";

export async function createRunner(modelFile, { scoreThreshold = 0.2 } = {}) {
  const { yolox } = await loadVision();
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create(new Uint8Array(fs.readFileSync(modelFile)), { executionProviders: ["wasm"] });
  const SIZE = 416;
  return {
    bytes: fs.statSync(modelFile).size,
    /** rgb: 416x416x3 bytes. Returns boxes in window pixels, best first, and the milliseconds the run took. */
    async detect(rgb) {
      const rgba = new Uint8ClampedArray(SIZE * SIZE * 4);
      for (let p = 0, q = 0; p < rgb.length; p += 3, q += 4) { rgba[q] = rgb[p]; rgba[q + 1] = rgb[p + 1]; rgba[q + 2] = rgb[p + 2]; rgba[q + 3] = 255; }
      const img = { width: SIZE, height: SIZE, data: rgba };
      const t0 = performance.now();
      const { tensor, letterbox } = yolox.preprocess(img, SIZE);
      const o = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", tensor, [1, 3, SIZE, SIZE]) });
      const dets = yolox.decode(o[session.outputNames[0]].data, 1, SIZE, letterbox, img, { scoreThreshold, classes: [0] });
      return { ms: performance.now() - t0, boxes: dets.map((d) => ({ x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2, score: d.score })).sort((a, b) => b.score - a.score) };
    },
  };
}
