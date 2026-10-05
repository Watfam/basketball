import type * as Ort from "onnxruntime-web";
import { COCO_PERSON, COCO_SPORTS_BALL, PAD_VALUE, decode, preprocess, type Detection, type Pixels } from "@/lib/vision/yolox";

/**
 * The detector engine: a YOLOX model run with ONNX Runtime Web.
 *
 * This file does the actual work and can run on the page or inside a
 * worker. Normal code should go through detector.ts, which runs it in a
 * worker and keeps it fresh (see there for why).
 *
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

/** How much the runtime rewrites the model before running it. */
export type Optimization = "disabled" | "basic" | "extended" | "all";

export type Timings = { prepMs: number; inferMs: number; postMs: number };

/**
 * Which model to run.
 *
 * coco: the stock YOLOX-nano, 80 everyday classes, used for the speed
 * tests before a ball model existed. ball: our own model (round 5 of the
 * training in training/README.md), one class, trained on 416 px windows cut
 * from native 1080p video of the driveway hoop.
 */
export type ModelId = "coco" | "ball";

export type ModelSpec = {
  url: string;
  numClasses: number;
  /** Class ids worth reporting; everything else is dropped in decode. */
  classes: number[];
  /** The class id that means "basketball" for this model. */
  ballClass: number;
  /** Detections below this score are dropped. */
  scoreThreshold: number;
};

export const MODELS: Record<ModelId, ModelSpec> = {
  coco: {
    url: "/models/yolox_nano.onnx",
    numClasses: 80,
    classes: [COCO_SPORTS_BALL, COCO_PERSON],
    ballClass: COCO_SPORTS_BALL,
    scoreThreshold: 0.25,
  },
  ball: {
    url: "/models/ball-5.onnx",
    numClasses: 1,
    classes: [0],
    ballClass: 0,
    // The offline make/miss scores were all measured on detections dumped
    // at 0.2 (training/tools/22-dump-detections.mjs), so the app matches.
    scoreThreshold: 0.2,
  },
};

export type Detector = {
  backend: Backend;
  model: ModelId;
  /** Class id of a basketball in this detector's detections. */
  ballClass: number;
  inputSize: number;
  /** Which buffer strategy is in use, for the report. */
  describeIO(): string;
  detect(frame: Pixels): Promise<{ detections: Detection[]; timings: Timings }>;
  dispose(): Promise<void>;
};

const INPUT_SIZE = 416;

let ortPromise: Promise<typeof Ort> | null = null;

/**
 * How many CPU threads the model may use.
 *
 * More than one needs the page to be cross-origin isolated (see the headers
 * in next.config.ts), because threads share memory through a
 * SharedArrayBuffer and browsers only allow that on isolated pages. On a
 * page that is not isolated, one thread is all that works, so a request for
 * more quietly becomes one and the report says so.
 */
export function resolveThreads(requested?: number): { threads: number; isolated: boolean } {
  const isolated = typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;
  if (!isolated) return { threads: 1, isolated };
  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 2 : 2;
  // Left out means one thread, the setting every earlier phone test used.
  // 0 means pick for me: leave a core free for the page and camera.
  const auto = Math.min(4, Math.max(1, cores - 1));
  const wanted = requested === undefined ? 1 : requested > 0 ? requested : auto;
  return { threads: Math.max(1, Math.min(wanted, cores)), isolated };
}

async function loadOrt(backend: Backend, inWorker: boolean, threads: number): Promise<typeof Ort> {
  // One runtime per page: switching backends means a reload, which is
  // rare enough (a lab toggle) that supporting both at once isn't worth it.
  if (!ortPromise) {
    const entry = backend === "webgpu" ? "/ort/ort.webgpu.min.mjs" : "/ort/ort.wasm.min.mjs";
    ortPromise = import(/* webpackIgnore: true */ /* turbopackIgnore: true */ entry) as Promise<typeof Ort>;
  }
  const ort = await ortPromise;
  ort.env.wasm.wasmPaths = "/ort/";
  ort.env.wasm.numThreads = threads;
  // The CPU backend runs on the page's own thread unless told otherwise,
  // which janks every animation and tap while a frame is processing. A
  // worker keeps the page responsive. WebGPU can't use one (it has to run
  // where the GPU is), but it doesn't need to: its work is genuinely
  // asynchronous.
  // Already in our own worker there is nothing to gain from a second one.
  ort.env.wasm.proxy = backend === "wasm" && !inWorker;
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

export type EngineOptions = {
  onStep?: (step: string) => void;
  /** Already running in our own worker, so no second one is needed. */
  inWorker?: boolean;
  onEvent?: (text: string) => void;
  optimization?: Optimization;
  /** CPU threads. Left out: 1. Zero: choose automatically. */
  threads?: number;
  /** Left out: the stock COCO model, as every earlier lab run used. */
  model?: ModelId;
};

export async function createEngine(backend: Backend, options: EngineOptions = {}): Promise<Detector> {
  const { onStep = () => {}, inWorker = false, onEvent = () => {}, optimization = "all", model = "coco" } = options;
  const spec = MODELS[model];
  const { threads, isolated } = resolveThreads(options.threads);
  onStep("Loading the runtime");
  const ort = await loadOrt(backend, inWorker, backend === "wasm" ? threads : 1);

  onStep("Loading the model and preparing the GPU or CPU");
  // Fetched first so a missing file says so plainly, instead of the
  // runtime's protobuf parse error on a 404 page.
  const response = await fetch(spec.url);
  if (!response.ok) {
    throw new Error(
      `The ${model} model (${spec.url}) could not be loaded: ${response.status}${
        response.status === 404 ? ". The file is not in public/models yet." : ""
      }`
    );
  }
  const modelBytes = new Uint8Array(await response.arrayBuffer());
  const session = await ort.InferenceSession.create(modelBytes, {
    executionProviders: [backend],
    graphOptimizationLevel: optimization,
    // Results stay on the GPU so they can be read through gpuIO's single
    // reusable buffer instead of a fresh download every frame.
    ...(backend === "webgpu" ? { preferredOutputLocation: "gpu-buffer" as const } : {}),
  });
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];

  if (backend === "webgpu") {
    // If the phone takes the GPU away, say so: a run that vanishes with no
    // explanation is impossible to fix.
    try {
      const device = (await ort.env.webgpu.device) as unknown as {
        lost: Promise<{ reason: string; message: string }>;
        addEventListener(type: string, cb: (e: { error?: { message?: string } }) => void): void;
      };
      void device.lost.then((info) => onEvent(`GPU device lost (${info.reason}): ${info.message}`));
      device.addEventListener("uncapturederror", (e) => onEvent(`GPU error: ${e.error?.message ?? "unknown"}`));
    } catch {
      // Not observable here; nothing to report.
    }
  }

  let gpuIO: GpuIO | null = null;
  let io =
    backend === "webgpu"
      ? "standard buffers"
      : `CPU, ${threads} ${threads === 1 ? "thread" : "threads"}${
          isolated ? "" : " (page not cross-origin isolated, so one)"
        }`;
  if (backend === "webgpu") {
    try {
      gpuIO = await createGpuIO(ort, INPUT_SIZE, spec.numClasses);
      io = "reused GPU buffers";
    } catch (e) {
      io = `standard buffers (reuse unavailable: ${e instanceof Error ? e.message : String(e)})`;
    }
  }

  // Input pixels are reused between frames (a fresh ~2 MB array per frame
  // is 60 MB/s of garbage). The one exception is the CPU backend on the
  // page itself: it runs in ORT's own worker, and sending that a buffer
  // hands ownership over, leaving ours unusable.
  const reuseInput = backend === "webgpu" || inWorker;
  let scratch: Float32Array | null = null;
  let scratchTensor: Ort.Tensor | null = null;
  let scratchFor = "";

  return {
    backend,
    model,
    ballClass: spec.ballClass,
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

      const detections = decode(raw, spec.numClasses, INPUT_SIZE, letterbox, frame, {
        scoreThreshold: spec.scoreThreshold,
        classes: spec.classes,
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

export { COCO_PERSON, COCO_SPORTS_BALL };
