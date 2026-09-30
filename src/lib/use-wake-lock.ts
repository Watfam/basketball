"use client";

import { useEffect, useSyncExternalStore } from "react";
import { NOSLEEP_VIDEO } from "@/lib/nosleep-video";

/**
 * Keeps the phone's screen awake while `active` is true, so it doesn't
 * sleep mid-drill or mid-shooting-session.
 *
 * A web page gets no background execution on iOS: when the screen locks,
 * JavaScript stops, and the camera with it. So the screen has to stay on
 * for as long as something is running. Two methods, in order:
 *
 *   1. The Screen Wake Lock API. Safari 16.4+, Chrome 84+.
 *   2. A silent looping video, which the OS treats as media playing and so
 *      doesn't auto-lock. Used when the API is missing, refused, or can't
 *      be taken back after the OS drops it.
 *
 * What actually happened is recorded in a small store (see
 * getWakeStatus / useWakeStatus) instead of being swallowed, because on a
 * phone there is otherwise no way to tell "never acquired" from "acquired
 * and lost".
 */

export type WakeStatus = {
  mode: "idle" | "wakelock" | "video" | "none";
  /** Why the preferred method wasn't used, when it wasn't. */
  note: string;
};

const IDLE: WakeStatus = { mode: "idle", note: "" };
let status: WakeStatus = IDLE;
const listeners = new Set<() => void>();

function setStatus(next: WakeStatus) {
  if (next.mode === status.mode && next.note === status.note) return;
  status = next;
  listeners.forEach((l) => l());
}

export const getWakeStatus = () => status;

export function describeWake(s: WakeStatus): string {
  switch (s.mode) {
    case "wakelock":
      return "screen kept awake";
    case "video":
      return `screen kept awake by video (${s.note})`;
    case "none":
      return `screen NOT kept awake (${s.note})`;
    default:
      return "screen lock not in use";
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function useWakeStatus(): WakeStatus {
  return useSyncExternalStore(subscribe, getWakeStatus, () => IDLE);
}

export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined") return;

    let sentinel: WakeLockSentinel | null = null;
    let video: HTMLVideoElement | null = null;
    let cancelled = false;

    const startVideo = async (why: string) => {
      if (video || cancelled) return;
      const v = document.createElement("video");
      v.src = NOSLEEP_VIDEO;
      v.muted = true;
      v.loop = true;
      v.setAttribute("playsinline", "");
      v.setAttribute("aria-hidden", "true");
      v.style.cssText =
        "position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0.01;pointer-events:none";
      document.body.appendChild(v);
      try {
        await v.play();
        if (cancelled) {
          v.remove();
          return;
        }
        video = v;
        setStatus({ mode: "video", note: why });
      } catch {
        v.remove();
        if (!cancelled) setStatus({ mode: "none", note: `${why}; the video fallback was also blocked` });
      }
    };

    const acquire = async () => {
      if (!("wakeLock" in navigator)) {
        await startVideo("Wake Lock not supported here");
        return;
      }
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void lock.release().catch(() => {});
          return;
        }
        sentinel = lock;
        // The OS can drop the lock at any time (app switch, low battery).
        // Forgetting it here is what lets the next visible moment take it
        // again; without this the old sentinel looks held forever.
        lock.addEventListener("release", () => {
          if (sentinel === lock) sentinel = null;
          if (!cancelled && document.visibilityState === "visible") void acquire();
        });
        setStatus({ mode: "wakelock", note: "" });
      } catch (e) {
        const reason = e instanceof DOMException ? e.name : "error";
        await startVideo(`Wake Lock refused: ${reason}`);
      }
    };

    void acquire();

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (video?.paused) void video.play().catch(() => {});
      if (!sentinel && !video) void acquire();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void sentinel?.release().catch(() => {});
      sentinel = null;
      video?.remove();
      video = null;
      setStatus(IDLE);
    };
  }, [active]);
}
