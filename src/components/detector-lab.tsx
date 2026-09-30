"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COCO_SPORTS_BALL, createDetector, yieldToMain, type Backend, type Detector } from "@/lib/vision/detector";
import { haptic } from "@/lib/haptics";
import { useWakeLock } from "@/lib/use-wake-lock";
import { readDraft, useLocalDraft, writeDraft } from "@/lib/use-local-draft";

/**
 * A lab for one question: can this phone run the detector on live video
 * fast enough, for long enough, without slowing down as it heats up?
 *
 * The sustained run is the point. A phone can post a great number for
 * five seconds and then throttle; splitting the run into 15-second
 * segments shows that directly, as a falling frame rate.
 *
 * Runs entirely on the device. Nothing is recorded or uploaded.
 */

/** Quick is a smoke test; full is long enough for a phone to warm up. */
const DURATIONS = [
  { label: "Quick · 20s", seconds: 20, segment: 5 },
  { label: "Full · 2 min", seconds: 120, segment: 15 },
] as const;
const WORK_WIDTH = 640;

type Source = "camera" | "file";
type Phase = "idle" | "loading" | "running" | "done" | "error";

type Segment = { label: string; fps: number; totalMs: number; inferMs: number; ballPct: number };

type Report = {
  at: string;
  /** Saved while the run was still going; the run never finished. */
  partial?: boolean;
  backend: Backend;
  source: Source;
  video: string;
  segments: Segment[];
  frames: number;
  avgFps: number;
  p95Ms: number;
  ballPct: number;
  loadMs: number;
};

const fmt = (n: number, dp = 1) => n.toFixed(dp);

const RUNS_KEY = "hl:lab-runs";
const MAX_SAVED_RUNS = 12;

function parseRuns(raw: string | null): Report[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Report[]) : [];
  } catch {
    return [];
  }
}

function upsertRun(report: Report) {
  const others = parseRuns(readDraft(RUNS_KEY)).filter((r) => r.at !== report.at);
  writeDraft(RUNS_KEY, JSON.stringify([report, ...others].slice(0, MAX_SAVED_RUNS)));
}

function reportText(report: Report) {
  return [
    `Detector lab — ${report.backend} — ${report.source} — ${new Date(report.at).toLocaleString()}${
      report.partial ? " — CUT OFF before finishing" : ""
    }`,
    `Device: ${navigator.userAgent}`,
    `Video: ${report.video}   Model load: ${fmt(report.loadMs, 0)} ms`,
    `Frames: ${report.frames}   Average: ${fmt(report.avgFps)} fps   Slowest 5%: ${fmt(report.p95Ms, 0)} ms`,
    `Frames with a ball: ${fmt(report.ballPct, 0)}%`,
    "",
    "Segment      fps    ms/frame  infer ms  ball%",
    ...report.segments.map(
      (s) =>
        `${s.label.padEnd(11)} ${fmt(s.fps).padStart(5)}  ${fmt(s.totalMs).padStart(8)}  ${fmt(s.inferMs).padStart(8)}  ${fmt(s.ballPct, 0).padStart(5)}`
    ),
  ].join("\n");
}

/**
 * A breadcrumb of where the last run got to, kept on the device.
 *
 * iOS closes a page that uses too much memory or crashes the GPU, and
 * reloads it with nothing to say what happened. A normal finish or error
 * clears the breadcrumb; one that is still there on the next visit means
 * the run was cut off, and says where.
 */
const TRAIL_KEY = "hl:lab-trail";
const markStep = (backend: Backend, source: Source, step: string) =>
  writeDraft(TRAIL_KEY, JSON.stringify({ at: new Date().toISOString(), backend, source, step }));

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

export function DetectorLab() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileUrlRef = useRef<string | null>(null);

  const [durationIdx, setDurationIdx] = useState(1);
  const [backend, setBackend] = useState<Backend>("webgpu");
  const [source, setSource] = useState<Source>("camera");
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [live, setLive] = useState<{ fps: number; ms: number; ball: boolean; elapsed: number } | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [copied, setCopied] = useState<"copied" | "failed" | null>(null);
  const [shared, setShared] = useState(false);
  const reportRef = useRef<HTMLElement>(null);
  const [runsRaw] = useLocalDraft(RUNS_KEY);
  const savedRuns = useMemo(() => parseRuns(runsRaw), [runsRaw]);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  // Bring a finished (or reopened) result into view: on a phone it would
  // otherwise land below the fold, which reads as "nothing happened".
  useEffect(() => {
    if (report) reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [report]);

  useWakeLock(phase === "running");

  const teardown = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
    fileUrlRef.current = null;
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.srcObject = null;
      v.removeAttribute("src");
    }
  }, []);

  const [trailRaw] = useLocalDraft(TRAIL_KEY);
  const trail = (() => {
    if (!trailRaw) return null;
    try {
      return JSON.parse(trailRaw) as { at: string; backend: Backend; source: Source; step: string };
    } catch {
      return null;
    }
  })();

  useEffect(
    () => () => {
      teardown();
      writeDraft(TRAIL_KEY, null);
    },
    [teardown]
  );

  async function run(file?: File) {
    teardown();
    setReport(null);
    setMessage(null);
    setLive(null);
    setPhase("loading");
    markStep(backend, source, "Starting");

    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay) return;
    const runSeconds = DURATIONS[durationIdx].seconds;
    const segmentSeconds = DURATIONS[durationIdx].segment;

    let detector: Detector | null = null;
    try {
      const loadStart = performance.now();
      detector = await createDetector(backend, (step) => markStep(backend, source, step));
      const loadMs = performance.now() - loadStart;

      if (source === "camera") {
        markStep(backend, source, "Opening the camera");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 60 },
          },
          audio: false,
        });
        streamRef.current = stream;
        video.srcObject = stream;
      } else if (file) {
        const url = URL.createObjectURL(file);
        fileUrlRef.current = url;
        video.src = url;
        video.loop = true;
      }
      video.muted = true;
      video.playsInline = true;
      markStep(backend, source, "Starting the video");
      await video.play();
      if (video.videoWidth === 0) throw new Error("The video has no picture to read.");

      const work = document.createElement("canvas");
      work.width = WORK_WIDTH;
      work.height = Math.round((WORK_WIDTH * video.videoHeight) / video.videoWidth);
      const wctx = work.getContext("2d", { willReadFrequently: true });
      const octx = overlay.getContext("2d");
      if (!wctx || !octx) throw new Error("Canvas isn't available in this browser.");
      overlay.width = work.width;
      overlay.height = work.height;

      const runAt = new Date().toISOString();
      const videoLabel = `${video.videoWidth}×${video.videoHeight} → ${work.width}×${work.height}`;
      const startedAt = performance.now();
      const frameMs: number[] = [];
      const inferMs: number[] = [];
      const ballFrames: boolean[] = [];
      const segments: Segment[] = [];
      let segStart = startedAt;
      let segFrames = 0;
      let segTotal = 0;
      let segInfer = 0;
      let segBall = 0;
      let lastPaint = 0;
      let stopped = false;

      const closeSegment = (now: number) => {
        if (segFrames === 0) return;
        const secs = (now - segStart) / 1000;
        const from = segments.length * segmentSeconds;
        segments.push({
          label: `${from}–${from + segmentSeconds}s`,
          fps: segFrames / secs,
          totalMs: segTotal / segFrames,
          inferMs: segInfer / segFrames,
          ballPct: (segBall / segFrames) * 100,
        });
        segStart = now;
        segFrames = segTotal = segInfer = segBall = 0;
      };

      const buildReport = (now: number, partial: boolean): Report => ({
        at: runAt,
        partial,
        backend,
        source,
        video: videoLabel,
        segments: [...segments],
        frames: frameMs.length,
        avgFps: frameMs.length / Math.max(0.001, (now - startedAt) / 1000),
        p95Ms: percentile(frameMs, 0.95),
        ballPct: (ballFrames.filter(Boolean).length / Math.max(1, ballFrames.length)) * 100,
        loadMs,
      });

      stopRef.current = () => {
        stopped = true;
      };

      setPhase("running");
      markStep(backend, source, "Running, first frame");
      let lastMark = 0;

      while (!stopped) {
        const frameStart = performance.now();
        const elapsed = (frameStart - startedAt) / 1000;
        if (elapsed >= runSeconds) break;

        wctx.drawImage(video, 0, 0, work.width, work.height);
        const img = wctx.getImageData(0, 0, work.width, work.height);
        const { detections, timings } = await detector.detect(img);

        const total = performance.now() - frameStart;
        const hasBall = detections.some((d) => d.classId === COCO_SPORTS_BALL);
        frameMs.push(total);
        inferMs.push(timings.inferMs);
        ballFrames.push(hasBall);
        segFrames += 1;
        segTotal += total;
        segInfer += timings.inferMs;
        if (hasBall) segBall += 1;

        const now = performance.now();
        if (now - lastMark > 1000) {
          lastMark = now;
          markStep(backend, source, `Running, ${Math.floor(elapsed)}s in, ${frameMs.length} frames done`);
          // Saved as it goes, so a page the phone closes mid-run still
          // leaves everything measured up to that moment.
          upsertRun(buildReport(now, true));
        }
        if ((now - segStart) / 1000 >= segmentSeconds) closeSegment(now);

        // Paint and update the readout a few times a second, not every
        // frame: drawing shouldn't compete with the thing being measured.
        if (now - lastPaint > 150) {
          lastPaint = now;
          octx.clearRect(0, 0, overlay.width, overlay.height);
          octx.lineWidth = 3;
          for (const d of detections) {
            octx.strokeStyle = d.classId === COCO_SPORTS_BALL ? "#ff6a1a" : "#22d3ee";
            octx.strokeRect(d.x1, d.y1, d.x2 - d.x1, d.y2 - d.y1);
          }
          const recent = frameMs.slice(-20);
          const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
          setLive({ fps: 1000 / avg, ms: avg, ball: hasBall, elapsed });
        }

        // Let the page paint and take taps between frames.
        await yieldToMain();
      }

      const endedAt = performance.now();
      closeSegment(endedAt);

      const finished = buildReport(endedAt, false);
      upsertRun(finished);
      setReport(finished);
      octx.clearRect(0, 0, overlay.width, overlay.height);
      setLive(null);
      setPhase("done");
      haptic("success");
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      setMessage(
        backend === "webgpu"
          ? `${text} — WebGPU may not be available here. Try the CPU option.`
          : text
      );
      setPhase("error");
    } finally {
      writeDraft(TRAIL_KEY, null);
      teardown();
      await detector?.dispose().catch(() => {});
    }
  }

  function stop() {
    haptic("tap");
    stopRef.current?.();
  }

  async function copyReport() {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(reportText(report));
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
    setTimeout(() => setCopied(null), 2500);
  }

  async function shareReport() {
    if (!report) return;
    try {
      await navigator.share({ title: "Detector lab results", text: reportText(report) });
      setShared(true);
      setTimeout(() => setShared(false), 2500);
    } catch {
      // Closing the share sheet rejects; that is not an error worth showing.
    }
  }

  const busy = phase === "loading" || phase === "running";
  const firstFps = report?.segments[0]?.fps ?? 0;
  const lastFps = report?.segments[report.segments.length - 1]?.fps ?? 0;
  const dropPct = firstFps > 0 ? ((firstFps - lastFps) / firstFps) * 100 : 0;

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-line bg-black">
        <video ref={videoRef} playsInline muted className="block w-full" />
        <canvas ref={overlayRef} className="absolute inset-0 h-full w-full" />
        {phase !== "running" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 px-6 text-center text-sm text-white/80">
            {phase === "loading" ? "Loading the model…" : "The camera picture appears here."}
          </div>
        )}
        {live && (
          <div className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-1 text-[11px] font-bold tabular-nums text-white">
            {fmt(live.fps, 0)} fps · {fmt(live.ms, 0)} ms · {Math.floor(live.elapsed)}s
            {live.ball ? " · ball" : ""}
          </div>
        )}
      </div>

      {report && (
        <section ref={reportRef} className="scroll-mt-4 space-y-4 rounded-2xl border border-accent bg-surface p-4">
          <div className="flex gap-3">
            {[
              { k: "Average", v: `${fmt(report.avgFps)} fps` },
              { k: "Slowest 5%", v: `${fmt(report.p95Ms, 0)} ms` },
              { k: "Ball seen", v: `${fmt(report.ballPct, 0)}%` },
            ].map((t) => (
              <div key={t.k} className="flex-1 rounded-xl bg-[var(--raised)] p-3">
                <p className="text-[9px] font-extrabold uppercase tracking-wide text-foreground-mute">{t.k}</p>
                <p className="font-display mt-1 text-xl text-foreground">{t.v}</p>
              </div>
            ))}
          </div>

          <p className="text-xs leading-relaxed text-foreground-dim">
            {report.segments.length < 2
              ? "Too short to judge heat. Run the full test."
              : dropPct > 25
                ? `Slowed by ${fmt(dropPct, 0)}% over the run — the phone is throttling as it warms up.`
                : `Held steady: ${fmt(firstFps)} fps at the start, ${fmt(lastFps)} at the end.`}
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs tabular-nums">
              <thead>
                <tr className="text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute">
                  <th className="py-1 pr-3">Segment</th>
                  <th className="py-1 pr-3">fps</th>
                  <th className="py-1 pr-3">ms/frame</th>
                  <th className="py-1 pr-3">Model ms</th>
                  <th className="py-1">Ball</th>
                </tr>
              </thead>
              <tbody className="text-foreground-dim">
                {report.segments.map((s) => (
                  <tr key={s.label} className="border-t border-line">
                    <td className="py-1.5 pr-3 font-semibold text-foreground">{s.label}</td>
                    <td className="py-1.5 pr-3">{fmt(s.fps)}</td>
                    <td className="py-1.5 pr-3">{fmt(s.totalMs)}</td>
                    <td className="py-1.5 pr-3">{fmt(s.inferMs)}</td>
                    <td className="py-1.5">{fmt(s.ballPct, 0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-foreground-mute">
            Saved on this phone · {new Date(report.at).toLocaleString()} ·{" "}
            {report.backend === "webgpu" ? "GPU" : "CPU"}
          </p>
          {report.partial && (
            <p className="rounded-lg bg-[var(--raised)] p-3 text-xs leading-relaxed text-red-400">
              This run was cut off before it finished. These numbers cover the{" "}
              {Math.round(report.frames / Math.max(0.001, report.avgFps))}s it got through.
            </p>
          )}

          <div className="flex gap-2">
            {canShare && (
              <button
                type="button"
                onClick={() => void shareReport()}
                className="flex-1 rounded-xl bg-accent py-3 text-[11px] font-extrabold uppercase tracking-wide text-white transition-colors hover:bg-accent-hover"
              >
                {shared ? "Shared" : "Share or save"}
              </button>
            )}
            <button
              type="button"
              onClick={() => void copyReport()}
              className="flex-1 rounded-xl border border-accent py-3 text-[11px] font-extrabold uppercase tracking-wide text-accent transition-colors hover:bg-accent/10"
            >
              {copied === "copied" ? "Copied" : copied === "failed" ? "Copy blocked" : "Copy results"}
            </button>
          </div>

          <details>
            <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wide text-foreground-mute">
              Show as text
            </summary>
            <textarea
              readOnly
              rows={10}
              value={reportText(report)}
              onFocus={(e) => e.currentTarget.select()}
              className="mt-2 w-full rounded-lg border border-line bg-[var(--raised)] p-2 font-mono text-[10px] leading-snug text-foreground-dim"
            />
          </details>
        </section>
      )}

      <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <div className="grid grid-cols-2 gap-2">
          {(["webgpu", "wasm"] as const).map((b) => (
            <button
              key={b}
              type="button"
              disabled={busy}
              onClick={() => setBackend(b)}
              aria-pressed={backend === b}
              className={`rounded-lg border px-3 py-2.5 text-xs font-extrabold uppercase tracking-wide transition-colors disabled:opacity-50 ${
                backend === b ? "border-accent bg-accent/10 text-accent" : "border-line text-foreground-dim"
              }`}
            >
              {b === "webgpu" ? "GPU (WebGPU)" : "CPU (fallback)"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(["camera", "file"] as const).map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              onClick={() => setSource(s)}
              aria-pressed={source === s}
              className={`rounded-lg border px-3 py-2.5 text-xs font-extrabold uppercase tracking-wide transition-colors disabled:opacity-50 ${
                source === s ? "border-accent bg-accent/10 text-accent" : "border-line text-foreground-dim"
              }`}
            >
              {s === "camera" ? "Live camera" : "A saved clip"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {DURATIONS.map((d, i) => (
            <button
              key={d.label}
              type="button"
              disabled={busy}
              onClick={() => setDurationIdx(i)}
              aria-pressed={durationIdx === i}
              className={`rounded-lg border px-3 py-2.5 text-xs font-extrabold uppercase tracking-wide transition-colors disabled:opacity-50 ${
                durationIdx === i ? "border-accent bg-accent/10 text-accent" : "border-line text-foreground-dim"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        {source === "file" && !busy && (
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">
              Choose a video, then it runs for {DURATIONS[durationIdx].seconds}s
            </span>
            <input
              type="file"
              accept="video/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void run(f);
              }}
              className="block w-full text-xs text-foreground-dim file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-xs file:font-extrabold file:uppercase file:text-white"
            />
          </label>
        )}

        {source === "camera" && (
          <button
            type="button"
            onClick={busy ? stop : () => void run()}
            disabled={phase === "loading"}
            className="w-full rounded-xl bg-accent py-3.5 text-sm font-extrabold uppercase tracking-[0.12em] text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {phase === "loading" ? "Loading…" : phase === "running" ? "Stop" : "Start test"}
          </button>
        )}
        {source === "file" && phase === "running" && (
          <button
            type="button"
            onClick={stop}
            className="w-full rounded-xl bg-accent py-3.5 text-sm font-extrabold uppercase tracking-[0.12em] text-white"
          >
            Stop
          </button>
        )}

        {message && <p className="text-xs leading-relaxed text-red-400">{message}</p>}

        {trail && phase === "idle" && (
          <p className="rounded-lg bg-[var(--raised)] p-3 text-xs leading-relaxed text-foreground-dim">
            The last run was cut off before it finished, probably because the
            browser closed the page. It had got as far as: <strong>{trail.step}</strong>.
            Setting: {trail.backend === "webgpu" ? "GPU" : "CPU"},{" "}
            {trail.source === "camera" ? "live camera" : "saved clip"}.
            {savedRuns[0]?.partial && (
              <>
                {" "}
                What it measured before then was saved.{" "}
                <button
                  type="button"
                  onClick={() => setReport(savedRuns[0])}
                  className="font-extrabold uppercase text-accent underline"
                >
                  Show it
                </button>
              </>
            )}
          </p>
        )}
      </section>


      {savedRuns.length > 0 && (
        <section className="space-y-2 rounded-2xl border border-line bg-surface p-4">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">
            Saved runs on this phone
          </p>
          {savedRuns.map((r) => (
            <button
              key={r.at}
              type="button"
              onClick={() => setReport(r)}
              className="flex w-full items-baseline justify-between gap-3 rounded-lg border border-line px-3 py-2.5 text-left text-xs active:bg-[var(--raised)]"
            >
              <span className="font-semibold text-foreground">
                {new Date(r.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </span>
              <span className="tabular-nums text-foreground-dim">
                {r.backend === "webgpu" ? "GPU" : "CPU"} · {fmt(r.avgFps)} fps · {Math.round(r.frames / r.avgFps)}s{r.partial ? " · cut off" : ""}
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => writeDraft(RUNS_KEY, null)}
            className="text-[11px] font-bold uppercase tracking-wide text-foreground-mute"
          >
            Clear saved runs
          </button>
        </section>
      )}
    </div>
  );
}
