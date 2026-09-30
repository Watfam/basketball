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
  /** Which buffer strategy is in use, for the report. */
  describeIO(): string;
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

/**
 * Reusable GPU buffers for the model's input and output.
 *
 * By default each frame uploads its input and downloads its result through
 * brand-new GPU buffers that are destroyed straight after: about 3 MB of
 * create-and-destroy per frame, ~185 MB/s at 56 fps. On an iPhone the page
 * was being closed after roughly 800-900 frames of that. Here one input
 * buffer and one read-back buffer live for the whole run, so a frame
 * allocates nothing on the GPU.
 */
type GpuBufferLike = {
  mapAsync(mode: number): Promise<void>;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
  destroy(): void;
};
type GpuDeviceLike = {
  createBuffer(d: { size: number; usage: number }): GpuBufferLike;
  queue: { writeBuffer(b: GpuBufferLike, offset: number, data: Float32Array): void; submit(c: unknown[]): void };
  createCommandEncoder(): {
    copyBufferToBuffer(a: GpuBufferLike, ao: number, b: GpuBufferLike, bo: number, size: number): void;
    finish(): unknown;
  };
};

// Values from the WebGPU spec (GPUBufferUsage / GPUMapMode).
const USAGE_MAP_READ = 0x1;
const USAGE_COPY_SRC = 0x4;
const USAGE_COPY_DST = 0x8;
const USAGE_STORAGE = 0x80;
const MAP_MODE_READ = 0x1;

type GpuIO = {
  run(session: Ort.InferenceSession, inputName: string, outputName: string, pixels: Float32Array): Promise<Float32Array>;
  dispose(): void;
};

async function createGpuIO(ort: typeof Ort, size: number, numClasses: number): Promise<GpuIO> {
  const device = (await ort.env.webgpu.device) as unknown as GpuDeviceLike;
  const anchors = [8, 16, 32].reduce((n, stride) => n + (size / stride) ** 2, 0);
  const outFloats = anchors * (5 + numClasses);

  const inputBuffer = device.createBuffer({
    size: 3 * size * size * 4,
    usage: USAGE_STORAGE | USAGE_COPY_DST | USAGE_COPY_SRC,
  });
  const readBack = device.createBuffer({ size: outFloats * 4, usage: USAGE_MAP_READ | USAGE_COPY_DST });
  const inputTensor = ort.Tensor.fromGpuBuffer(inputBuffer as never, {
    dataType: "float32",
    dims: [1, 3, size, size],
  });
  const host = new Float32Array(outFloats);

  return {
    async run(session, inputName, outputName, pixels) {
      device.queue.writeBuffer(inputBuffer, 0, pixels);
      const out = await session.run({ [inputName]: inputTensor });
      const result = out[outputName];
      try {
        const count = result.dims.reduce((a, d) => a * d, 1);
        if (count !== outFloats) throw new Error(`unexpected output size ${count}`);
        const encoder = device.createCommandEncoder();
        encoder.copyBufferToBuffer(result.gpuBuffer as never, 0, readBack, 0, outFloats * 4);
        device.queue.submit([encoder.finish()]);
        await readBack.mapAsync(MAP_MODE_READ);
        host.set(new Float32Array(readBack.getMappedRange()));
        readBack.unmap();
      } finally {
        result.dispose();
      }
      return host;
    },
    dispose() {
      inputBuffer.destroy();
      readBack.destroy();
    },
  };
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
    // Results stay on the GPU so they can be read through gpuIO's single
    // reusable buffer instead of a fresh download every frame.
    ...(backend === "webgpu" ? { preferredOutputLocation: "gpu-buffer" as const } : {}),
  });
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];

  let gpuIO: GpuIO | null = null;
  let io = backend === "webgpu" ? "standard buffers" : "CPU";
  if (backend === "webgpu") {
    try {
      gpuIO = await createGpuIO(ort, INPUT_SIZE, NUM_CLASSES);
      io = "reused GPU buffers";
    } catch (e) {
      io = `standard buffers (reuse unavailable: ${e instanceof Error ? e.message : String(e)})`;
    }
  }

  // Input pixels are reused between frames on the GPU path (a fresh ~2 MB
  // array per frame is 60 MB/s of garbage). The CPU path can't: it runs in
  // a worker, and sending a buffer hands ownership over, leaving the
  // page's copy unusable.
  const reuseInput = backend === "webgpu";
  let scratch: Float32Array | null = null;
  let scratchTensor: Ort.Tensor | null = null;
  let scratchFor = "";

  return {
    backend,
    inputSize: INPUT_SIZE,
    describeIO: () => io,

    async detect(frame) {
      const t0 = performance.now();
      let input: Ort.Tensor | null = null;
      let letterbox;
      let pixels: Float32Array | null = null;
      if (reuseInput) {
        const key = `${frame.width}x${frame.height}`;
        if (!scratch || !scratchTensor || scratchFor !== key) {
          scratch = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE).fill(PAD_VALUE);
          scratchTensor = new ort.Tensor("float32", scratch, [1, 3, INPUT_SIZE, INPUT_SIZE]);
          scratchFor = key;
        }
        letterbox = preprocess(frame, INPUT_SIZE, scratch).letterbox;
        input = scratchTensor;
        pixels = scratch;
      } else {
        const prepared = preprocess(frame, INPUT_SIZE);
        letterbox = prepared.letterbox;
        input = new ort.Tensor("float32", prepared.tensor, [1, 3, INPUT_SIZE, INPUT_SIZE]);
      }
      const t1 = performance.now();

      const runStandard = async () => {
        const out = await session.run({ [inputName]: input as Ort.Tensor });
        const result = out[outputName];
        if (backend !== "webgpu") return result.data as Float32Array;
        const data = (await result.getData()) as Float32Array;
        result.dispose();
        return data;
      };

      let raw: Float32Array;
      if (gpuIO && pixels) {
        try {
          raw = await gpuIO.run(session, inputName, outputName, pixels);
        } catch (e) {
          // Never lose the run over an optimisation: drop to the standard
          // path and say so in the report.
          io = `standard buffers (reuse failed: ${e instanceof Error ? e.message : String(e)})`;
          gpuIO.dispose();
          gpuIO = null;
          raw = await runStandard();
        }
      } else {
        raw = await runStandard();
      }
      const t2 = performance.now();

      const detections = decode(raw, NUM_CLASSES, INPUT_SIZE, letterbox, frame, {
        scoreThreshold: 0.25,
        classes: [COCO_SPORTS_BALL, COCO_PERSON],
      });
      const t3 = performance.now();

      return { detections, timings: { prepMs: t1 - t0, inferMs: t2 - t1, postMs: t3 - t2 } };
    },

    async dispose() {
      gpuIO?.dispose();
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

/**
 * Resolves when the video has a new picture to read, or after maxWaitMs
 * whichever comes first.
 *
 * Reading the same camera frame twice is wasted work, and a loop that never
 * waits for anything real can starve the page's own rendering. requestVideoFrameCallback
 * fires once per new frame, in step with painting. The timeout is the
 * safety net: a paused, hidden or stalled video never calls back, and the
 * loop must still be able to notice Stop.
 */
export function nextVideoFrame(video: HTMLVideoElement, maxWaitMs = 250): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, maxWaitMs);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    if ("requestVideoFrameCallback" in video) video.requestVideoFrameCallback(done);
    else requestAnimationFrame(done);
  });
}

export { COCO_PERSON, COCO_SPORTS_BALL };
