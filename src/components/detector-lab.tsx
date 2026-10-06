"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createDetector, nextVideoFrame, yieldToMain, type Backend, type Detector, type ModelId } from "@/lib/vision/detector";
import { MODEL_INPUT, blockMotion, boxToFrame, createMotionGate, hoopWindow, luma, type Crop } from "@/lib/vision/roi";
import { AUTO_SIZE, createAutoSizer } from "@/lib/vision/autoSize";
import { REFERENCE_FPS, createShotCounter, type ShotCall } from "@/lib/vision/shotRules";
import { MODEL_VERSION, RULE_VERSION, saveLabCalls, type LabCalls } from "@/lib/vision/lab-calls";
import { haptic } from "@/lib/haptics";
import { describeWake, getWakeStatus, useWakeLock, useWakeStatus } from "@/lib/use-wake-lock";
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

/**
 * Quick is a smoke test; full is long enough for a phone to warm up. Soak
 * is a whole shooting session: the plan's pass mark for live counting is
 * at least 15 fps held for 10 minutes, without the page being closed.
 */
const DURATIONS = [
  { label: "Quick · 20s", seconds: 20, segment: 5 },
  { label: "Full · 2 min", seconds: 120, segment: 15 },
  { label: "Soak · 10 min", seconds: 600, segment: 60 },
] as const;
const WORK_WIDTH = 640;
/** How many frames one detector thread runs before a fresh one takes over. */
const RECYCLE_FRAMES = 300;
/** Frame-rate limits. "No limit" runs the model back to back. */
const FPS_CAPS = [
  { label: "No limit", fps: 0 },
  { label: "30 fps", fps: 30 },
  { label: "20 fps", fps: 20 },
  { label: "15 fps", fps: 15 },
] as const;
/**
 * Still frames: the model is skipped while nothing moves near the hoop,
 * which is most of a session. A block of the window must change by this
 * much (0-255) to count as movement; the model then keeps running for
 * STILL_HOLD_MS after the last movement, so a whole shot is followed.
 */
const MOTION_THRESHOLD = 6;
const STILL_HOLD_MS = 1500;

/**
 * The ball model was trained on 416 px windows cut from native 1080p
 * video, with the rim at about (192, 190) inside the window
 * (training/README.md, the exam clips). It must be fed the same: a window
 * at full resolution, not a shrunk whole frame, or every ball is a third
 * smaller than anything it learned from.
 */
const BALL_WINDOW = MODEL_INPUT;
/** Where the rim starts, as a fraction of the frame, until it is tapped. */
const DEFAULT_RIM = { x: 0.5, y: 0.3 };
/** Where the rim is on the exam clips (window at 866,260 of 1920x1080, rim at 192,190 in it). */
const EXAM_RIM = { x: (866 + 192) / 1920, y: (260 + 190) / 1080 };
/** The last rim tapped, remembered on this phone: the stand rarely moves far. */
const RIM_KEY = "hl:lab:rim";
/**
 * How far off the rim can be, in window pixels, and still count about as
 * well as dead centre: measured by moving the rim up to 20 px each way on
 * both exam clips (51-58 of 60 right, against 54 at the centre).
 */
const RIM_TOLERANCE = 20;
/** The ball near the rim on the training clips, for the report's cross-check. */
const TRAINED_BALL_WIDTH = 22;
/** Rim-size steps: within about 10% counts as well as exact (training/README.md). */
/** The size can't go beyond these (the window would be tiny or bigger than the frame). */
const SCALE_MIN = 0.5;
const SCALE_MAX = 4;
const SCALE_LIMITS = [SCALE_MIN, SCALE_MAX] as const;
/**
 * Below this much room above the rim (model px; training had 190) the
 * window is jammed against the top of the picture and part of the ball's
 * way in is out of frame.
 */
const MIN_ROOM_ABOVE = 120;

type Source = "camera" | "file";
/** What a run exercises: lets a crash be pinned on the camera or the model. */
type TestMode = "all" | "camera" | "model";
const TEST_MODES: { id: TestMode; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "camera", label: "Camera only" },
  { id: "model", label: "Model only" },
];
type Phase = "idle" | "loading" | "running" | "done" | "error";

type Segment = { label: string; fps: number; totalMs: number; inferMs: number; ballPct: number };

type Report = {
  at: string;
  /** Saved while the run was still going; the run never finished. */
  partial?: boolean;
  test?: TestMode;
  cap?: number;
  /** How the screen was kept awake (or not) during the run. */
  screen?: string;
  /** Which GPU buffer strategy the detector used. */
  io?: string;
  backend: Backend;
  model?: ModelId;
  /** Ball model only: shots and V2 makes counted by the make/miss rule. */
  shots?: { shots: number; makes: number };
  /** Ball model only: rim size setting and the median ball width near the rim, model px. */
  scale?: number;
  ballNearRim?: number | null;
  /** How the size was set: measured from the ball, or the remembered one kept. */
  sizing?: string;
  /** Share of frames the model was skipped because nothing moved near the hoop, percent. */
  skippedPct?: number;
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

/** Whether this browser will actually keep data between visits. */
function storageWorks() {
  try {
    window.localStorage.setItem("hl:probe", "1");
    const ok = window.localStorage.getItem("hl:probe") === "1";
    window.localStorage.removeItem("hl:probe");
    return ok;
  } catch {
    return false;
  }
}
const noSubscribe = () => () => {};

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
    `Detector lab — ${report.backend} — ${report.model === "ball" ? "ball model" : "stock model"} — ${report.source} — test: ${report.test ?? "all"} — ${new Date(report.at).toLocaleString()}${
      report.partial ? " — CUT OFF before finishing" : ""
    }`,
    `Device: ${navigator.userAgent}`,
    `Video: ${report.video}   Model load: ${fmt(report.loadMs, 0)} ms`,
    `Frames: ${report.frames}   Average: ${fmt(report.avgFps)} fps   Slowest 5%: ${fmt(report.p95Ms, 0)} ms`,
    `Frames with a ball: ${fmt(report.ballPct, 0)}%`,
    ...(report.shots ? [`Shots counted: ${report.shots.shots}, makes (rule V2): ${report.shots.makes}`] : []),
    ...(report.scale !== undefined
      ? [
          `Rim size setting: x${report.scale.toFixed(2)} · ball near the rim: ${
            report.ballNearRim ? `${report.ballNearRim.toFixed(0)} px` : "not seen"
          } (training: ${TRAINED_BALL_WIDTH} px)`,
          ...(report.sizing ? [`Size: ${report.sizing}`] : []),
        ]
      : []),
    `Frame limit: ${report.cap ? `${report.cap} fps` : "none"}`,
    ...(report.skippedPct !== undefined ? [`Still frames skipped (model not run): ${fmt(report.skippedPct, 0)}%`] : []),
    `Screen: ${report.screen ?? "not recorded"}`,
    `GPU buffers: ${report.io ?? "not recorded"}`,
    "",
    "Segment      fps    ms/frame  infer ms  ball%",
    ...report.segments.map(
      (s) =>
        `${s.label.padEnd(11)} ${fmt(s.fps).padStart(5)}  ${fmt(s.totalMs).padStart(8)}  ${fmt(s.inferMs).padStart(8)}  ${fmt(s.ballPct, 0).padStart(5)}`
    ),
    ...(() => {
      const lines = eventLines(report.at);
      return lines.length ? ["", "Events during the run:", ...lines] : [];
    })(),
  ].join("\n");
}

/**
 * Things that happened around a run (GPU trouble, the page being hidden or
 * frozen), kept on the device as they happen. A run that is cut off can't
 * explain itself afterwards, so whatever the browser told us beforehand is
 * the only evidence there will be.
 */
const EVENTS_KEY = "hl:lab-events";
type LabEvents = { runAt: string; list: { t: number; text: string }[] };

function readEvents(): LabEvents | null {
  try {
    const raw = readDraft(EVENTS_KEY);
    return raw ? (JSON.parse(raw) as LabEvents) : null;
  } catch {
    return null;
  }
}

function startEvents(runAt: string) {
  writeDraft(EVENTS_KEY, JSON.stringify({ runAt, list: [] } satisfies LabEvents));
}

function logEvent(runStartedMs: number, text: string) {
  const current = readEvents();
  if (!current) return;
  current.list.push({ t: (performance.now() - runStartedMs) / 1000, text });
  writeDraft(EVENTS_KEY, JSON.stringify({ ...current, list: current.list.slice(-40) }));
}

function eventLines(runAt: string): string[] {
  const events = readEvents();
  if (!events || events.runAt !== runAt) return [];
  return events.list.map((e) => `  +${e.t.toFixed(1)}s  ${e.text}`);
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
  writeDraft(
    TRAIL_KEY,
    JSON.stringify({ at: new Date().toISOString(), backend, source, step: `${step} · ${describeWake(getWakeStatus())}` })
  );

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

  // Defaults are the normal test: our ball model, live, the 10-minute soak.
  const [durationIdx, setDurationIdx] = useState(2);
  const [backend, setBackend] = useState<Backend>("wasm");
  const [source, setSource] = useState<Source>("camera");
  const [testMode, setTestMode] = useState<TestMode>("all");
  const [recycle, setRecycle] = useState(false);
  // Saved clip with the ball model: step through every frame (what the
  // offline exam did), or play in real time (what a slow phone would see).
  const [everyFrame, setEveryFrame] = useState(true);
  // 15 fps: the rule holds there (training/README.md) and the phone runs cooler than flat out.
  const [capIdx, setCapIdx] = useState(3);
  const [skipStill, setSkipStill] = useState(true);
  // The size is measured from the ball while the run goes (src/lib/vision/autoSize.ts).
  const [sizing, setSizing] = useState<string | null>(null);
  // "Exam clips" pins the training size, so an exam run is exactly the exam.
  const [pinSize, setPinSize] = useState(false);
  const pinSizeRef = useRef(pinSize);
  useEffect(() => {
    pinSizeRef.current = pinSize;
  }, [pinSize]);
  const [threads, setThreads] = useState(1);
  const [model, setModel] = useState<ModelId>("ball");
  // Where the rim is, as a fraction of the frame. A ref as well, because a
  // tap during a run must move the window without restarting it.
  const rimRef = useRef(DEFAULT_RIM);
  // Rim size: 1 is the training setup; 2 means the rim looks twice as big
  // (zoomed in, or closer), so a window twice as big is cut and shrunk.
  const scaleRef = useRef(1);
  const [scale, setScaleState] = useState(1);
  useEffect(() => {
    try {
      const saved = JSON.parse(readDraft(RIM_KEY) ?? "null") as { x: number; y: number; scale?: number } | null;
      if (saved && saved.x >= 0 && saved.x <= 1 && saved.y >= 0 && saved.y <= 1) {
        rimRef.current = { x: saved.x, y: saved.y };
        const sc = saved.scale && saved.scale >= SCALE_MIN && saved.scale <= SCALE_MAX ? saved.scale : 1;
        scaleRef.current = sc;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setScaleState(sc);
      }
    } catch {
      // Nothing usable saved; the default stands.
    }
  }, []);
  const saveAim = () => writeDraft(RIM_KEY, JSON.stringify({ ...rimRef.current, scale: scaleRef.current }));
  const setRim = (rim: { x: number; y: number }) => {
    rimRef.current = rim;
    saveAim();
  };
  const setScale = (next: number) => {
    const sc = Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(next * 100) / 100));
    scaleRef.current = sc;
    setScaleState(sc);
    saveAim();
  };
  // A warning while aiming when the rim is jammed against the top of the picture.
  const [tight, setTight] = useState(false);
  // Every-frame clips start paused on their first frame until the rim is
  // confirmed, so no early shot is read through a misplaced window.
  const [aiming, setAiming] = useState(false);
  const aimDoneRef = useRef<(() => void) | null>(null);
  // The hoop window drawn large while aiming. On a phone the whole 1080p
  // picture is squeezed to the screen's width, so 20 px of the window (as
  // far off as the rim can be before counting suffers; training/README.md)
  // is about 4 points on screen, smaller than a fingertip. Shown at full
  // width, the same 20 px is about 20 points.
  const zoomRef = useRef<HTMLCanvasElement>(null);
  /** Move the rim by camera pixels, from the zoomed view or the arrows. */
  const moveRimBy = (dx: number, dy: number) => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const cur = rimRef.current;
    setRim({
      x: Math.min(1, Math.max(0, cur.x + dx / v.videoWidth)),
      y: Math.min(1, Math.max(0, cur.y + dy / v.videoHeight)),
    });
  };
  const [shots, setShots] = useState<{ shots: number; makes: number; last: ShotCall | null } | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [live, setLive] = useState<{ fps: number; ms: number; ball: boolean; elapsed: number } | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [copied, setCopied] = useState<"copied" | "failed" | null>(null);
  const [shared, setShared] = useState(false);
  const reportRef = useRef<HTMLElement>(null);
  const [runsRaw] = useLocalDraft(RUNS_KEY);
  const keepsData = useSyncExternalStore(noSubscribe, storageWorks, () => null);
  const savedRuns = useMemo(() => parseRuns(runsRaw), [runsRaw]);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  // Bring a finished (or reopened) result into view: on a phone it would
  // otherwise land below the fold, which reads as "nothing happened".
  useEffect(() => {
    if (report) reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [report]);

  const busy = phase === "loading" || phase === "running";
  useWakeLock(busy);
  const wake = useWakeStatus();

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
    setShots(null);
    setPhase("loading");
    const mark = (step: string) => markStep(backend, source, `${testMode}: ${step}`);
    mark("Starting");

    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay) return;
    // A whole clip, frame by frame, runs until the clip ends instead.
    const exactClip = model === "ball" && source === "file" && testMode !== "model" && Boolean(file) && everyFrame;
    const runSeconds = exactClip ? Number.POSITIVE_INFINITY : DURATIONS[durationIdx].seconds;
    const segmentSeconds = DURATIONS[durationIdx].segment;

    const runStartedMs = performance.now();
    const runStartIso = new Date().toISOString();
    startEvents(runStartIso);
    const note = (text: string) => logEvent(runStartedMs, text);
    const onHide = () => note(`page ${document.visibilityState}`);
    const onPageHide = () => note("pagehide");
    const onFreeze = () => note("page frozen by the browser");
    const onError = (e: ErrorEvent) => note(`error: ${e.message}`);
    const onRejection = (e: PromiseRejectionEvent) => note(`unhandled: ${String(e.reason)}`);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("freeze", onFreeze);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    note("run started");

    const useCamera = testMode !== "model";
    const useModel = testMode !== "camera";

    let detector: Detector | null = null;
    try {
      const loadStart = performance.now();
      if (useModel) detector = await createDetector(backend, (step) => mark(step), {
          recycleAfter: recycle ? RECYCLE_FRAMES : 0,
          threads,
          model,
          onEvent: (text) => logEvent(runStartedMs, text),
        });
      const loadMs = performance.now() - loadStart;

      if (useCamera) {
      if (source === "camera") {
        mark("Opening the camera");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            // The ball model needs native 1080p (see BALL_WINDOW).
            width: { ideal: model === "ball" ? 1920 : 1280 },
            height: { ideal: model === "ball" ? 1080 : 720 },
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
      mark("Starting the video");
      await video.play();
      if (video.videoWidth === 0) throw new Error("The video has no picture to read.");
      }

      const windowed = model === "ball";
      const work = document.createElement("canvas");
      work.width = windowed ? BALL_WINDOW : WORK_WIDTH;
      work.height = windowed
        ? BALL_WINDOW
        : useCamera
          ? Math.round((WORK_WIDTH * video.videoHeight) / video.videoWidth)
          : Math.round((WORK_WIDTH * 9) / 16);
      const wctx = work.getContext("2d", { willReadFrequently: true });
      const octx = overlay.getContext("2d");
      if (!wctx || !octx) throw new Error("Canvas isn't available in this browser.");
      // The overlay covers the whole picture; boxes found in a hoop window
      // are moved back to whole-frame positions before drawing.
      overlay.width = WORK_WIDTH;
      overlay.height = useCamera
        ? Math.round((WORK_WIDTH * video.videoHeight) / video.videoWidth)
        : Math.round((WORK_WIDTH * work.height) / work.width);
      const toOverlay = useCamera ? overlay.width / video.videoWidth : overlay.width / work.width;

      const runAt = runStartIso;
      const short1080 = windowed && useCamera && video.videoHeight < 1080;
      const videoLabel = useCamera
        ? windowed
          ? `${video.videoWidth}×${video.videoHeight}, ${BALL_WINDOW} px hoop window at full resolution${
              short1080 ? " (NOT 1080p: balls look smaller than in training, results not comparable)" : ""
            }`
          : `${video.videoWidth}×${video.videoHeight} → ${work.width}×${work.height}`
        : `no camera: a fixed ${work.width}×${work.height} picture`;
      if (short1080) note(`camera gave ${video.videoWidth}x${video.videoHeight}, not 1080p`);

      // The make/miss rule, fed every frame the ball model sees. A saved
      // clip is timed by its own clock, so a slow phone gets the same frame
      // numbers the offline tools used; it restarts when the clip loops.
      // Made once the rim is aimed (below), at the rim's real place in the window.
      let counter: ReturnType<typeof createShotCounter> | null = null;
      const nearRimWidths: number[] = [];
      let clipTimeMs = -1;
      let shotsRun = { shots: 0, makes: 0 };
      const runCalls: LabCalls["calls"] = [];
      const takeCalls = (calls: ShotCall[]) => {
        for (const c of calls) {
          if (!c.counted) continue;
          shotsRun = { shots: shotsRun.shots + 1, makes: shotsRun.makes + (c.v2 === "make" ? 1 : 0) };
          runCalls.push({ v1: c.v1, v2: c.v2, v3: c.v3, flagged: c.flagged, atMs: Math.round(c.firstMs) });
          setShots({ ...shotsRun, last: c });
        }
      };
      /** One pass is one set: count what is still open, keep the calls, stop counting. */
      const finishCounting = () => {
        if (!counter) return;
        takeCalls(counter.flush());
        counter = null;
        saveLabCalls({
          at: runAt,
          source:
            source === "file" && file
              ? `${file.name}, ${exactClip ? "every frame" : "real time"}`
              : "live camera",
          ruleVersion: RULE_VERSION,
          modelVersion: MODEL_VERSION,
          calls: runCalls,
        });
      };
      // Every-frame mode: the clip is stepped by seeking, not played.
      let frameIdx = 0;
      const clipFrames = exactClip ? Math.floor(video.duration * REFERENCE_FPS) : 0;
      if (exactClip) {
        video.pause();
        video.loop = false;
      }
      const seekTo = (t: number) =>
        new Promise<void>((resolve) => {
          const done = () => resolve();
          video.addEventListener("seeked", done, { once: true });
          video.currentTime = t;
        });

      // Model-only runs feed the same still picture every frame, so any
      // problem found can't be blamed on the camera.
      let still: ImageData | null = null;
      if (!useCamera) {
        const grad = wctx.createLinearGradient(0, 0, work.width, work.height);
        grad.addColorStop(0, "#345");
        grad.addColorStop(1, "#c84");
        wctx.fillStyle = grad;
        wctx.fillRect(0, 0, work.width, work.height);
        wctx.fillStyle = "#e8761c";
        wctx.beginPath();
        wctx.arc(work.width / 2, work.height / 2, 40, 0, Math.PI * 2);
        wctx.fill();
        still = wctx.getImageData(0, 0, work.width, work.height);
      }
      let startedAt = performance.now();
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
          label: segmentSeconds >= 60 ? `${from / 60}–${(from + segmentSeconds) / 60} min` : `${from}–${from + segmentSeconds}s`,
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
        test: testMode,
        cap: FPS_CAPS[capIdx].fps,
        backend,
        source,
        video: videoLabel,
        segments: [...segments],
        model,
        ...(windowed ? { shots: { ...shotsRun } } : {}),
        ...(aimed
          ? {
              ...(skipStill && !exactClip ? { skippedPct: (skippedFrames / Math.max(1, frameMs.length)) * 100 } : {}),
              scale: scaleRef.current,
              ballNearRim: nearRimWidths.length ? [...nearRimWidths].sort((a, b) => a - b)[nearRimWidths.length >> 1] : null,
              sizing: sizingSummary || `x${scaleRef.current.toFixed(2)}, remembered (the ball wasn't measured yet)`,
            }
          : {}),
        frames: frameMs.length,
        avgFps: frameMs.length / Math.max(0.001, (now - startedAt) / 1000),
        p95Ms: percentile(frameMs, 0.95),
        ballPct: (ballFrames.filter(Boolean).length / Math.max(1, ballFrames.length)) * 100,
        loadMs,
        screen: describeWake(getWakeStatus()),
        io: detector?.describeIO() ?? "no model in this test",
      });

      stopRef.current = () => {
        stopped = true;
      };

      setPhase("running");

      // The ball model reads only the hoop window, so it is aimed before any
      // counting starts: a clip waits on its first frame, the live camera
      // keeps playing.
      if (windowed && useCamera) {
        mark("Aiming at the rim");
        if (exactClip) await seekTo(0.5 / REFERENCE_FPS);
        let confirmed = false;
        aimDoneRef.current = () => {
          confirmed = true;
        };
        setAiming(true);
        while (!confirmed && !stopped) {
          const win = hoopWindow(video.videoWidth, video.videoHeight, rimRef.current, scaleRef.current);
          const crop = win.crop;
          setTight(win.roomAbove < MIN_ROOM_ABOVE);
          octx.clearRect(0, 0, overlay.width, overlay.height);
          octx.strokeStyle = "rgba(255,255,255,0.9)";
          octx.lineWidth = 2;
          octx.strokeRect(crop.sx * toOverlay, crop.sy * toOverlay, crop.sw * toOverlay, crop.sh * toOverlay);
          const rx = rimRef.current.x * video.videoWidth * toOverlay;
          const ry = rimRef.current.y * video.videoHeight * toOverlay;
          octx.beginPath();
          octx.moveTo(rx - 12, ry);
          octx.lineTo(rx + 12, ry);
          octx.moveTo(rx, ry - 12);
          octx.lineTo(rx, ry + 12);
          octx.stroke();

          const zoom = zoomRef.current;
          const zctx = zoom?.getContext("2d");
          if (zoom && zctx) {
            // Drawn in the model's own pixels: what the close-up shows is what the model will see.
            const k = zoom.width / MODEL_INPUT;
            zctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, zoom.width, zoom.height);
            const zx = win.rim.x * k;
            const zy = win.rim.y * k;
            // The ring is the measured allowance: anywhere inside it counts as well as dead centre.
            zctx.strokeStyle = "rgba(255,255,255,0.45)";
            zctx.lineWidth = 2;
            zctx.beginPath();
            zctx.arc(zx, zy, RIM_TOLERANCE * k, 0, Math.PI * 2);
            zctx.stroke();
            zctx.strokeStyle = "#ff6a1a";
            zctx.lineWidth = 3;
            zctx.beginPath();
            zctx.moveTo(zx - 18, zy);
            zctx.lineTo(zx + 18, zy);
            zctx.moveTo(zx, zy - 18);
            zctx.lineTo(zx, zy + 18);
            zctx.stroke();
          }
          await new Promise((res) => setTimeout(res, 66));
        }
        aimDoneRef.current = null;
        setAiming(false);
        setTight(false);
        // Time spent aiming isn't part of the run being measured.
        startedAt = performance.now();
        segStart = startedAt;
        lastPaint = 0;
      }

      // The rule watches the rim where it really is in the window: at its
      // trained spot normally, elsewhere when the window met an edge.
      let aimed = windowed && useCamera ? hoopWindow(video.videoWidth, video.videoHeight, rimRef.current, scaleRef.current) : null;
      // Sizing from the ball. Live (and a clip in real time): counting starts
      // at once at the remembered size, and a correction is applied between
      // shots. A clip read frame by frame: a quick first pass (every second
      // frame) measures the ball, then counting starts from the first frame.
      const sizer = aimed && !pinSizeRef.current ? createAutoSizer() : null;
      let sizingPass = Boolean(sizer && exactClip);
      let sizerDone = !sizer;
      let pendingScale: number | null = null;
      let sizerHave = 0;
      let restartClip = false;
      let sizingSummary = sizer ? "" : `x${scaleRef.current.toFixed(2)}, pinned to the training size`;
      setSizing(sizer ? `Measuring the ball: 0 of ${AUTO_SIZE.flights} shots` : null);
      if (aimed) {
        counter = createShotCounter(aimed.rim);
        note(
          `aimed: rim (${Math.round(rimRef.current.x * video.videoWidth)}, ${Math.round(rimRef.current.y * video.videoHeight)}), ` +
            `size x${scaleRef.current.toFixed(2)}, rim in window (${aimed.rim.x.toFixed(0)}, ${aimed.rim.y.toFixed(0)})`
        );
      }

      // Skipping still frames: live camera with the ball model only. A clip
      // read frame by frame is the exam, and stays exact.
      const gate = aimed && skipStill && !exactClip ? createMotionGate({ threshold: MOTION_THRESHOLD, holdMs: STILL_HOLD_MS }) : null;
      let prevLuma: Uint8Array | null = null;
      let curLuma: Uint8Array | null = null;
      let skippedFrames = 0;

      mark("Running, first frame");
      let lastMark = 0;

      while (!stopped) {
        const frameStart = performance.now();
        const elapsed = (frameStart - startedAt) / 1000;
        if (elapsed >= runSeconds) break;
        if (exactClip) {
          if (frameIdx >= clipFrames && sizingPass) {
            // The whole clip measured without settling: keep the size, count.
            sizingPass = false;
            sizerDone = true;
            sizingSummary = `x${scaleRef.current.toFixed(2)}, kept (too few sightings of the ball in the air to measure)`;
            setSizing(null);
            frameIdx = 0;
            if (aimed) counter = createShotCounter(aimed.rim);
          }
          if (frameIdx >= clipFrames) break;
          // The middle of the frame, so rounding never lands on a neighbour.
          await seekTo((frameIdx + 0.5) / REFERENCE_FPS);
        }

        let img: ImageData;
        let crop: Crop | null = null;
        if (useCamera && windowed) {
          // Only the window's pixels are read: 416x416 instead of a whole frame.
          crop = (aimed as NonNullable<typeof aimed>).crop;
          wctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, work.width, work.height);
          img = wctx.getImageData(0, 0, work.width, work.height);
        } else if (useCamera) {
          wctx.drawImage(video, 0, 0, work.width, work.height);
          img = wctx.getImageData(0, 0, work.width, work.height);
        } else {
          img = still as ImageData;
        }
        const frameClipMs = exactClip
          ? (frameIdx * 1000) / REFERENCE_FPS
          : source === "file" && useCamera
            ? video.currentTime * 1000
            : frameStart;
        let runModel = Boolean(detector);
        if (gate) {
          curLuma = luma(img.data, curLuma ?? undefined);
          const moved = prevLuma ? blockMotion(prevLuma, curLuma, img.width, img.height) : 255;
          [prevLuma, curLuma] = [curLuma, prevLuma];
          if (!gate.step(moved, frameStart)) {
            runModel = false;
            skippedFrames += 1;
          }
        }
        const { detections, timings } =
          detector && runModel
            ? await detector.detect(img)
            : { detections: [], timings: { prepMs: 0, inferMs: 0, postMs: 0 } };

        const total = performance.now() - frameStart;
        const ballClass = detector?.ballClass ?? -1;
        const balls = detections.filter((d) => d.classId === ballClass);
        const hasBall = balls.length > 0;
        // Not while a correction waits: those sightings are at the old size.
        if (sizer && aimed && !sizerDone && pendingScale === null) {
          const st = sizer.push(frameClipMs, balls, aimed.rim);
          if (st.kind === "collecting") {
            if (st.have !== sizerHave) {
              sizerHave = st.have;
              setSizing(`Measuring the ball: ${st.have} of ${st.need} shots`);
            }
          } else {
            const next = Math.min(SCALE_LIMITS[1], Math.max(SCALE_LIMITS[0], scaleRef.current * (st.kind === "rescale" ? st.factor : 1)));
            note(`ball in the air ${st.ballWidth.toFixed(1)} px (training ${AUTO_SIZE.referenceWidth}): ${st.kind === "rescale" ? `size x${scaleRef.current.toFixed(2)} -> x${next.toFixed(2)}` : "size kept"}`);
            if (st.kind === "rescale") {
              if (sizingPass) {
                setScale(next);
                aimed = hoopWindow(video.videoWidth, video.videoHeight, rimRef.current, next);
              } else pendingScale = next;
              setSizing(`Size x${next.toFixed(2)} · checking it`);
              sizerHave = 0;
            } else {
              sizerDone = true;
              sizingSummary = `x${scaleRef.current.toFixed(2)}, measured from the ball (${st.ballWidth.toFixed(1)} px in the air; training ${AUTO_SIZE.referenceWidth})`;
              setSizing(`Size x${scaleRef.current.toFixed(2)} · set from the ball`);
              if (sizingPass) {
                sizingPass = false;
                restartClip = true;
                // The window may have moved against an edge at the new size.
                counter = createShotCounter(aimed.rim);
              }
            }
          }
        }
        // A size correction waits for a moment with no shot under way.
        if (pendingScale !== null && counter && aimed && counter.isIdle()) {
          setScale(pendingScale);
          aimed = hoopWindow(video.videoWidth, video.videoHeight, rimRef.current, pendingScale);
          counter = createShotCounter(aimed.rim);
          pendingScale = null;
        }
        if (counter && !sizingPass) {
          if (frameClipMs < clipTimeMs) {
            // The clip looped: that pass was the set. Counting it twice
            // would double every shot.
            finishCounting();
          } else {
            clipTimeMs = frameClipMs;
            takeCalls(counter.push(frameClipMs, balls));
            // Ball size near the rim, to check the size setting against training's 22 px.
            if (aimed && nearRimWidths.length < 5000) {
              for (const b of balls) {
                if (Math.abs((b.x1 + b.x2) / 2 - aimed.rim.x) <= 55 && Math.abs((b.y1 + b.y2) / 2 - aimed.rim.y) <= 50) {
                  nearRimWidths.push(b.x2 - b.x1);
                }
              }
            }
          }
        }
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
          mark(`Running, ${Math.floor(elapsed)}s in, ${frameMs.length} frames done`);
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
            const b = crop ? boxToFrame(d, crop, work.width) : d;
            const k = crop ? toOverlay : overlay.width / work.width;
            octx.strokeStyle = d.classId === ballClass ? "#ff6a1a" : "#22d3ee";
            octx.strokeRect(b.x1 * k, b.y1 * k, (b.x2 - b.x1) * k, (b.y2 - b.y1) * k);
          }
          if (crop) {
            // The window the model sees, and the rim it is counting on.
            octx.strokeStyle = "rgba(255,255,255,0.7)";
            octx.lineWidth = 1.5;
            octx.strokeRect(crop.sx * toOverlay, crop.sy * toOverlay, crop.sw * toOverlay, crop.sh * toOverlay);
            const rx = rimRef.current.x * video.videoWidth * toOverlay;
            const ry = rimRef.current.y * video.videoHeight * toOverlay;
            octx.beginPath();
            octx.moveTo(rx - 10, ry);
            octx.lineTo(rx + 10, ry);
            octx.moveTo(rx, ry - 10);
            octx.lineTo(rx, ry + 10);
            octx.stroke();
          }
          const recent = frameMs.slice(-20);
          const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
          setLive({ fps: 1000 / avg, ms: avg, ball: hasBall, elapsed });
        }

        // A frame limit leaves the GPU idle between frames instead of
        // feeding it work back to back. With a camera, the wait is made of
        // whole camera frames, so the limit lands on the pace asked for
        // instead of overshooting it by up to a frame.
        const capFps = FPS_CAPS[capIdx].fps;
        const due = frameStart + (capFps > 0 ? 1000 / capFps : 0);
        if (exactClip) {
          // The sizing pass reads every second frame; counting reads them all, from the start.
          frameIdx = restartClip ? 0 : frameIdx + (sizingPass ? 2 : 1);
          restartClip = false;
          await yieldToMain();
        } else if (useCamera) {
          do {
            await nextVideoFrame(video);
          } while (performance.now() < due - 6 && !stopped);
        } else {
          const spare = due - performance.now();
          await (spare > 1 ? new Promise((r) => setTimeout(r, spare)) : yieldToMain());
        }
      }

      finishCounting();
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
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("freeze", onFreeze);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
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

  const firstFps = report?.segments[0]?.fps ?? 0;
  const lastFps = report?.segments[report.segments.length - 1]?.fps ?? 0;
  const dropPct = firstFps > 0 ? ((firstFps - lastFps) / firstFps) * 100 : 0;

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-line bg-black">
        <video ref={videoRef} playsInline muted className="block w-full" />
        <canvas
          ref={overlayRef}
          className="absolute inset-0 h-full w-full"
          onPointerDown={(e) => {
            // Aiming: tap the hoop and the window follows it. Once counting
            // starts the window stays put, so the rule's rim never moves.
            if (!aiming) return;
            const r = e.currentTarget.getBoundingClientRect();
            setRim({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
            // A new aim is a new hoop: measure the size again.
            setPinSize(false);
            haptic("tap");
          }}
        />
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
        {shots && (
          <div className="absolute right-2 top-2 rounded-md bg-black/70 px-2 py-1 text-right text-[11px] font-bold tabular-nums text-white">
            {shots.makes}/{shots.shots} made
            {shots.last ? ` · last: ${shots.last.v2}` : ""}
          </div>
        )}
        {sizing && phase === "running" && !aiming && (
          <p className="absolute bottom-2 left-2 right-2 rounded-md bg-black/70 px-2 py-1 text-center text-[11px] font-bold text-white">
            {sizing}
          </p>
        )}
        {aiming && (
          <p className="absolute bottom-2 left-2 right-2 rounded-md bg-black/60 px-2 py-1 text-center text-[11px] text-white/90">
            1. Tap the hoop here to bring it into the square.
          </p>
        )}
      </div>

      {aiming && (
        <section className="space-y-3 rounded-2xl border border-accent bg-surface p-3">
          <p className="text-xs font-semibold text-foreground">
            2. Fine-tune: tap the front of the rim in this close-up. Anywhere inside the ring is close enough.
          </p>
          <p className="text-xs text-foreground-dim">
            No sizing to do: the camera measures the ball on the first few shots and sets the size itself.
          </p>
          {tight && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400">
              The rim is too close to the top of the picture: part of the ball&rsquo;s way in is cut off. Tilt the phone
              down or step back so there&rsquo;s sky above the rim.
            </p>
          )}
          <canvas
            ref={zoomRef}
            width={BALL_WINDOW}
            height={BALL_WINDOW}
            className="block aspect-square w-full touch-none rounded-xl bg-black"
            onPointerDown={(e) => {
              const v = videoRef.current;
              if (!v || !v.videoWidth) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const win = hoopWindow(v.videoWidth, v.videoHeight, rimRef.current, scaleRef.current);
              const toModel = BALL_WINDOW / rect.width;
              const toCamera = win.crop.sw / BALL_WINDOW;
              const tapX = (e.clientX - rect.left) * toModel;
              haptic("tap");
              // A tap moves the rim to that spot: the difference
              // from the cross, in camera pixels.
              moveRimBy((tapX - win.rim.x) * toCamera, ((e.clientY - rect.top) * toModel - win.rim.y) * toCamera);
            }}
          />
          <div className="flex items-center gap-2">
            {(
              [
                ["←", -2, 0, "Left"],
                ["↑", 0, -2, "Up"],
                ["↓", 0, 2, "Down"],
                ["→", 2, 0, "Right"],
              ] as const
            ).map(([arrow, dx, dy, name]) => (
              <button
                key={name}
                type="button"
                aria-label={`Nudge ${name.toLowerCase()}`}
                onClick={() => {
                  haptic("tap");
                  moveRimBy(dx, dy);
                }}
                className="h-10 w-10 rounded-lg border border-line text-base font-extrabold text-foreground-dim"
              >
                {arrow}
              </button>
            ))}
            <span className="ml-auto text-[11px] font-bold tabular-nums text-foreground-mute">
              size ×{scale.toFixed(2)}
              {pinSize ? " (exam, fixed)" : " (auto)"}
            </span>
          </div>
          <div className="flex justify-end">
            {source === "file" && (
              <button
                type="button"
                onClick={() => {
                  // The exam clips were the training setup: rim there, size exactly 1.
                  // Pinned: auto sizing stays off so the exam matches the offline scoring.
                  pinSizeRef.current = true;
                  setPinSize(true);
                  setRim(EXAM_RIM);
                  setScale(1);
                }}
                className="ml-auto rounded-lg border border-line px-2.5 py-2 text-[10px] font-extrabold uppercase text-foreground-dim"
              >
                Exam clips
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              haptic("tap");
              aimDoneRef.current?.();
            }}
            className="w-full rounded-xl bg-accent py-3.5 text-sm font-extrabold uppercase tracking-[0.12em] text-white"
          >
            Start counting
          </button>
        </section>
      )}

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
        <p className="pt-1 text-[10px] font-extrabold uppercase leading-none tracking-[0.14em] text-foreground-mute">Model</p>
        <div className="grid grid-cols-2 gap-2">
          {(["ball", "coco"] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={busy}
              onClick={() => setModel(m)}
              aria-pressed={model === m}
              className={`rounded-lg border px-3 py-2.5 text-xs font-extrabold uppercase tracking-wide transition-colors disabled:opacity-50 ${
                model === m ? "border-accent bg-accent/10 text-accent" : "border-line text-foreground-dim"
              }`}
            >
              {m === "coco" ? "Stock (speed tests)" : "Our ball model"}
            </button>
          ))}
        </div>

        <p className="pt-1 text-[10px] font-extrabold uppercase leading-none tracking-[0.14em] text-foreground-mute">Source</p>
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

        {source === "file" && testMode !== "model" && model === "ball" ? (
          <>
        <p className="pt-1 text-[10px] font-extrabold uppercase leading-none tracking-[0.14em] text-foreground-mute">Length</p>
          <div className="grid grid-cols-2 gap-2">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                disabled={busy}
                onClick={() => setEveryFrame(v)}
                aria-pressed={everyFrame === v}
                className={`rounded-lg border px-3 py-2.5 text-xs font-extrabold uppercase tracking-wide transition-colors disabled:opacity-50 ${
                  everyFrame === v ? "border-accent bg-accent/10 text-accent" : "border-line text-foreground-dim"
                }`}
              >
                {v ? "Every frame (exact)" : "Real time"}
              </button>
            ))}
          </div>
          </>
        ) : (
          <>
        <p className="pt-1 text-[10px] font-extrabold uppercase leading-none tracking-[0.14em] text-foreground-mute">Length</p>
        <div className="grid grid-cols-3 gap-2">
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
          </>
        )}

        {/* Switches for diagnosing problems, not for normal tests: GPU or CPU,
            what the run exercises, threads, a frame limit, worker refresh. */}
        <details className="group rounded-xl border border-line">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">
            Advanced (for diagnosing)
            <span className="text-base transition-transform group-open:rotate-90" aria-hidden>
              ›
            </span>
          </summary>
          <div className="space-y-3 border-t border-line p-3">
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
              {b === "webgpu" ? "GPU (unstable on iPhone)" : "CPU (reliable)"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {TEST_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={busy}
              onClick={() => setTestMode(m.id)}
              aria-pressed={testMode === m.id}
              className={`rounded-lg border px-2 py-2.5 text-[11px] font-extrabold uppercase tracking-wide transition-colors disabled:opacity-50 ${
                testMode === m.id ? "border-accent bg-accent/10 text-accent" : "border-line text-foreground-dim"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {backend === "wasm" && (
          <div>
            <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">
              CPU threads
            </p>
            <div className="grid grid-cols-5 gap-2">
              {[0, 1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={busy}
                  onClick={() => setThreads(n)}
                  aria-pressed={threads === n}
                  className={`rounded-lg border px-2 py-2.5 text-[11px] font-extrabold uppercase tracking-wide transition-colors disabled:opacity-50 ${
                    threads === n ? "border-accent bg-accent/10 text-accent" : "border-line text-foreground-dim"
                  }`}
                >
                  {n === 0 ? "Auto" : n}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          {FPS_CAPS.map((c, i) => (
            <button
              key={c.label}
              type="button"
              disabled={busy}
              onClick={() => setCapIdx(i)}
              aria-pressed={capIdx === i}
              className={`rounded-lg border px-2 py-2.5 text-[11px] font-extrabold uppercase tracking-wide transition-colors disabled:opacity-50 ${
                capIdx === i ? "border-accent bg-accent/10 text-accent" : "border-line text-foreground-dim"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {[
            { on: true, label: `Fresh detector every ${RECYCLE_FRAMES} frames` },
            { on: false, label: "Never refresh" },
          ].map((o) => (
            <button
              key={String(o.on)}
              type="button"
              disabled={busy}
              onClick={() => setRecycle(o.on)}
              aria-pressed={recycle === o.on}
              className={`rounded-lg border px-2 py-2.5 text-[11px] font-extrabold uppercase tracking-wide transition-colors disabled:opacity-50 ${
                recycle === o.on ? "border-accent bg-accent/10 text-accent" : "border-line text-foreground-dim"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { on: true, label: "Skip still frames" },
                { on: false, label: "Run every frame" },
              ].map((o) => (
                <button
                  key={String(o.on)}
                  type="button"
                  disabled={busy}
                  onClick={() => setSkipStill(o.on)}
                  aria-pressed={skipStill === o.on}
                  className={`rounded-lg border px-2 py-2.5 text-[11px] font-extrabold uppercase tracking-wide transition-colors disabled:opacity-50 ${
                    skipStill === o.on ? "border-accent bg-accent/10 text-accent" : "border-line text-foreground-dim"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </details>

        {source === "file" && testMode !== "model" && !busy && (
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">
              {model === "ball" && everyFrame
                ? "Choose a video: every frame is read, to the end of the clip (slower than real time)"
                : `Choose a video, then it runs for ${DURATIONS[durationIdx].seconds}s`}
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

        {(source === "camera" || testMode === "model") && (
          <button
            type="button"
            onClick={busy ? stop : () => void run()}
            disabled={phase === "loading"}
            className="w-full rounded-xl bg-accent py-3.5 text-sm font-extrabold uppercase tracking-[0.12em] text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {phase === "loading" ? "Loading…" : phase === "running" ? "Stop" : "Start test"}
          </button>
        )}
        {source === "file" && testMode !== "model" && phase === "running" && (
          <button
            type="button"
            onClick={stop}
            className="w-full rounded-xl bg-accent py-3.5 text-sm font-extrabold uppercase tracking-[0.12em] text-white"
          >
            Stop
          </button>
        )}

        {message && <p className="text-xs leading-relaxed text-red-400">{message}</p>}

        <p className="text-[10px] font-bold uppercase tracking-wide text-foreground-mute">
          Version {process.env.NEXT_PUBLIC_BUILD} ·{" "}
          {keepsData === null
            ? "checking storage"
            : keepsData
              ? "runs are saved on this phone"
              : "this browser will not save runs"}
          {busy ? ` · ${describeWake(wake)}` : ""}
        </p>

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
            {(() => {
              const lines = eventLines(savedRuns[0]?.at ?? "");
              return lines.length ? (
                <span className="mt-2 block whitespace-pre-wrap font-mono text-[10px]">
                  {lines.slice(-8).join("\n")}
                </span>
              ) : null;
            })()}
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
