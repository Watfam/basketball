"use client";

import { useEffect, useRef } from "react";
import { containedRect, pictureFraction } from "@/lib/vision/contain";
import { haptic } from "@/lib/haptics";

/** How much of the picture the magnifier shows (camera px across) and how big it is (screen px). */
const LOUPE_SOURCE = 150;
const LOUPE_SIZE = 150;
/** The magnifier floats this far above the fingertip so the finger never hides the rim. */
const LOUPE_LIFT = 110;

type Aim = { x: number; y: number };

/**
 * The box the camera picture is drawn in, in the canvas's own pixels. The video and this canvas are both stretched over the same parent, so
 * the box is the canvas's own size. Only its size is read from the rect, never its position: after an iPhone is turned sideways in an installed
 * app, rects of fixed elements can be reported about a status bar (60 px) off from where they are drawn.
 */
function pictureBox(canvas: HTMLCanvasElement) {
  const r = canvas.getBoundingClientRect();
  return { x: 0, y: 0, w: r.width, h: r.height };
}

/**
 * Aiming at the rim: touch the picture, slide until the cross in the magnifier
 * sits on the front of the rim, lift. The magnifier floats above the finger
 * (a finger is far bigger than a rim), and the rim keeps a ring on the picture.
 * One canvas over the picture does the drawing and takes the touch.
 */
export function AimCanvas({
  videoRef,
  getAim,
  onAim,
  active,
  tone,
  shieldRef,
  onSecret,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  getAim: () => Aim;
  /** `commit` is false while the finger is still sliding, true when it lifts. */
  onAim: (fx: number, fy: number, commit: boolean) => void;
  /** Touch is taken while true. */
  active: boolean;
  /** Ring colour while the rim position came from the finder rather than a finger. */
  tone: "hand" | "found";
  /** The control bar over the picture. A touch that lands on it is a button press, never a rim touch. */
  shieldRef?: React.RefObject<HTMLElement | null>;
  /** Two fingers held on the picture for a moment: opens the touch check, for a phone where the status tag cannot be reached. */
  onSecret?: () => void;
}) {
  const fingers = useRef(new Set<number>());
  const secret = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settle = (id: number) => {
    fingers.current.delete(id);
    if (secret.current) clearTimeout(secret.current);
    secret.current = null;
  };
  const canvasRef = useRef<HTMLCanvasElement>(null);
    const touch = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let live = true;
    let raf = 0;
    const css = (name: string, fallback: string) => getComputedStyle(canvas).getPropertyValue(name).trim() || fallback;
    const draw = () => {
      if (!live) return;
      raf = requestAnimationFrame(draw);
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const ctx = canvas.getContext("2d");
      const video = videoRef.current;
      if (!ctx || !video?.videoWidth) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const box = pictureBox(canvas);
      const cr = containedRect(box.w, box.h, video.videoWidth, video.videoHeight);
      const r = { x: box.x + cr.x, y: box.y + cr.y, w: cr.w, h: cr.h };
      const aim = getAim();
      const ax = r.x + aim.x * r.w;
      const ay = r.y + aim.y * r.h;
      const accent = css("--accent", "#ff6a1a");
      const ok = css("--data-positive", "#4ade80");
      const ringColour = tone === "found" ? ok : accent;

      // The ring on the picture.
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.beginPath();
      ctx.arc(ax, ay, 17, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = ringColour;
      ctx.beginPath();
      ctx.arc(ax, ay, 17, 0, Math.PI * 2);
      ctx.moveTo(ax - 24, ay);
      ctx.lineTo(ax - 10, ay);
      ctx.moveTo(ax + 10, ay);
      ctx.lineTo(ax + 24, ay);
      ctx.moveTo(ax, ay - 24);
      ctx.lineTo(ax, ay - 10);
      ctx.moveTo(ax, ay + 10);
      ctx.lineTo(ax, ay + 24);
      ctx.stroke();

      // The magnifier, while a finger is down.
      const t = touch.current;
      if (!t) return;
      const below = t.y - LOUPE_LIFT - LOUPE_SIZE / 2 < 4;
      const cx = Math.min(w - LOUPE_SIZE / 2 - 4, Math.max(LOUPE_SIZE / 2 + 4, t.x));
      const cy = below ? t.y + LOUPE_LIFT : t.y - LOUPE_LIFT;
      const half = LOUPE_SOURCE / 2;
      // Where the finger is on the camera picture, kept inside it so the source never leaves the picture.
      const px = Math.min(video.videoWidth - half, Math.max(half, aim.x * video.videoWidth));
      const py = Math.min(video.videoHeight - half, Math.max(half, aim.y * video.videoHeight));
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, LOUPE_SIZE / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = "#000";
      ctx.fillRect(cx - LOUPE_SIZE / 2, cy - LOUPE_SIZE / 2, LOUPE_SIZE, LOUPE_SIZE);
      ctx.drawImage(video, px - half, py - half, LOUPE_SOURCE, LOUPE_SOURCE, cx - LOUPE_SIZE / 2, cy - LOUPE_SIZE / 2, LOUPE_SIZE, LOUPE_SIZE);
      ctx.restore();
      // The cross sits where the aim really is inside the source (it moves off-centre near the picture's edge).
      const mx = cx + ((aim.x * video.videoWidth - px) / LOUPE_SOURCE) * LOUPE_SIZE;
      const my = cy + ((aim.y * video.videoHeight - py) / LOUPE_SOURCE) * LOUPE_SIZE;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.arc(cx, cy, LOUPE_SIZE / 2 - 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = accent;
      ctx.beginPath();
      ctx.arc(mx, my, 14, 0, Math.PI * 2);
      ctx.moveTo(mx - 20, my);
      ctx.lineTo(mx + 20, my);
      ctx.moveTo(mx, my - 20);
      ctx.lineTo(mx, my + 20);
      ctx.stroke();
    };
    draw();
    return () => {
      live = false;
      cancelAnimationFrame(raf);
    };
  }, [videoRef, getAim, tone]);

  // A finger that never reports lifting (a system gesture, another app, the screen locking) must not leave the magnifier stuck open.
  useEffect(() => {
    const release = () => { touch.current = null; };
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    return () => {
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", release);
    };
  }, []);
  useEffect(() => {
    if (!active) touch.current = null;
  }, [active]);

  /**
   * Where a touch is on the canvas, in the canvas's own pixels. The touch's client position is the finger. The canvas's place is where the page
   * laid it out inside the control screen (a sum of offsets from that fixed screen, which is drawn at the corner of the display), not its
   * getBoundingClientRect: on an iPhone turned sideways after the page opened, rects and everything else on the screen are reported about a
   * status bar (59 px) lower than they are drawn, so a rect-based touch lands above the finger (read off the phone with the touch check).
   */
  const place = (e: React.PointerEvent<HTMLCanvasElement>) => {
    let el: HTMLElement | null = e.currentTarget;
    let ox = 0, oy = 0;
    while (el && getComputedStyle(el).position !== "fixed") {
      ox += el.offsetLeft;
      oy += el.offsetTop;
      el = el.offsetParent as HTMLElement | null;
    }
    const used = { x: e.clientX - ox, y: e.clientY - oy };
    // For the touch check (hold the status tag): what each way of reading this touch gave.
    const r = e.currentTarget.getBoundingClientRect();
    (window as unknown as { __aimRead?: unknown }).__aimRead = { byRect: e.clientY - r.top, offset: e.nativeEvent.offsetY, used: used.y, rectTop: r.top, h: r.height };
    return used;
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>, commit: boolean) => {
    const video = videoRef.current;
    const t = touch.current;
    if (!video?.videoWidth || !t) return;
    const box = pictureBox(e.currentTarget);
    const p = place(e);
    t.x = p.x;
    t.y = p.y;
    const f = pictureFraction(t.x - box.x, t.y - box.y, { w: box.w, h: box.h }, { w: video.videoWidth, h: video.videoHeight });
    if (f) onAim(f.x, f.y, commit);
  };

  return (
    <canvas
      ref={canvasRef}
      aria-label="The picture. Touch and slide to the front of the rim, then lift."
      className={`absolute inset-0 z-10 h-full w-full touch-none ${active ? "" : "pointer-events-none"}`}
      onPointerDown={(e) => {
        fingers.current.add(e.pointerId);
        if (fingers.current.size === 2 && onSecret) {
          if (secret.current) clearTimeout(secret.current);
          secret.current = setTimeout(() => { if (fingers.current.size === 2) onSecret(); }, 800);
        }
        if (!active) return;
        // A touch that reaches the picture over the control bar (which sits over its bottom edge sideways) is never a rim touch. The bar's
        // height is read as a size, not a position: positions are what drift on an iPhone turned sideways.
        const bar = shieldRef?.current;
        if (bar && getComputedStyle(bar).position === "absolute" && place(e).y >= e.currentTarget.clientHeight - bar.offsetHeight) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        touch.current = { id: e.pointerId, x: 0, y: 0 };
        haptic("tap");
        move(e, false);
      }}
      onPointerMove={(e) => {
        if (touch.current?.id === e.pointerId) move(e, false);
      }}
      onPointerUp={(e) => {
        settle(e.pointerId);
        if (touch.current?.id !== e.pointerId) return;
        move(e, true);
        touch.current = null;
        haptic("tap");
      }}
      onPointerCancel={(e) => {
        settle(e.pointerId);
        touch.current = null;
      }}
      onLostPointerCapture={() => {
        touch.current = null;
      }}
    />
  );
}
