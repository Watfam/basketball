import { createEngine, COCO_PERSON, COCO_SPORTS_BALL, MODELS } from "@/lib/vision/engine";
import type { Backend, Detector, ModelId, Optimization, Timings } from "@/lib/vision/engine";
import type { Detection, Pixels } from "@/lib/vision/yolox";

/**
 * The detector as the rest of the app uses it.
 *
 * The model runs in a background worker, never on the page, for two
 * reasons. The page stays responsive however long a frame takes. And a
 * worker can be thrown away: on an iPhone, one GPU context doing
 * hundreds of model runs piles up internal objects (about 160 bind groups
 * per run) until Safari closes the page, at roughly 900 runs. Nothing on
 * our side was leaking (buffer counts stay flat), so the dependable fix is
 * never to let one context get that far. A replacement worker is started
 * and warmed in the background a little before it is needed, then swapped
 * in between two frames and the old one terminated, which frees
 * everything it held. The swap costs no visible pause.
 */

export type { Backend, Detector, ModelId, Optimization, Timings };
export { COCO_PERSON, COCO_SPORTS_BALL, MODELS };

type Result = { detections: Detection[]; timings: Timings; io: string; buffer: ArrayBuffer };

type Handle = {
  io: string;
  detect(width: number, height: number, buffer: ArrayBuffer): Promise<Result>;
  terminate(): void;
};

/** Start a worker and wait until its model is loaded and ready. */
function spawn(
  backend: Backend,
  onStep: (step: string) => void,
  onEvent: (text: string) => void,
  optimization?: Optimization,
  threads?: number,
  model?: ModelId
): Promise<Handle> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./detector.worker.ts", import.meta.url), { type: "module" });
    const pending = new Map<number, { resolve: (r: Result) => void; reject: (e: Error) => void }>();
    let nextId = 1;
    let settled = false;
    let answered = false;

    const failAll = (error: Error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
      pending.forEach((p) => p.reject(error));
      pending.clear();
    };

    const handle: Handle = {
      io: "",
      detect(width, height, buffer) {
        return new Promise<Result>((res, rej) => {
          const id = nextId;
          nextId += 1;
          // A worker the phone has killed never answers; without a limit
          // the run would sit frozen forever instead of failing.
          // The very first frame compiles the GPU programs, which can take
          // far longer than any later one.
          const limit = answered ? 8000 : 90000;
          const timer = setTimeout(() => {
            pending.delete(id);
            rej(new Error(`The detector stopped responding for ${limit / 1000} seconds.`));
          }, limit);
          pending.set(id, {
            resolve: (r) => {
              clearTimeout(timer);
              res(r);
            },
            reject: (e) => {
              clearTimeout(timer);
              rej(e);
            },
          });
          worker.postMessage({ type: "frame", id, width, height, buffer }, [buffer]);
        });
      },
      terminate() {
        worker.terminate();
        failAll(new Error("The detector was stopped."));
      },
    };

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === "step") onStep(msg.step);
      else if (msg.type === "event") onEvent(msg.text);
      else if (msg.type === "ready") {
        handle.io = msg.io;
        settled = true;
        resolve(handle);
      } else if (msg.type === "result") {
        answered = true;
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        p?.resolve(msg);
      } else if (msg.type === "error") {
        const error = new Error(msg.message);
        if (msg.id === undefined) failAll(error);
        else {
          const p = pending.get(msg.id);
          pending.delete(msg.id);
          p?.reject(error);
        }
      }
    };
    worker.onerror = (e) => failAll(new Error(e.message || "The detector thread failed."));
    worker.onmessageerror = () => failAll(new Error("The detector thread sent something unreadable."));

    worker.postMessage({ type: "init", backend, optimization, threads, model });
  });
}

/** Frames of lead time to give a replacement worker to load and warm up. */
const WARMUP_LEAD_FRAMES = 120;

export async function createDetector(
  backend: Backend,
  onStep: (step: string) => void = () => {},
  options: {
    recycleAfter?: number;
    onEvent?: (text: string) => void;
    forcePage?: boolean;
    optimization?: Optimization;
    threads?: number;
    model?: ModelId;
  } = {}
): Promise<Detector> {
  let recycleAfter = options.recycleAfter ?? 0;
  const model = options.model ?? "coco";
  const onEvent = options.onEvent ?? (() => {});

  let active: Handle | null = null;
  let onPage: Detector | null = null;
  try {
    if (options.forcePage) throw new Error("running on the page was requested");
    active = await spawn(backend, onStep, onEvent, options.optimization, options.threads, model);
  } catch (e) {
    // No worker, or no GPU inside one: run on the page instead. If the
    // trouble is real (no WebGPU at all) this fails the same way and the
    // caller sees the real message.
    onStep("Background thread unavailable, running on the page");
    onPage = await createEngine(backend, {
      onStep,
      onEvent,
      optimization: options.optimization,
      threads: options.threads,
      model,
    });
    if (e instanceof Error) onStep(`(${e.message})`);
  }

  let frames = 0;
  let recycles = 0;
  let standby: Promise<Handle | null> | null = null;
  let standbyReady: Handle | null = null;
  let recycleNote = "";
  const pool: ArrayBuffer[] = [];

  const describe = () => {
    if (onPage) return `${onPage.describeIO()} · on the page`;
    let text = `${active?.io ?? ""} · background thread`;
    if (recycleAfter > 0) text += `, fresh GPU every ${recycleAfter} frames (${recycles} so far)`;
    if (recycleNote) text += `, ${recycleNote}`;
    return text;
  };

  /** Swap in the warmed replacement when one is due and ready. */
  const maybeRecycle = () => {
    if (!active || recycleAfter <= 0) return;

    if (!standby && frames >= recycleAfter - Math.min(WARMUP_LEAD_FRAMES, recycleAfter / 2)) {
      standby = spawn(backend, () => {}, onEvent, options.optimization, options.threads, model)
        .then((h) => {
          standbyReady = h;
          return h;
        })
        .catch((e) => {
          // Keep running on the current worker rather than lose the run.
          recycleNote = `replacement failed (${e instanceof Error ? e.message : String(e)}), recycling off`;
          recycleAfter = 0;
          return null;
        });
    }

    if (standbyReady && frames >= recycleAfter) {
      const old = active;
      active = standbyReady;
      standbyReady = null;
      standby = null;
      frames = 0;
      recycles += 1;
      old.terminate();
    }
  };

  return {
    backend,
    model,
    ballClass: MODELS[model].ballClass,
    inputSize: onPage?.inputSize ?? 416,
    describeIO: describe,

    async detect(frame: Pixels) {
      if (onPage) return onPage.detect(frame);

      maybeRecycle();
      const size = frame.data.byteLength;
      const recycled = pool.pop();
      const buffer = recycled && recycled.byteLength === size ? recycled : new ArrayBuffer(size);
      new Uint8ClampedArray(buffer).set(frame.data);

      const current = active as Handle;
      const result = await current.detect(frame.width, frame.height, buffer);
      if (pool.length < 2) pool.push(result.buffer);
      frames += 1;
      return { detections: result.detections, timings: result.timings };
    },

    async dispose() {
      if (onPage) {
        await onPage.dispose();
        return;
      }
      active?.terminate();
      active = null;
      standbyReady?.terminate();
      const pendingStandby = standby as Promise<Handle | null> | null;
      standby = null;
      void pendingStandby?.then((h) => h?.terminate());
    },
  };
}

/**
 * Hands control back to the browser so it can paint, handle a tap, and
 * run its own timers before the next frame. scheduler.yield is used where
 * it exists; a MessageChannel hop is the fallback, because unlike
 * setTimeout it isn't clamped to 4 ms.
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
 * whichever comes first. requestVideoFrameCallback fires once per new
 * frame, in step with painting; the timeout is the safety net so a paused
 * or stalled video can never stop the loop noticing Stop.
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
