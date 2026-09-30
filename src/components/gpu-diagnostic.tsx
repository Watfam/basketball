"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { createDetector, nextVideoFrame } from "@/lib/vision/detector";
import { probeRawGpu } from "@/lib/vision/gpu-probes";
import { readDraft, useLocalDraft, writeDraft } from "@/lib/use-local-draft";
import { describeWake, useWakeLock, useWakeStatus } from "@/lib/use-wake-lock";

/**
 * A fixed sequence of controlled tests, run one after another, that keeps
 * going across the page being killed.
 *
 * Each test does one specific kind of work for 30 seconds. Progress is
 * written to the phone twice a second, so when the browser closes the page
 * the next visit knows which test was running and how far it got. The
 * tests are ordered from nothing-but-the-page up to the full pipeline, so
 * the first one that dies says what the trouble involves.
 */

const KEY = "hl:diag";

type ArmId =
  | "page"
  | "gpu-tiny"
  | "gpu-ortlike"
  | "model-cpu"
  | "model-gpu-worker"
  | "model-gpu-page"
  | "camera"
  | "camera-model"
  | "model-gpu-worker-again";

type Arm = { id: ArmId; label: string; what: string; seconds: number; needsTap?: boolean };

const ARMS: Arm[] = [
  {
    id: "page",
    label: "1. The page alone",
    what: "No GPU, no camera, no model. Only what the lab page itself does: screen kept awake, saving progress, redrawing a few times a second.",
    seconds: 30,
  },
  {
    id: "gpu-tiny",
    label: "2. A trivial GPU job",
    what: "Raw WebGPU, no ONNX. One tiny GPU task per frame at 30 fps.",
    seconds: 30,
  },
  {
    id: "gpu-ortlike",
    label: "3. GPU job shaped like the model",
    what: "Raw WebGPU, no ONNX. The same pattern the model makes: ~160 GPU tasks per frame, each with fresh setup, plus a read-back, about 12 ms of GPU work, 30 fps.",
    seconds: 30,
  },
  {
    id: "model-cpu",
    label: "4. The model on the CPU",
    what: "The real model in a background thread, using the CPU instead of the GPU, 30 fps target.",
    seconds: 30,
  },
  {
    id: "model-gpu-worker",
    label: "5. The model on the GPU",
    what: "The real model, GPU, in a background thread, 30 fps. This is the combination that has been dying.",
    seconds: 30,
  },
  {
    id: "model-gpu-page",
    label: "6. The model on the GPU, on the page",
    what: "Same, but run on the page itself instead of a background thread.",
    seconds: 30,
  },
  {
    id: "camera",
    label: "7. The camera alone",
    what: "Live camera, reading every frame. No model. Point it at anything.",
    seconds: 30,
    needsTap: true,
  },
  {
    id: "camera-model",
    label: "8. Camera and model together",
    what: "The whole pipeline, as it would be used: live camera into the GPU model, 30 fps.",
    seconds: 30,
    needsTap: true,
  },
  {
    id: "model-gpu-worker-again",
    label: "9. Test 5 again",
    what: "Test 5 repeated. If it dies sooner than the first time, the damage is building up across tests.",
    seconds: 30,
  },
];

type Result = {
  id: ArmId;
  status: "survived" | "died" | "error" | "stopped";
  seconds: number;
  frames: number;
  note: string;
};

type Ladder = {
  startedAt: string;
  standalone: boolean;
  build: string;
  results: Result[];
  running: { id: ArmId; beat: number; frames: number } | null;
};

function parseLadder(raw: string | null): Ladder | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Ladder;
  } catch {
    return null;
  }
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}
const noSubscribe = () => () => {};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const fmt = (n: number, dp = 1) => n.toFixed(dp);

/** Everything that finished, plus a test that was running when the page vanished. */
function withDeath(ladder: Ladder | null, live: boolean): Result[] {
  if (!ladder) return [];
  if (ladder.running && !live) {
    return [
      ...ladder.results,
      {
        id: ladder.running.id,
        status: "died",
        seconds: ladder.running.beat,
        frames: ladder.running.frames,
        note: "the browser closed the page",
      },
    ];
  }
  return ladder.results;
}

function reportText(ladder: Ladder, results: Result[]) {
  const lines = [
    `GPU diagnostic ladder — ${new Date(ladder.startedAt).toLocaleString()}`,
    `Version ${ladder.build} · ${ladder.standalone ? "home-screen app" : "Safari tab"}`,
    `Device: ${navigator.userAgent}`,
    "",
  ];
  for (const arm of ARMS) {
    const r = results.find((x) => x.id === arm.id);
    const tail = r?.note ? ` · ${r.note}` : "";
    if (!r) lines.push(`–  ${arm.label}: not run`);
    else if (r.status === "survived") lines.push(`OK ${arm.label}: survived ${fmt(r.seconds)} s, ${r.frames} frames${tail}`);
    else if (r.status === "died") lines.push(`✗  ${arm.label}: DIED at ${fmt(r.seconds)} s after ${r.frames} frames${tail}`);
    else if (r.status === "stopped") lines.push(`–  ${arm.label}: stopped by you at ${fmt(r.seconds)} s`);
    else lines.push(`!  ${arm.label}: error after ${fmt(r.seconds)} s${tail}`);
  }
  return lines.join("\n");
}

function gradientFrame(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas isn't available");
  const g = ctx.createLinearGradient(0, 0, width, height);
  g.addColorStop(0, "#345");
  g.addColorStop(1, "#c84");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#e8761c";
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, 40, 0, Math.PI * 2);
  ctx.fill();
  return ctx.getImageData(0, 0, width, height);
}

export function GpuDiagnostic() {
  const [raw] = useLocalDraft(KEY);
  const ladder = parseLadder(raw);
  const [live, setLive] = useState(false);
  const [, setTick] = useState(0);
  const stopRef = useRef(false);
  const standalone = useSyncExternalStore(noSubscribe, isStandalone, () => null);
  const wake = useWakeStatus();
  useWakeLock(live);
  const [shared, setShared] = useState<"" | "copied" | "failed">("");

  const results = withDeath(ladder, live);
  const done = new Set(results.map((r) => r.id));
  const nextArm = ARMS.find((a) => !done.has(a.id)) ?? null;
  const crashed = !live && ladder?.running != null;

  function update(fn: (l: Ladder) => Ladder) {
    const current = parseLadder(readDraft(KEY));
    if (!current) return;
    writeDraft(KEY, JSON.stringify(fn(current)));
  }

  async function runArm(arm: Arm) {
    const override = Number(new URLSearchParams(window.location.search).get("t"));
    const seconds = override > 0 ? override : arm.seconds;
    const t0 = performance.now();
    // Each test's clock starts when its work starts, not while it is still
    // loading a model or waiting for the camera.
    let origin = t0;
    let frames = 0;
    const isStopped = () => stopRef.current;
    const ctx = { seconds, isStopped, beat: (n: number) => (frames = n) };

    update((l) => ({ ...l, running: { id: arm.id, beat: 0, frames: 0 } }));
    const heartbeat = setInterval(() => {
      update((l) =>
        l.running ? { ...l, running: { ...l.running, beat: (performance.now() - origin) / 1000, frames } } : l
      );
    }, 500);

    let note = "";
    let status: Result["status"] = "survived";
    try {
      const paced = async (work: () => Promise<void>) => {
        while (!isStopped() && (performance.now() - origin) / 1000 < seconds) {
          const start = performance.now();
          await work();
          frames += 1;
          const spare = 1000 / 30 - (performance.now() - start);
          await sleep(spare > 1 ? spare : 0);
        }
      };

      if (arm.id === "page") {
        await paced(async () => {
          if (frames % 4 === 0) setTick((n) => n + 1);
        });
      } else if (arm.id === "gpu-tiny" || arm.id === "gpu-ortlike") {
        const r = await probeRawGpu(arm.id === "gpu-tiny" ? "tiny" : "ortlike", ctx);
        frames = r.frames;
        note = r.note;
      } else if (arm.id === "camera" || arm.id === "camera-model") {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        let detector: Awaited<ReturnType<typeof createDetector>> | null = null;
        try {
          if (arm.id === "camera-model") detector = await createDetector("webgpu");
          await video.play();
          const work = document.createElement("canvas");
          work.width = 640;
          work.height = Math.round((640 * video.videoHeight) / Math.max(1, video.videoWidth));
          const wctx = work.getContext("2d", { willReadFrequently: true });
          if (!wctx) throw new Error("Canvas isn't available");
          origin = performance.now();
          while (!isStopped() && (performance.now() - origin) / 1000 < seconds) {
            const frameStart = performance.now();
            wctx.drawImage(video, 0, 0, work.width, work.height);
            const img = wctx.getImageData(0, 0, work.width, work.height);
            if (detector) await detector.detect(img);
            frames += 1;
            do {
              await nextVideoFrame(video);
            } while (performance.now() < frameStart + 1000 / 30 - 6 && !isStopped());
          }
          note = `${video.videoWidth}×${video.videoHeight}`;
        } finally {
          stream.getTracks().forEach((t) => t.stop());
          await detector?.dispose();
        }
      } else {
        const backend = arm.id === "model-cpu" ? "wasm" : "webgpu";
        const detector = await createDetector(backend, () => {}, {
          forcePage: arm.id === "model-gpu-page",
          onEvent: (text) => {
            note += `${note ? "; " : ""}${text}`;
          },
        });
        try {
          const frame = gradientFrame(640, 360);
          const loaded = (performance.now() - t0) / 1000;
          origin = performance.now();
          await paced(async () => {
            await detector.detect(frame);
          });
          note += `${note ? "; " : ""}${detector.describeIO()}; loaded in ${fmt(loaded)} s; ${fmt(
            frames / Math.max(0.001, (performance.now() - origin) / 1000)
          )} fps`;
        } finally {
          await detector.dispose();
        }
      }
      if (isStopped()) status = "stopped";
    } catch (e) {
      status = "error";
      note = e instanceof Error ? e.message : String(e);
    } finally {
      clearInterval(heartbeat);
    }

    const result: Result = { id: arm.id, status, seconds: (performance.now() - origin) / 1000, frames, note };
    update((l) => ({ ...l, running: null, results: [...l.results, result] }));
    return result;
  }

  async function go(startFresh: boolean) {
    stopRef.current = false;
    if (startFresh) {
      writeDraft(
        KEY,
        JSON.stringify({
          startedAt: new Date().toISOString(),
          standalone: isStandalone(),
          build: process.env.NEXT_PUBLIC_BUILD ?? "local",
          results: [],
          running: null,
        } satisfies Ladder)
      );
    } else {
      // Commit the test that was cut off, then carry on from the next one.
      update((l) => ({ ...l, results: withDeath(l, false), running: null }));
    }

    setLive(true);
    try {
      let first = true;
      for (;;) {
        const current = parseLadder(readDraft(KEY));
        const finished = new Set((current?.results ?? []).map((r) => r.id));
        const arm = ARMS.find((a) => !finished.has(a.id));
        if (!arm) break;
        // Camera tests need their own tap; everything else chains on.
        if (arm.needsTap && !first) break;
        first = false;
        const r = await runArm(arm);
        if (r.status !== "survived") break;
      }
    } finally {
      setLive(false);
    }
  }

  async function copyOrShare(share: boolean) {
    if (!ladder) return;
    const text = reportText(ladder, results);
    try {
      if (share && typeof navigator.share === "function") await navigator.share({ title: "GPU diagnostic", text });
      else {
        await navigator.clipboard.writeText(text);
        setShared("copied");
      }
    } catch {
      if (!share) setShared("failed");
    }
    setTimeout(() => setShared(""), 2500);
  }

  const total = ARMS.length;
  const finishedAll = ladder && done.size >= total && !live;
  const runningNow = live ? ladder?.running?.id : null;

  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-2xl border border-line bg-surface p-4 text-xs leading-relaxed text-foreground-dim">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">Before you start</p>
        <ol className="list-decimal space-y-1 pl-4">
          <li>
            <strong className="text-foreground">Restart the iPhone</strong> (power off, power on). Earlier
            tests may have left the GPU in a worse state, and this removes that doubt.
          </li>
          <li>Open this page and tap Start. Put the phone down and do not touch it.</li>
          <li>
            If the screen goes black and the page reloads, that is a result, not a failure. Tap
            Continue and it picks up at the next test.
          </li>
        </ol>
        <p className="text-foreground-mute">
          {standalone === null ? "" : standalone ? "Running as a home-screen app." : "Running in a Safari tab."} Version{" "}
          {process.env.NEXT_PUBLIC_BUILD} · {live ? describeWake(wake) : "screen kept awake while testing"}
        </p>
      </section>

      <section className="space-y-2 rounded-2xl border border-line bg-surface p-4">
        {ARMS.map((arm) => {
          const r = results.find((x) => x.id === arm.id);
          const isRunning = runningNow === arm.id;
          const badge = isRunning
            ? "Running…"
            : !r
              ? "Waiting"
              : r.status === "survived"
                ? `Survived ${fmt(r.seconds, 0)} s`
                : r.status === "died"
                  ? `DIED at ${fmt(r.seconds)} s`
                  : r.status === "stopped"
                    ? "Stopped"
                    : "Error";
          const tone = isRunning
            ? "text-accent"
            : r?.status === "survived"
              ? "text-[var(--data-positive)]"
              : r
                ? "text-red-400"
                : "text-foreground-mute";
          return (
            <div key={arm.id} className="rounded-lg border border-line p-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">{arm.label}</p>
                <p className={`shrink-0 text-[11px] font-extrabold uppercase tabular-nums ${tone}`}>
                  {isRunning && ladder?.running ? `${fmt(ladder.running.beat, 0)} s` : badge}
                </p>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-foreground-mute">{arm.what}</p>
              {r && (r.status === "error" || r.note) && (
                <p className="mt-1 text-[11px] leading-snug text-foreground-dim">
                  {r.frames} frames{r.note ? ` · ${r.note}` : ""}
                </p>
              )}
            </div>
          );
        })}
      </section>

      {crashed && (
        <p className="rounded-lg bg-[var(--raised)] p-3 text-xs leading-relaxed text-red-400">
          {ARMS.find((a) => a.id === ladder?.running?.id)?.label} was cut off by the browser at about{" "}
          {fmt(ladder?.running?.beat ?? 0)} s.
        </p>
      )}

      <div className="space-y-2">
        {!live && !ladder && (
          <button
            type="button"
            onClick={() => void go(true)}
            className="w-full rounded-xl bg-accent py-3.5 text-sm font-extrabold uppercase tracking-[0.12em] text-white"
          >
            Start the tests
          </button>
        )}
        {!live && ladder && nextArm && (
          <button
            type="button"
            onClick={() => void go(false)}
            className="w-full rounded-xl bg-accent py-3.5 text-sm font-extrabold uppercase tracking-[0.12em] text-white"
          >
            {nextArm.needsTap ? `Run test ${ARMS.indexOf(nextArm) + 1} (uses the camera)` : crashed ? "Continue" : "Continue the tests"}
          </button>
        )}
        {live && (
          <button
            type="button"
            onClick={() => {
              stopRef.current = true;
            }}
            className="w-full rounded-xl border border-accent py-3.5 text-sm font-extrabold uppercase tracking-[0.12em] text-accent"
          >
            Stop
          </button>
        )}
        {!live && ladder && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void copyOrShare(true)}
              className="flex-1 rounded-xl bg-accent py-3 text-[11px] font-extrabold uppercase tracking-wide text-white"
            >
              Share or save
            </button>
            <button
              type="button"
              onClick={() => void copyOrShare(false)}
              className="flex-1 rounded-xl border border-accent py-3 text-[11px] font-extrabold uppercase tracking-wide text-accent"
            >
              {shared === "copied" ? "Copied" : shared === "failed" ? "Copy blocked" : "Copy results"}
            </button>
          </div>
        )}
        {!live && ladder && (
          <button
            type="button"
            onClick={() => writeDraft(KEY, null)}
            className="text-[11px] font-bold uppercase tracking-wide text-foreground-mute"
          >
            {finishedAll ? "Clear and start over" : "Discard these results and start over"}
          </button>
        )}
      </div>

      {ladder && !live && (
        <details>
          <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wide text-foreground-mute">
            Show as text
          </summary>
          <textarea
            readOnly
            rows={14}
            value={reportText(ladder, results)}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-2 w-full rounded-lg border border-line bg-[var(--raised)] p-2 font-mono text-[10px] leading-snug text-foreground-dim"
          />
        </details>
      )}
    </div>
  );
}
