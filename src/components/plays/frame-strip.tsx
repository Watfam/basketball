"use client";

import { haptic } from "@/lib/haptics";
import type { Frame } from "@/lib/plays/types";

export function FrameStrip({
  frames,
  activeIndex,
  onSelect,
  onAddFrame,
  onPlay,
  onNoteChange,
}: {
  frames: Frame[];
  activeIndex: number;
  onSelect: (i: number) => void;
  onAddFrame: () => void;
  onPlay: () => void;
  onNoteChange: (note: string) => void;
}) {
  const active = frames[activeIndex];

  return (
    <div className="shrink-0 border-t border-line bg-background/95 px-3 pt-2 backdrop-blur">
      <input
        value={active?.note ?? ""}
        onChange={(e) => onNoteChange(e.target.value)}
        placeholder="Coaching note for this frame…"
        className="mb-2 w-full rounded-lg border border-line bg-raised px-3 py-1.5 text-sm text-foreground placeholder:text-foreground-mute focus:border-accent focus:outline-none"
      />
      <div className="flex items-center gap-2 pb-2">
        <div className="rail flex flex-1 gap-1.5 overflow-x-auto">
          {frames.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                haptic("tap");
                onSelect(i);
              }}
              aria-current={i === activeIndex ? "true" : undefined}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border text-sm font-extrabold ${
                i === activeIndex ? "border-accent bg-accent/10 text-accent" : "border-line bg-surface text-foreground-dim"
              }`}
            >
              {i + 1}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              haptic("tap");
              onAddFrame();
            }}
            aria-label="Add frame"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-dashed border-line-strong text-lg font-extrabold text-foreground-mute"
          >
            +
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            haptic("tap");
            onPlay();
          }}
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-4 text-xs font-extrabold uppercase tracking-wide text-on-accent"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden><path d="M6 4 20 12 6 20Z" /></svg>
          Play
        </button>
      </div>
    </div>
  );
}
