"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createDetector, nextVideoFrame, type Detector } from "@/lib/vision/detector";
import { MODEL_INPUT, blockMotion, createMotionGate, hoopWindow, luma } from "@/lib/vision/roi";
import { createCountingCore, SCALE_LIMITS, type SizingStatus } from "@/lib/vision/counting";
import type { ShotCall } from "@/lib/vision/shotRules";
import { readDraft, writeDraft } from "@/lib/use-local-draft";
import { CLIP, createReplayBuffer } from "@/lib/vision/replay-buffer";
import { saveReplay } from "@/lib/vision/replay-store";

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
/** Below this the rule starts missing shots (training/README.md: it holds at 15, not much under). */
const SLOW_FPS = 10;
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

function readAim(): Aim {
  try {
    const a = JSON.parse(readDraft(AIM_KEY) ?? "null") as Partial<Aim> | null;
    if (a && typeof a.x === "number" && typeof a.y === "number" && a.x >= 0 && a.x <= 1 && a.y >= 0 && a.y <= 1) {
      const s = typeof a.scale === "number" ? Math.min(SCALE_LIMITS[1], Math.max(SCALE_LIMITS[0], a.scale)) : 1;
      return { x: a.x, y: a.y, scale: s };
    }
  } catch {
    // Nothing usable saved.
  }
  return { ...DEFAULT_RIM, scale: 1 };
}

/**
 * `onShot` gets each counted shot and the id of its replay: the clip is
 * saved on the phone a moment later (src/lib/vision/replay-store.ts).
 */
export function useCameraCounter({ onShot }: { onShot: (call: ShotCall, replayId: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const zoomRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<CameraPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<CameraHealth | null>(null);
  const [tight, setTight] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string | null>(null);

  const aimRef = useRef<Aim>({ ...DEFAULT_RIM, scale: 1 });
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

  /** Open the camera and start loading the model; then aim. */
  const start = useCallback(async () => {
    teardown();
    const run = runRef.current;
    setError(null);
    setHealth(null);
    setPhase("starting");
    aimRef.current = readAim();
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
  }, [teardown]);

  /** The close-up while aiming: the window the model will see, with the rim mark and its allowance. */
  useEffect(() => {
    if (phase !== "aiming") return;
    let live = true;
    const draw = () => {
      if (!live) return;
      const video = videoRef.current;
      const zoom = zoomRef.current;
      if (video?.videoWidth) {
        const win = hoopWindow(video.videoWidth, video.videoHeight, aimRef.current, aimRef.current.scale);
        setTight(win.roomAbove < MIN_ROOM_ABOVE);
        const z = zoom?.getContext("2d");
        if (zoom && z) {
          const k = zoom.width / MODEL_INPUT;
          z.drawImage(video, win.crop.sx, win.crop.sy, win.crop.sw, win.crop.sh, 0, 0, zoom.width, zoom.height);
          const zx = win.rim.x * k;
          const zy = win.rim.y * k;
          z.strokeStyle = "rgba(255,255,255,0.5)";
          z.lineWidth = 2;
          z.beginPath();
          z.arc(zx, zy, 20 * k, 0, Math.PI * 2);
          z.stroke();
          z.strokeStyle = "#ff6a1a";
          z.lineWidth = 3;
          z.beginPath();
          z.moveTo(zx - 18, zy);
          z.lineTo(zx + 18, zy);
          z.moveTo(zx, zy - 18);
          z.lineTo(zx, zy + 18);
          z.stroke();
        }
      }
      setTimeout(draw, 66);
    };
    draw();
    return () => {
      live = false;
    };
  }, [phase]);

  /** A tap on the whole picture: the rim is there (fractions of the picture). */
  const aimAt = useCallback((fx: number, fy: number) => {
    aimRef.current = { ...aimRef.current, x: Math.min(1, Math.max(0, fx)), y: Math.min(1, Math.max(0, fy)) };
    saveAim();
  }, []);

  /** A tap in the close-up: the rim is there (fractions of the close-up). */
  const aimInZoom = useCallback((fx: number, fy: number) => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const win = hoopWindow(video.videoWidth, video.videoHeight, aimRef.current, aimRef.current.scale);
    const cx = win.crop.sx + fx * win.crop.sw;
    const cy = win.crop.sy + fy * win.crop.sh;
    aimRef.current = { ...aimRef.current, x: cx / video.videoWidth, y: cy / video.videoHeight };
    saveAim();
  }, []);

  /** Aimed: count. Waits for the model if it's still loading. */
  const startCounting = useCallback(async () => {
    const run = runRef.current;
    const video = videoRef.current;
    if (!video?.videoWidth || !detectorRef.current) return;
    setPhase("counting");
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

    const core = createCountingCore({
      frameW: video.videoWidth,
      frameH: video.videoHeight,
      rim: { x: aimRef.current.x, y: aimRef.current.y },
      scale: aimRef.current.scale,
      autoSize: true,
    });
    // Replays: the last 6 s of the close-up, and each shot's clip cut from it.
    const replay = createReplayBuffer<Blob>(6000);
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

    while (run === runRef.current) {
      const t0 = performance.now();
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
      let balls: { x1: number; y1: number; x2: number; y2: number }[] = [];
      if (gate.step(moved, t0)) {
        try {
          const { detections } = await detector.detect(img);
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
      const { calls, windowChanged } = core.push(t0, balls);
      for (const c of calls) if (c.counted) onShotRef.current(c, keepClip(c, true));
      if (windowChanged) {
        aimRef.current = { ...aimRef.current, scale: core.scale };
        saveAim();
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

  /** Stop the camera. Shots still being decided are decided now and passed to onShot. */
  const stop = useCallback(() => {
    const flush = flushRef.current;
    flushRef.current = null;
    flush?.();
    teardown();
    setPhase("idle");
    setHealth(null);
  }, [teardown]);

  return { videoRef, zoomRef, phase, error, health, tight, loadingStep, start, aimAt, aimInZoom, startCounting, stop };
}
