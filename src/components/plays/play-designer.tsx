"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PlayCourt, type Tool } from "@/components/plays/play-court";
import { PlayerSheet } from "@/components/plays/player-sheet";
import { Toolbar } from "@/components/plays/toolbar";
import type { Coverage } from "@/lib/plays/coverage";
import type { Point } from "@/lib/plays/geometry";
import { EXAMPLE_FRAME, type DefenseId, type DrawnLine, type Frame, type OffenseId } from "@/lib/plays/types";

let lineSeq = 0;
function nextLineId() {
  lineSeq += 1;
  return `line-${lineSeq}`;
}

export function PlayDesigner({ teamId, teamName }: { teamId: string; teamName: string }) {
  const [frame, setFrame] = useState<Frame>(EXAMPLE_FRAME);
  const [tool, setTool] = useState<Tool>("move");
  const [selected, setSelected] = useState<OffenseId | DefenseId | null>(null);
  const [dragging, setDragging] = useState<{ kind: "offense" | "defense"; id: string } | null>(null);

  // The whole point of design mode: every touch on the court means move or
  // draw, never scroll the page underneath it.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function movePlayer(id: OffenseId | DefenseId, pos: Point) {
    setFrame((f) => {
      if (id.startsWith("O")) {
        return { ...f, offense: f.offense.map((o) => (o.id === id ? { ...o, pos } : o)) };
      }
      return { ...f, defense: f.defense.map((d) => (d.id === id ? { ...d, coverage: "manual" as const, manualPos: pos } : d)) };
    });
  }

  function addLine(line: Omit<DrawnLine, "id">) {
    setFrame((f) => ({ ...f, lines: [...f.lines, { ...line, id: nextLineId() }] }));
  }

  function eraseLine(id: string) {
    setFrame((f) => ({ ...f, lines: f.lines.filter((l) => l.id !== id) }));
  }

  function setCoverage(id: DefenseId, coverage: Coverage) {
    setFrame((f) => ({ ...f, defense: f.defense.map((d) => (d.id === id ? { ...d, coverage } : d)) }));
  }

  function setMan(id: DefenseId, man: OffenseId) {
    setFrame((f) => ({ ...f, defense: f.defense.map((d) => (d.id === id ? { ...d, man } : d)) }));
  }

  function giveBall(id: OffenseId) {
    setFrame((f) => ({ ...f, ballHolder: id }));
  }

  return (
    <div className="theme-dark fixed inset-0 z-0 flex flex-col overflow-hidden bg-background text-foreground">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-surface/80 px-4 pb-2 pt-[max(0.6rem,env(safe-area-inset-top))] backdrop-blur">
        <Link href={`/teams/${teamId}`} className="text-sm font-bold text-foreground-dim hover:text-foreground">
          ← {teamName}
        </Link>
        <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-foreground-mute">Lightning Play Designer</span>
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
