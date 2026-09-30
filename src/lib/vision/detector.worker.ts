import { createEngine, type Backend, type Detector, type Optimization } from "@/lib/vision/engine";

/**
 * The detector's own thread. Receives camera frames, replies with what was
 * found. Its reason for existing is in detector.ts.
 */

type Scope = {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};
const scope = self as unknown as Scope;

let engine: Detector | null = null;

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

scope.onmessage = async (e: MessageEvent) => {
  const msg = e.data as
    | { type: "init"; backend: Backend; optimization?: Optimization }
    | { type: "frame"; id: number; width: number; height: number; buffer: ArrayBuffer };

  if (msg.type === "init") {
    try {
      engine = await createEngine(
        msg.backend,
        (step) => scope.postMessage({ type: "step", step }),
        true,
        (text) => scope.postMessage({ type: "event", text }),
        msg.optimization
      );
      scope.postMessage({ type: "ready", io: engine.describeIO() });
    } catch (err) {
      scope.postMessage({ type: "error", message: messageOf(err) });
    }
    return;
  }

  const { id, width, height, buffer } = msg;
  try {
    if (!engine) throw new Error("The detector is not ready.");
    const { detections, timings } = await engine.detect({
      width,
      height,
      data: new Uint8ClampedArray(buffer),
    });
    scope.postMessage({ type: "result", id, detections, timings, io: engine.describeIO(), buffer }, [buffer]);
  } catch (err) {
    scope.postMessage({ type: "error", id, message: messageOf(err), buffer }, [buffer]);
  }
};
