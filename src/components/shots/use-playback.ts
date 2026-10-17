"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Time for the shot player: plays the observed moments at their real spacing (or half speed), pauses, scrubs and steps. It starts on the last
 * moment so the whole path is visible, and "Play" runs it from the start. No timers run while paused.
 */
export function usePlayback(start: number, end: number, initial: "end" | "start" = "end") {
  const [t, setT] = useState(initial === "end" ? end : start);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 0.5>(0.5);
  const raf = useRef<number | null>(null);
  const last = useRef(0);

  useEffect(() => {
    if (!playing) return;
    last.current = performance.now();
    const tick = (now: number) => {
      const dt = now - last.current; last.current = now;
      let done = false;
      setT((cur) => { const n = cur + dt * speed; if (n >= end) { done = true; return end; } return n; });
      if (done) setPlaying(false); else raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current !== null) cancelAnimationFrame(raf.current); };
  }, [playing, speed, end]);

  const play = useCallback(() => { setT((cur) => (cur >= end - 1 ? start : cur)); setPlaying((p) => !p); }, [start, end]);
  const seek = useCallback((v: number) => { setPlaying(false); setT(Math.min(end, Math.max(start, v))); }, [start, end]);
  return { t, playing, speed, setSpeed, play, seek, pause: () => setPlaying(false) };
}
