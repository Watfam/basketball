"use client";

import { PlayCourt } from "@/components/plays/play-court";
import { haptic } from "@/lib/haptics";
import type { Region } from "@/lib/plays/bounds";
import { SPEEDS, usePlayClock } from "@/lib/plays/use-play-clock";
import type { Frame } from "@/lib/plays/types";

export function FilmPlayer({
  frames,
  onExit,
  region,
  onFlip,
}: {
  frames: Frame[];
  onExit: () => void;
  region?: Region;
  /** Mirrors the play left-right across the court — present only when the caller owns the frame data to flip. */
  onFlip?: () => void;
}) {
  const { clock, shown, ballOverride, fromFrame, playing, speed, setSpeed, togglePlay, scrub, fraction } = usePlayClock(frames, { autoplay: true });

  return (
    <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-background text-foreground">
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-[max(0.6rem,env(safe-area-inset-top))]">
        <button type="button" onClick={() => { haptic("tap"); onExit(); }} className="text-sm font-bold text-foreground-dim hover:text-foreground">
          ✕ Done
        </button>
        <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-foreground-mute">
          Frame {clock.frameIndex + 1} of {frames.length}
        </span>
        {onFlip ? (
          <button
            type="button"
            onClick={() => { haptic("tap"); onFlip(); }}
            aria-label="Flip to the other side of the court"
            className="flex items-center gap-1 rounded-full border border-line-strong px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-foreground-dim hover:border-accent hover:text-accent"
          >
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M8 3 4 7l4 4" />
              <path d="M4 7h11a5 5 0 0 1 5 5" />
              <path d="M16 21l4-4-4-4" />
              <path d="M20 17H9a5 5 0 0 1-5-5" />
            </svg>
            Flip
          </button>
        ) : (
          <span className="w-[52px]" />
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        <PlayCourt
          frame={shown}
          tool="move"
          dragging={null}
          onTapPlayer={() => {}}
          onMovePlayer={() => {}}
          onDragStateChange={() => {}}
          onAddLine={() => {}}
          onEraseLine={() => {}}
          ballOverride={ballOverride}
          interactive={false}
          region={region}
          linesVisible={clock.phase === "hold"}
        />
      </div>

      <div className="shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {fromFrame.note && <p className="mb-3 text-center text-sm leading-relaxed text-foreground-dim">{fromFrame.note}</p>}

        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(fraction * 1000)}
          onChange={(e) => scrub(Number(e.target.value) / 1000)}
          aria-label="Scrub through the play"
          className="w-full accent-accent"
        />

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex gap-1.5">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { haptic("tap"); setSpeed(s); }}
                className={`min-h-9 rounded-lg border px-2.5 text-xs font-extrabold ${
                  speed === s ? "border-accent bg-accent/10 text-accent" : "border-line bg-surface text-foreground-dim"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => { haptic("tap"); togglePlay(); }}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-on-accent"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><rect x="5" y="4" width="5" height="16" /><rect x="14" y="4" width="5" height="16" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M6 4 20 12 6 20Z" /></svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
