"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FilmPlayer } from "@/components/plays/film-player";
import { FrameStrip } from "@/components/plays/frame-strip";
import { PlayCourt, type Tool } from "@/components/plays/play-court";
import { PlayerSheet } from "@/components/plays/player-sheet";
import { Toolbar } from "@/components/plays/toolbar";
import type { Coverage } from "@/lib/plays/coverage";
import type { Point } from "@/lib/plays/geometry";
import { nextFrame } from "@/lib/plays/frames";
import { EXAMPLE_PLAY, type DefenseId, type DrawnLine, type Frame, type OffenseId } from "@/lib/plays/types";

let lineSeq = 0;
function nextLineId() {
  lineSeq += 1;
  return `line-${lineSeq}`;
}

export function PlayDesigner({
  teamId,
  teamName,
  initialFrames,
  initialPlayName,
}: {
  teamId: string;
  teamName: string;
  initialFrames?: Frame[];
  initialPlayName?: string;
}) {
  const [frames, setFrames] = useState(initialFrames ?? EXAMPLE_PLAY);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mode, setMode] = useState<"edit" | "film">("edit");
  const [tool, setTool] = useState<Tool>("move");
  const [selected, setSelected] = useState<OffenseId | DefenseId | null>(null);
  const [dragging, setDragging] = useState<{ kind: "offense" | "defense"; id: string } | null>(null);

  const frame = frames[activeIndex];

  // The whole point of design mode: every touch on the court means move or
  // draw, never scroll the page underneath it.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function updateActive(fn: (f: typeof frame) => typeof frame) {
    setFrames((fs) => fs.map((f, i) => (i === activeIndex ? fn(f) : f)));
  }

  function movePlayer(id: OffenseId | DefenseId, pos: Point) {
    updateActive((f) => {
      if (id.startsWith("O")) {
        return { ...f, offense: f.offense.map((o) => (o.id === id ? { ...o, pos } : o)) };
      }
      return { ...f, defense: f.defense.map((d) => (d.id === id ? { ...d, coverage: "manual" as const, manualPos: pos } : d)) };
    });
  }

  function addLine(line: Omit<DrawnLine, "id">) {
    updateActive((f) => ({ ...f, lines: [...f.lines, { ...line, id: nextLineId() }] }));
  }

  function eraseLine(id: string) {
    updateActive((f) => ({ ...f, lines: f.lines.filter((l) => l.id !== id) }));
  }

  function setCoverage(id: DefenseId, coverage: Coverage) {
    updateActive((f) => ({ ...f, defense: f.defense.map((d) => (d.id === id ? { ...d, coverage } : d)) }));
  }

  function setMan(id: DefenseId, man: OffenseId) {
    updateActive((f) => ({ ...f, defense: f.defense.map((d) => (d.id === id ? { ...d, man } : d)) }));
  }

  function giveBall(id: OffenseId) {
    updateActive((f) => ({ ...f, ballHolder: id }));
  }

  function setNote(note: string) {
    updateActive((f) => ({ ...f, note }));
  }

  function addFrame() {
    setFrames((fs) => [...fs, nextFrame(fs[fs.length - 1])]);
    setActiveIndex(frames.length);
    setSelected(null);
  }

  if (mode === "film") {
    return <FilmPlayer frames={frames} onExit={() => setMode("edit")} />;
  }

  return (
    <div className="theme-dark fixed inset-0 z-0 flex flex-col overflow-hidden bg-background text-foreground">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-surface/80 px-4 pb-2 pt-[max(0.6rem,env(safe-area-inset-top))] backdrop-blur">
        <Link href={`/teams/${teamId}`} className="text-sm font-bold text-foreground-dim hover:text-foreground">
          ← {teamName}
        </Link>
        <span className="truncate px-2 text-[11px] font-extrabold uppercase tracking-[0.1em] text-foreground-mute">
          {initialPlayName ?? "Lightning Play Designer"}
        </span>
        <Link href={`/teams/${teamId}/plays/playbook`} className="shrink-0 text-xs font-extrabold uppercase tracking-wide text-accent hover:text-accent-hover">
          Playbook
        </Link>
      </div>

      <div className="relative min-h-0 flex-1">
        <PlayCourt
          frame={frame}
          tool={tool}
          dragging={dragging}
          onTapPlayer={setSelected}
          onMovePlayer={movePlayer}
          onDragStateChange={setDragging}
          onAddLine={addLine}
          onEraseLine={eraseLine}
        />
      </div>

      <FrameStrip
        frames={frames}
        activeIndex={activeIndex}
        onSelect={(i) => {
          setActiveIndex(i);
          setSelected(null);
        }}
        onAddFrame={addFrame}
        onPlay={() => setMode("film")}
        onNoteChange={setNote}
      />
      <Toolbar tool={tool} onSelect={setTool} />

      {selected && (
        <PlayerSheet
          frame={frame}
          selected={selected}
          opener={null}
          onClose={() => setSelected(null)}
          onSetCoverage={setCoverage}
          onSetMan={setMan}
          onGiveBall={giveBall}
        />
      )}
    </div>
  );
}
