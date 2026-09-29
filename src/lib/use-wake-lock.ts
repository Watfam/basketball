"use client";

import { useEffect } from "react";

/**
 * Holds a screen wake lock while `active` is true, so the phone doesn't
 * sleep mid-drill.
 *
 * This is the piece that makes a practice timer actually work on a phone
 * sitting on the scorer's table. A web page gets no background execution
 * on iOS — lock the screen and JavaScript stops, timers included. Rather
 * than pretend to run in the background, keep the screen awake for as
 * long as a timer is running.
 *
 * Wake Lock is Safari 16.4+ / Chrome 84+. Where it's missing, or the OS
 * refuses (low battery), this degrades to nothing — the timer is still
 * correct on return because it's computed from a deadline, not ticked.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void lock.release().catch(() => {});
          return;
        }
        sentinel = lock;
      } catch {
        // Denied, low battery, or not permitted in this context. The
        // countdown stays correct either way, so there's nothing to do.
      }
    };

    void acquire();

    // The browser drops a wake lock whenever the page is hidden — coming
    // back from the app switcher has to take it again or the screen
    // starts sleeping mid-practice.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && !sentinel) void acquire();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [active]);
}
