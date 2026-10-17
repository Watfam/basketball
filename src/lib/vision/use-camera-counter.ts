"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createDetector, nextVideoFrame, type Detector } from "@/lib/vision/detector";
import { MODEL_INPUT, blockMotion, createMotionGate, hoopWindow, luma } from "@/lib/vision/roi";
import { MATCH_FAIR, MATCH_H, MATCH_STRONG, MATCH_W, findHoop, type HoopMatch, type HoopRef } from "@/lib/vision/hoop-match";
import { HOOP_REF_KEY, decodeRef, encodeRef } from "@/lib/vision/hoop-ref-store";
import { SLOW_FPS, SPEED_FRAMES, speedVerdict } from "@/lib/vision/speed-check";
import { createCountingCore, SCALE_LIMITS, type SizingStatus } from "@/lib/vision/counting";
import type { ShotCall } from "@/lib/vision/shotRules";
import { readDraft, writeDraft } from "@/lib/use-local-draft";
import { REAIM_KEY, nextReaim } from "@/lib/review/reaim-mark";
import { CLIP, createReplayBuffer } from "@/lib/vision/replay-buffer";
import { saveReplay } from "@/lib/vision/replay-store";
import { sessionReviewEnabled } from "@/lib/review/flag";
import { createReviewRecorder } from "@/lib/review/recorder";
import { debugEnabled, record as recordDiag, persist as persistDiag } from "@/lib/review/diagnostics";
import { saveReviewRecord } from "@/lib/review/review-store";

/**
 * The camera, as a shot counter, for the Shoot screen.
 *
 * Opens the back camera at 1080p (the ball model was trained on native
 * 1080p windows), loads the model, lets the player aim at the rim, then
 * reads the hoop window at 15 frames a second and hands every decided shot
 * to `onShot`. Nothing is recorded or uploaded: frames are looked at and
 * dropped.
 *
 * Settings are the ones the camera lab measured (training/README.md):
 * CPU, one thread, 15 fps, the model skipped while nothing moves near the
 * hoop, and the size set from the ball.
 */

export type CameraPhase = "idle" | "starting" | "aiming" | "counting" | "error";

/** The rim and size, remembered on this phone (the camera lab uses the same). */
export const AIM_KEY = "hl:lab:rim";
const DEFAULT_RIM = { x: 0.5, y: 0.3 };
const FPS = 15;
const MOTION_THRESHOLD = 6;
const STILL_HOLD_MS = 1500;
/** Model px above the rim below which part of the ball's way in is out of the picture (training had 190). */
export const MIN_ROOM_ABOVE = 120;
/** No ball at all for this long while counting: the hoop may have left the picture. */
const NO_BALL_MS = 60_000;
/** Replay frames: the hoop close-up, this many px square, as JPEG. About 15 KB a frame. */
const REPLAY_SIZE = 288;
const REPLAY_QUALITY = 0.6;

export type CameraHealth = {
  fps: number;
  /** Frame rate has stayed under SLOW_FPS for a while: a warm phone, usually. */
  slow: boolean;
  /** Nothing ball-like for a minute. */
  noBall: boolean;
  sizing: SizingStatus | null;
  /** The camera gave less than 1080p: balls look smaller than in training. */
  lowRes: boolean;
};

type Aim = { x: number; y: number; scale: number };

/** Looking for the hoop where the last set had it. */
export type FindState =
  | { kind: "idle" }
  | { kind: "searching" }
  /** Found with confidence: counting starts by itself after a short, cancellable countdown. */
  | { kind: "strong"; score: number }
  /** Found, but the player should look first. */
  | { kind: "fair"; score: number }
  /** No saved hoop, no match, or the player aimed by hand. */
  | { kind: "none" };

/** Whether this phone can run the ball model fast enough, timed while the player aims. */
export type SpeedState = { kind: "idle" | "checking" | "ok" } | { kind: "slow"; fps: number };

/** Seconds of "Hoop found" before counting starts by itself. */
const AUTO_START_S = 3;

let matchCanvas: HTMLCanvasElement | null = null;
/** The camera picture as a MATCH_W x MATCH_H grey picture, for finding the hoop. */
function grabGray(video: HTMLVideoElement): Uint8Array | null {
  if (!video.videoWidth) return null;
  matchCanvas ??= document.createElement("canvas");
  matchCanvas.width = MATCH_W;
  matchCanvas.height = MATCH_H;
  const ctx = matchCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, MATCH_W, MATCH_H);
  return luma(ctx.getImageData(0, 0, MATCH_W, MATCH_H).data);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function savedAim(): Aim | null {
  try {
    const a = JSON.parse(readDraft(AIM_KEY) ?? "null") as Partial<Aim> | null;
    if (a && typeof a.x === "number" && typeof a.y === "number" && a.x >= 0 && a.x <= 1 && a.y >= 0 && a.y <= 1) {
      const s = typeof a.scale === "number" ? Math.min(SCALE_LIMITS[1], Math.max(SCALE_LIMITS[0], a.scale)) : 1;
      return { x: a.x, y: a.y, scale: s };
    }
  } catch {
    // Nothing usable saved.
  }
  return null;
}

/**
 * `onShot` gets each counted shot and the id of its replay: the clip is
 * saved on the phone a moment later (src/lib/vision/replay-store.ts).
 */
export function useCameraCounter({ onShot }: { onShot: (call: ShotCall, replayId: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<CameraPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<CameraHealth | null>(null);
  const [tight, setTight] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string | null>(null);
  const [find, setFind] = useState<FindState>({ kind: "idle" });
  /** Seconds left before a confident match starts counting; null when nothing is counting down. */
  const [autoIn, setAutoIn] = useState<number | null>(null);
  /** The rim has a position the player (or the finder) chose, not just the default. */
  const [aimed, setAimed] = useState(false);
  const [speed, setSpeed] = useState<SpeedState>({ kind: "idle" });
  /** Counting is paused so the player can move the phone and aim again; the picture and the model stay open and the shots so far are kept. */
  const [reaiming, setReaiming] = useState(false);
  const speedRef = useRef<Promise<void> | null>(null);

  const aimRef = useRef<Aim>({ ...DEFAULT_RIM, scale: 1 });
  const refRef = useRef<HoopRef | null>(null);
  /** The player has put a finger on the picture: whatever the finder says no longer applies. */
  const handAimedRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<Promise<Detector> | null>(null);
  const runRef = useRef(0);
  const flushRef = useRef<(() => void) | null>(null);
  const onShotRef = useRef(onShot);
  useEffect(() => {
    onShotRef.current = onShot;
  }, [onShot]);

  const saveAim = () => writeDraft(AIM_KEY, JSON.stringify(aimRef.current));

  const teardown = useCallback(() => {
    runRef.current += 1;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.srcObject = null;
    }
    const det = detectorRef.current;
    detectorRef.current = null;
    void det?.then((d) => d.dispose()).catch(() => {});
  }, []);

  useEffect(() => teardown, [teardown]);

  /** Is the hoop window too near the top of the picture for the ball's way in? */
  const refreshTight = useCallback(() => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const win = hoopWindow(video.videoWidth, video.videoHeight, aimRef.current, aimRef.current.scale);
    setTight(win.roomAbove < MIN_ROOM_ABOVE);
  }, []);

  /** Times a few frames of picture grab and model on this phone, while the player aims. */
  const checkSpeed = useCallback(async (run: number) => {
    setSpeed({ kind: "checking" });
    try {
      const detector = await detectorRef.current;
      const video = videoRef.current;
      if (!detector || !video?.videoWidth || run !== runRef.current) return;
      const work = document.createElement("canvas");
      work.width = work.height = MODEL_INPUT;
      const ctx = work.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      const times: number[] = [];
      for (let i = 0; i < SPEED_FRAMES; i += 1) {
        const t0 = performance.now();
        const { crop } = hoopWindow(video.videoWidth, video.videoHeight, aimRef.current, aimRef.current.scale);
        ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, MODEL_INPUT, MODEL_INPUT);
        await detector.detect(ctx.getImageData(0, 0, MODEL_INPUT, MODEL_INPUT));
        times.push(performance.now() - t0);
        if (run !== runRef.current) return;
      }
      const v = speedVerdict(times);
      if (run === runRef.current) setSpeed(v.kind === "slow" ? { kind: "slow", fps: v.fps } : { kind: "ok" });
    } catch {
      // The model failing to load is reported when counting starts; the check just passes.
      if (run === runRef.current) setSpeed({ kind: "ok" });
    }
  }, []);

  /**
   * The camera has just opened: look for the hoop where the last set had it. The picture needs a moment to settle (exposure), so
   * the look is made twice if the first is weak. A player's touch on the picture ends all of this.
   */
  const autoFind = useCallback(
    async (run: number) => {
      const ref = refRef.current;
      if (!ref) {
        setFind({ kind: "none" });
        return;
      }
      setFind({ kind: "searching" });
      let best: HoopMatch | null = null;
      for (const wait of [700, 1800]) {
        await sleep(wait);
        if (run !== runRef.current || handAimedRef.current) return;
        const video = videoRef.current;
        const frame = video ? grabGray(video) : null;
        if (!frame) continue;
        const m = await findHoop(ref, frame, () => sleep(0));
        if (run !== runRef.current || handAimedRef.current) return;
        if (!best || m.score > best.score) best = m;
        if (m.score >= MATCH_STRONG) break;
      }
      if (!best || best.score < MATCH_FAIR) {
        setFind({ kind: "none" });
        return;
      }
      aimRef.current = {
        x: best.rim.x,
        y: best.rim.y,
        scale: Math.min(SCALE_LIMITS[1], Math.max(SCALE_LIMITS[0], ref.scale * best.sizeRatio)),
      };
      saveAim();
      setAimed(true);
      refreshTight();
      if (best.score >= MATCH_STRONG) {
        setFind({ kind: "strong", score: best.score });
        setAutoIn(AUTO_START_S);
      } else {
        setFind({ kind: "fair", score: best.score });
      }
    },
    [refreshTight]
  );

  /** Open the camera and start loading the model; then aim. */
  const start = useCallback(async () => {
    teardown();
    const run = runRef.current;
    setError(null);
    setHealth(null);
    setPhase("starting");
    setFind({ kind: "idle" });
    setAutoIn(null);
    setSpeed({ kind: "idle" });
    setReaiming(false);
    handAimedRef.current = false;
    const saved = savedAim();
    aimRef.current = saved ?? { ...DEFAULT_RIM, scale: 1 };
    setAimed(saved !== null);
    refRef.current = decodeRef(readDraft(HOOP_REF_KEY));
    // The model loads while the camera opens and the player aims.
    detectorRef.current = createDetector("wasm", (s) => setLoadingStep(s), { model: "ball", threads: 1 });
    detectorRef.current.catch(() => {});
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
        audio: false,
      });
      if (run !== runRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("No video element.");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      if (!video.videoWidth) throw new Error("The camera gave no picture.");
      setPhase("aiming");
      speedRef.current = checkSpeed(run);
      void autoFind(run);
    } catch (e) {
      if (run !== runRef.current) return;
      const name = e instanceof DOMException ? e.name : "";
      setError(
        name === "NotAllowedError"
          ? "The camera wasn't allowed. Allow it for this site in the browser's settings, then try again."
          : e instanceof Error
            ? e.message
            : String(e)
      );
      setPhase("error");
      teardown();
    }
  }, [teardown, autoFind, checkSpeed]);

  /**
   * The phone left the app (a call, another app, the screen locking) and came back, or another app took the camera. iOS pauses the
   * picture while the page is hidden: a paused video is started again, and a camera that ended is an error with a way back in,
   * not a counter that silently sees nothing. Shots already decided are kept.
   */
  useEffect(() => {
    if (phase !== "counting" && phase !== "aiming") return;
    const track = streamRef.current?.getVideoTracks()[0];
    const interrupted = () => {
      const flush = flushRef.current;
      flushRef.current = null;
      flush?.();
      setError("The camera was interrupted (another app, a call or the screen locking). Open it again to carry on: your shots so far are kept.");
      setPhase("error");
      teardown();
    };
    const resume = () => {
      if (document.visibilityState !== "visible") return;
      if (track && track.readyState === "ended") {
        interrupted();
        return;
      }
      const v = videoRef.current;
      if (v && v.paused) void v.play().catch(() => {});
    };
    track?.addEventListener("ended", interrupted);
    document.addEventListener("visibilitychange", resume);
    return () => {
      track?.removeEventListener("ended", interrupted);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [phase, teardown]);

  /** The size warning while aiming: the window the model will see must have room above the rim. */
  useEffect(() => {
    if (phase !== "aiming") return;
    refreshTight();
  }, [phase, refreshTight]);

  /** The rim is here (fractions of the picture). `commit: false` while a finger is still sliding. */
  const aimAt = useCallback(
    (fx: number, fy: number, commit = true) => {
      handAimedRef.current = true;
      setAutoIn(null);
      setFind((f) => (f.kind === "none" ? f : { kind: "none" }));
      setAimed(true);
      aimRef.current = { ...aimRef.current, x: Math.min(1, Math.max(0, fx)), y: Math.min(1, Math.max(0, fy)) };
      if (commit) {
        saveAim();
        refreshTight();
      }
    },
    [refreshTight]
  );

  /** Ends the "Hoop found" countdown and leaves the aim to the player. */
  const cancelAuto = useCallback(() => {
    handAimedRef.current = true;
    setAutoIn(null);
    setFind({ kind: "none" });
  }, []);

  /**
   * Pause counting to move the phone and aim again. Shots still being decided are decided now and kept (as when a set ends), the counting loop
   * stops, and the camera picture and the ball model stay open. The player aims, and counting starts again with a fresh window on the new rim.
   * Nothing about how a shot is counted changes; the set carries on in the same session. The re-aim is noted so the saved set is not pooled
   * with sets filmed from one place (src/lib/review/reaim-mark.ts).
   */
  const reaim = useCallback(() => {
    if (phase !== "counting") return;
    const flush = flushRef.current;
    flushRef.current = null;
    flush?.();
    runRef.current += 1;
    try {
      writeDraft(REAIM_KEY, nextReaim(readDraft(REAIM_KEY), null, Date.now()));
    } catch {
      // The note is a safeguard for saved history; counting goes on without it.
    }
    // No hoop finder here: the phone has not moved yet, so it would "find" the old spot and restart counting before the player could move it.
    handAimedRef.current = true;
    setHealth(null);
    setLoadingStep(null);
    setAutoIn(null);
    setFind({ kind: "none" });
    setAimed(true);
    setReaiming(true);
    setPhase("aiming");
    refreshTight();
  }, [phase, refreshTight]);

  const getAim = useCallback(() => aimRef.current, []);

  /** Aimed: count. Waits for the model if it's still loading. */
  const startCounting = useCallback(async () => {
    const run = runRef.current;
    const video = videoRef.current;
    if (!video?.videoWidth || !detectorRef.current) return;
    setAutoIn(null);
    setReaiming(false);
    setPhase("counting");
    // A speed check still running shares the model; let it finish.
    await speedRef.current?.catch(() => {});
    let detector: Detector;
    try {
      setLoadingStep("Loading the ball model");
      detector = await detectorRef.current;
      setLoadingStep(null);
    } catch (e) {
      if (run !== runRef.current) return;
      setError(`The ball model didn't load: ${e instanceof Error ? e.message : String(e)}`);
      setPhase("error");
      teardown();
      return;
    }
    if (run !== runRef.current) return;

    // Remember this hoop: next time the camera opens, it is looked for here.
    const frame = grabGray(video);
    if (frame) {
      refRef.current = { gray: frame, rim: { x: aimRef.current.x, y: aimRef.current.y }, scale: aimRef.current.scale };
      writeDraft(HOOP_REF_KEY, encodeRef(refRef.current));
    }

    const core = createCountingCore({
      frameW: video.videoWidth,
      frameH: video.videoHeight,
      rim: { x: aimRef.current.x, y: aimRef.current.y },
      scale: aimRef.current.scale,
      autoSize: true,
    });
    // Replays: the last 6 s of the close-up, and each shot's clip cut from it.
    const replay = createReplayBuffer<Blob>(6000);
    // Session review (experimental, flag-gated): note the boxes the model already returns. Null, and inert, unless the flag is on.
    const reviewRec = sessionReviewEnabled() ? createReviewRecorder(debugEnabled() ? { onPushMs: (ms) => recordDiag("recorder.push", ms) } : {}) : null;
    const shot = document.createElement("canvas");
    shot.width = shot.height = REPLAY_SIZE;
    const shotCtx = shot.getContext("2d");
    let encoding = false;
    const keepClip = (c: ShotCall, wait: boolean) => {
      const id = `shot-${Math.round(c.firstMs)}`;
      const save = () => {
        const frames = replay
          .between(c.firstMs - CLIP.beforeMs, c.firstMs + CLIP.afterMs)
          .map((x) => ({ t: x.t - c.firstMs, blob: x.item }));
        if (frames.length) void saveReplay({ id, frames });
        if (reviewRec) {
          void saveReviewRecord(reviewRec.cut(c.firstMs, id, core.window.rim, core.scale));
          if (debugEnabled()) persistDiag();
        }
      };
      // The call comes 1.3-2.3 s after the rim; wait for the rest of the clip.
      if (wait) setTimeout(save, 900);
      else save();
      return id;
    };
    flushRef.current = () => {
      for (const c of core.flush()) if (c.counted) onShotRef.current(c, keepClip(c, false));
    };
    const gate = createMotionGate({ threshold: MOTION_THRESHOLD, holdMs: STILL_HOLD_MS });
    const work = document.createElement("canvas");
    work.width = work.height = MODEL_INPUT;
    const ctx = work.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    let prev: Uint8Array | null = null;
    let cur: Uint8Array | null = null;
    const lowRes = video.videoHeight < 1080;
    const started = performance.now();
    let lastBallAt = started;
    let slowSince: number | null = null;
    let lastStatus = 0;
    const recent: number[] = [];
    const diag = debugEnabled();
    let prevT0 = 0, diagFrames = 0;

    while (run === runRef.current) {
      const t0 = performance.now();
      if (diag && prevT0) recordDiag("loop.interval_ms", t0 - prevT0);
      prevT0 = t0;
      const { crop } = core.window;
      ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, MODEL_INPUT, MODEL_INPUT);
      const img = ctx.getImageData(0, 0, MODEL_INPUT, MODEL_INPUT);
      // One frame encoding at a time: if the phone falls behind, a frame is skipped, not queued.
      if (shotCtx && !encoding) {
        encoding = true;
        shotCtx.drawImage(work, 0, 0, REPLAY_SIZE, REPLAY_SIZE);
        shot.toBlob(
          (blob) => {
            encoding = false;
            if (blob) replay.push(t0, blob);
          },
          "image/jpeg",
          REPLAY_QUALITY
        );
      }
      cur = luma(img.data, cur ?? undefined);
      const moved = prev ? blockMotion(prev, cur, MODEL_INPUT, MODEL_INPUT) : 255;
      [prev, cur] = [cur, prev];
      let balls: { x1: number; y1: number; x2: number; y2: number; score?: number }[] = [];
      const modelRan = gate.step(moved, t0);
      if (modelRan) {
        try {
          const d0 = diag ? performance.now() : 0;
          const { detections } = await detector.detect(img);
          if (diag) recordDiag("loop.detect_ms", performance.now() - d0);
          balls = detections.filter((d) => d.classId === detector.ballClass);
        } catch (e) {
          if (run !== runRef.current) return;
          setError(`The ball model stopped: ${e instanceof Error ? e.message : String(e)}`);
          setPhase("error");
          teardown();
          return;
        }
      }
      if (run !== runRef.current) return;
      if (balls.length) lastBallAt = t0;
      reviewRec?.push(t0, modelRan, balls);
      const { calls, windowChanged } = core.push(t0, balls);
      for (const c of calls) if (c.counted) onShotRef.current(c, keepClip(c, true));
      if (windowChanged) {
        reviewRec?.reset();
        aimRef.current = { ...aimRef.current, scale: core.scale };
        saveAim();
        if (refRef.current) {
          refRef.current = { ...refRef.current, scale: core.scale };
          writeDraft(HOOP_REF_KEY, encodeRef(refRef.current));
        }
      }

      if (diag) {
        recordDiag("loop.work_ms", performance.now() - t0);
        diagFrames += 1;
        if (diagFrames % 150 === 0) persistDiag();
      }

      const now = performance.now();
      recent.push(now);
      while (recent.length && now - recent[0] > 5000) recent.shift();
      if (now - lastStatus > 500) {
        lastStatus = now;
        const fps = recent.length / Math.min(5, Math.max(0.5, (now - started) / 1000));
        slowSince = fps < SLOW_FPS && now - started > 10_000 ? (slowSince ?? now) : null;
        setHealth({
          fps,
          slow: slowSince !== null && now - slowSince > 10_000,
          noBall: now - lastBallAt > NO_BALL_MS,
          sizing: core.sizing,
          lowRes,
        });
      }

      // Pace: whole camera frames until 1/15 s has passed.
      const due = t0 + 1000 / FPS;
      do {
        await nextVideoFrame(video);
      } while (performance.now() < due - 6 && run === runRef.current);
    }
  }, [teardown]);

  /** A confident match counts down, then starts counting by itself. */
  useEffect(() => {
    if (phase !== "aiming" || find.kind !== "strong" || autoIn === null) return;
    // Held while the phone is being timed, and for good if it is too slow: the warning needs reading first.
    if (speed.kind === "checking" || speed.kind === "slow") return;
    if (autoIn <= 0) {
      // Out of the effect's own pass: counting starts by setting state.
      const id = setTimeout(() => void startCounting(), 0);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setAutoIn(autoIn - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, find, autoIn, speed, startCounting]);

  /** Stop the camera. Shots still being decided are decided now and passed to onShot. */
  const stop = useCallback(() => {
    const flush = flushRef.current;
    flushRef.current = null;
    flush?.();
    if (debugEnabled()) persistDiag();
    teardown();
    setPhase("idle");
    setHealth(null);
    setReaiming(false);
  }, [teardown]);

  return { videoRef, phase, error, health, tight, loadingStep, find, autoIn, aimed, speed, reaiming, start, aimAt, cancelAuto, reaim, getAim, startCounting, stop };
}
