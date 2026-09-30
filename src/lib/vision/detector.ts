import type * as Ort from "onnxruntime-web";
import { COCO_PERSON, COCO_SPORTS_BALL, PAD_VALUE, decode, preprocess, type Detection, type Pixels } from "@/lib/vision/yolox";

/**
 * Runs a YOLOX model in the browser with ONNX Runtime Web.
 *
 * The runtime is loaded from /ort as a plain static file instead of being
 * bundled, and the bundler is told to leave the import alone. Bundling it
 * breaks the runtime's own worker and wasm loading, and it would drag
 * every runtime variant (~80 MB) into the app.
 *
 * Nothing here talks to a server after the model and runtime have loaded:
 * frames are processed on the device and never leave it.
 */

export type Backend = "webgpu" | "wasm";

export type Timings = { prepMs: number; inferMs: number; postMs: number };

export type Detector = {
  backend: Backend;
  inputSize: number;
  detect(frame: Pixels): Promise<{ detections: Detection[]; timings: Timings }>;
  dispose(): Promise<void>;
};

const MODEL_URL = "/models/yolox_nano.onnx";
const INPUT_SIZE = 416;
const NUM_CLASSES = 80;

let ortPromise: Promise<typeof Ort> | null = null;

async function loadOrt(backend: Backend): Promise<typeof Ort> {
  // One runtime per page: switching backends means a reload, which is
  // rare enough (a lab toggle) that supporting both at once isn't worth it.
  if (!ortPromise) {
    const entry = backend === "webgpu" ? "/ort/ort.webgpu.min.mjs" : "/ort/ort.wasm.min.mjs";
    ortPromise = import(/* webpackIgnore: true */ /* turbopackIgnore: true */ entry) as Promise<typeof Ort>;
  }
  const ort = await ortPromise;
  ort.env.wasm.wasmPaths = "/ort/";
  // Threaded wasm needs cross-origin isolation, which the app doesn't opt
  // into; one thread is the honest setting for the CPU fallback.
  ort.env.wasm.numThreads = 1;
  // The CPU backend runs on the page's own thread unless told otherwise,
  // which janks every animation and tap while a frame is processing. A
  // worker keeps the page responsive. WebGPU can't use one (it has to run
  // where the GPU is), but it doesn't need to: its work is genuinely
  // asynchronous.
  ort.env.wasm.proxy = backend === "wasm";
  return ort;
}

export async function createDetector(
  backend: Backend,
  onStep: (step: string) => void = () => {}
): Promise<Detector> {
  onStep("Loading the runtime");
  const ort = await loadOrt(backend);

  onStep("Loading the model and preparing the GPU or CPU");
  const session = await ort.InferenceSession.create(MODEL_URL, {
    executionProviders: [backend],
    graphOptimizationLevel: "all",
  });
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];

  // GPU: one input buffer and tensor, reused for every frame of the same
  // size. Allocating ~3 MB per frame at 20 fps is 60 MB/s of garbage,
  // which a phone eventually answers by closing the page.
  //
  // CPU: not reused. That backend runs in a worker, and sending it a
  // buffer hands ownership over (the page's copy becomes unusable), so
  // every frame needs a fresh one.
  const reuseInput = backend === "webgpu";
  let scratch: Float32Array | null = null;
  let scratchTensor: Ort.Tensor | null = null;
  let scratchFor = "";

  return {
    backend,
    inputSize: INPUT_SIZE,

    async detect(frame) {
      const t0 = performance.now();
      let input: Ort.Tensor;
      let letterbox;
      if (reuseInput) {
        const key = `${frame.width}x${frame.height}`;
        if (!scratch || !scratchTensor || scratchFor !== key) {
          scratch = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE).fill(PAD_VALUE);
          scratchTensor = new ort.Tensor("float32", scratch, [1, 3, INPUT_SIZE, INPUT_SIZE]);
          scratchFor = key;
        }
        letterbox = preprocess(frame, INPUT_SIZE, scratch).letterbox;
        input = scratchTensor;
      } else {
        const prepared = preprocess(frame, INPUT_SIZE);
        letterbox = prepared.letterbox;
        input = new ort.Tensor("float32", prepared.tensor, [1, 3, INPUT_SIZE, INPUT_SIZE]);
      }
      const t1 = performance.now();

      const out = await session.run({ [inputName]: input });
      const raw = out[outputName].data as Float32Array;
      const t2 = performance.now();

      const detections = decode(raw, NUM_CLASSES, INPUT_SIZE, letterbox, frame, {
        scoreThreshold: 0.25,
        classes: [COCO_SPORTS_BALL, COCO_PERSON],
      });
      const t3 = performance.now();

      return { detections, timings: { prepMs: t1 - t0, inferMs: t2 - t1, postMs: t3 - t2 } };
    },

    async dispose() {
      await session.release();
    },
  };
}

/**
 * Hands control back to the browser so it can paint, handle a tap, and
 * run its own timers before the next frame.
 *
 * Needed because the CPU backend runs the whole model as one
 * uninterrupted block: a loop that only ever awaits it never yields to
 * the event loop, so the screen freezes and Stop can't be pressed.
 * scheduler.yield is used where it exists; a MessageChannel hop is the
 * fallback, because unlike setTimeout it isn't clamped to 4 ms.
 */
const yieldChannel = typeof MessageChannel !== "undefined" ? new MessageChannel() : null;
export function yieldToMain(): Promise<void> {
  const sched = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (sched?.yield) return sched.yield();
  if (!yieldChannel) return new Promise((r) => setTimeout(r, 0));
  return new Promise((resolve) => {
    yieldChannel.port1.onmessage = () => resolve();
    yieldChannel.port2.postMessage(null);
  });
}

export { COCO_PERSON, COCO_SPORTS_BALL };
