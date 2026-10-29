"use client";

import { useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";
import { FORMATIONS, type Formation } from "@/lib/plays/formations";
import type { Frame } from "@/lib/plays/types";

export function FrameStrip({
  frames,
  activeIndex,
  onSelect,
  onAddFrame,
  onDuplicateFrame,
  onDeleteFrame,
  onInsertFormation,
  onPlay,
  onNoteChange,
}: {
  frames: Frame[];
  activeIndex: number;
  onSelect: (i: number) => void;
  onAddFrame: () => void;
  onDuplicateFrame: (i: number) => void;
  onDeleteFrame: (i: number) => void;
  onInsertFormation: (formation: Formation) => void;
  onPlay: () => void;
  onNoteChange: (note: string) => void;
}) {
  const active = frames[activeIndex];
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [formationsOpen, setFormationsOpen] = useState(false);
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Keeps the active step reachable without hunting for it — a play with many steps scrolls the rail
  // past where you'd expect otherwise, especially right after Add/Duplicate picks a new far-right step.
  useEffect(() => {
    chipRefs.current[activeIndex]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeIndex]);

  return (
    <div className="relative shrink-0 border-t border-line bg-background/95 px-3 pt-2 backdrop-blur">
      <input
        value={active?.note ?? ""}
        onChange={(e) => onNoteChange(e.target.value)}
        placeholder="Coaching note for this frame…"
        className="mb-2 w-full rounded-lg border border-line bg-raised px-3 py-1.5 text-sm text-foreground placeholder:text-foreground-mute focus:border-accent focus:outline-none"
      />
      <div className="flex items-center gap-1.5 pb-2">
        {/* Only the growing list of steps scrolls — Add, Formations and Play stay put so they're
            always reachable without scrolling all the way across a long play. */}
        <div className="rail flex flex-1 gap-1.5 overflow-x-auto py-0.5">
          {frames.map((_, i) => (
            <div key={i} className="relative shrink-0">
              <button
                ref={(el) => {
                  chipRefs.current[i] = el;
                }}
                type="button"
                onClick={() => {
                  haptic("tap");
                  onSelect(i);
                  setMenuFor(null);
                }}
                aria-current={i === activeIndex ? "true" : undefined}
                className={`flex h-11 w-11 items-center justify-center rounded-lg border text-sm font-extrabold ${
                  i === activeIndex ? "border-accent bg-accent/10 text-accent" : "border-line bg-surface text-foreground-dim"
                }`}
              >
                {i + 1}
              </button>
              <button
                type="button"
                onClick={() => {
                  haptic("tap");
                  setFormationsOpen(false);
                  setMenuFor((m) => (m === i ? null : i));
                }}
                aria-label={`Step ${i + 1} options`}
                className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-line-strong bg-surface text-[9px] leading-none text-foreground-mute"
              >
                ⋯
              </button>
            </div>
          ))}
        </div>
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
        <button
          type="button"
          onClick={() => {
            haptic("tap");
            setMenuFor(null);
            setFormationsOpen((o) => !o);
          }}
          aria-label="Insert formation"
          title="Insert formation"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-dashed border-line-strong text-foreground-mute"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
            <circle cx="6" cy="18" r="2" />
            <circle cx="12" cy="7" r="2" />
            <circle cx="18" cy="18" r="2" />
          </svg>
        </button>
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

      {/* Rendered here, outside the horizontally-scrolling rail above: that row's overflow-x-auto forces
          overflow-y to clip too, so a popover anchored inside it would never actually be visible. */}
      {menuFor !== null && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />
          <div className="absolute bottom-full left-3 z-20 mb-2 w-36 rounded-lg border border-line bg-surface p-1 shadow-lg">
            <p className="px-2.5 pb-1 pt-1 text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute">Step {menuFor + 1}</p>
            <button
              type="button"
              onClick={() => {
                haptic("tap");
                onDuplicateFrame(menuFor);
                setMenuFor(null);
              }}
              className="block w-full rounded-md px-2.5 py-1.5 text-left text-xs font-bold text-foreground hover:bg-raised"
            >
              Duplicate
            </button>
            <button
              type="button"
              disabled={frames.length <= 1}
              onClick={() => {
                haptic("tap");
                onDeleteFrame(menuFor);
                setMenuFor(null);
              }}
              className="block w-full rounded-md px-2.5 py-1.5 text-left text-xs font-bold text-danger hover:bg-danger/10 disabled:opacity-40"
            >
              Delete
            </button>
          </div>
        </>
      )}

      {formationsOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setFormationsOpen(false)} />
          <div className="absolute bottom-full right-3 z-20 mb-2 w-48 rounded-lg border border-line bg-surface p-1 shadow-lg">
            <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute">Offense</p>
            {FORMATIONS.filter((f) => f.category === "offense").map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  haptic("tap");
                  onInsertFormation(f);
                  setFormationsOpen(false);
                }}
                className="block w-full rounded-md px-2.5 py-1.5 text-left text-xs font-bold text-foreground hover:bg-raised"
              >
                {f.name}
              </button>
            ))}
            <p className="px-2.5 pb-1 pt-2 text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute">Defense</p>
            {FORMATIONS.filter((f) => f.category === "defense").map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  haptic("tap");
                  onInsertFormation(f);
                  setFormationsOpen(false);
                }}
                className="block w-full rounded-md px-2.5 py-1.5 text-left text-xs font-bold text-foreground hover:bg-raised"
              >
                {f.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
