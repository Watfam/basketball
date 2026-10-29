"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { savePlayEditAction } from "@/app/actions/play-edits";
import { FilmPlayer } from "@/components/plays/film-player";
import { FrameStrip } from "@/components/plays/frame-strip";
import { PlayCourt, type Tool } from "@/components/plays/play-court";
import { PlayerSheet } from "@/components/plays/player-sheet";
import { Toolbar } from "@/components/plays/toolbar";
import { Sheet } from "@/components/ui/sheet";
import { FormError, Input, TextArea } from "@/components/ui/field";
import { computeContentBounds } from "@/lib/plays/bounds";
import type { Coverage } from "@/lib/plays/coverage";
import type { Point } from "@/lib/plays/geometry";
import { nextFrame } from "@/lib/plays/frames";
import { mirrorFrames } from "@/lib/plays/mirror";
import { EXAMPLE_PLAY, type DefenseId, type DrawnLine, type Frame, type OffenseId } from "@/lib/plays/types";
import { haptic } from "@/lib/haptics";

let lineSeq = 0;
function nextLineId() {
  lineSeq += 1;
  return `line-${lineSeq}`;
}

export function PlayDesigner({
  teamId,
  libraryPlayId,
  initialFrames,
  initialPlayName,
  initialVs,
  initialAbout,
  initialKeys,
}: {
  teamId: string;
  /** Present only when this is a known library play (opened via ?lib=) — unlocks Details and Save, since there is somewhere to save an edit to. A blank new play has nothing to attach an edit to. */
  libraryPlayId?: string;
  initialFrames?: Frame[];
  initialPlayName?: string;
  initialVs?: string;
  initialAbout?: string;
  initialKeys?: string[];
}) {
  const [frames, setFrames] = useState(initialFrames ?? EXAMPLE_PLAY);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mode, setMode] = useState<"edit" | "film">("edit");
  const [tool, setTool] = useState<Tool>("move");
  const [selected, setSelected] = useState<OffenseId | DefenseId | null>(null);
  const [dragging, setDragging] = useState<{ kind: "offense" | "defense"; id: string } | null>(null);
  const [name, setName] = useState(initialPlayName ?? "New Play");
  const [vs, setVs] = useState(initialVs ?? "");
  const [about, setAbout] = useState(initialAbout ?? "");
  const [keysText, setKeysText] = useState((initialKeys ?? []).join("\n"));
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsOpener, setDetailsOpener] = useState<HTMLElement | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  // Fits the view to wherever the play actually happens across every frame — most plays use a
  // fraction of the floor, and a full-court view would shrink that action down to a corner of the
  // screen. A coach can still back out to the real full court to check spacing against the whole
  // floor.
  const [fitToPlay, setFitToPlay] = useState(true);
  const region = fitToPlay ? computeContentBounds(frames) : undefined;

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

  function flip() {
    haptic("tap");
    setFrames((fs) => mirrorFrames(fs));
  }

  async function save() {
    if (!libraryPlayId) return;
    haptic("tap");
    setSaveState("saving");
    setSaveError(null);
    const keys = keysText.split("\n").map((k) => k.trim()).filter(Boolean);
    const result = await savePlayEditAction(teamId, libraryPlayId, { name, vs, about, keys, frames });
    if (result.error) {
      setSaveState("idle");
      setSaveError(result.error);
      return;
    }
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 2000);
  }

  if (mode === "film") {
    return <FilmPlayer frames={frames} onExit={() => setMode("edit")} region={region} onFlip={flip} />;
  }

  return (
    <div className="fixed inset-0 z-0 flex flex-col overflow-hidden bg-background text-foreground">
      <div className="shrink-0 border-b border-line bg-surface/80 px-4 pb-2 pt-[max(0.6rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <Link href={`/teams/${teamId}/plays/playbook`} className="text-sm font-bold text-foreground-dim hover:text-foreground">
            ← Playbook
          </Link>
          {libraryPlayId && (
            <button
              type="button"
              onClick={save}
              disabled={saveState === "saving"}
              className="rounded-full bg-accent px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-on-accent disabled:opacity-60"
            >
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save"}
            </button>
          )}
        </div>
        {saveError && <FormError className="mt-1">{saveError}</FormError>}
        <div className="mt-1 flex items-center justify-between gap-3">
          {libraryPlayId ? (
            <button
              type="button"
              onClick={(e) => {
                haptic("tap");
                setDetailsOpener(e.currentTarget);
                setDetailsOpen(true);
              }}
              className="flex min-w-0 items-center gap-1.5 text-left"
            >
              <span className="truncate text-[15px] font-bold text-foreground">{name}</span>
              <PencilIcon className="h-3 w-3 shrink-0 text-foreground-mute" />
            </button>
          ) : (
            <h1 className="truncate text-[15px] font-bold text-foreground">{name}</h1>
          )}
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                haptic("tap");
                setFitToPlay((f) => !f);
              }}
              className="flex items-center gap-1 rounded-full border border-line-strong px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-foreground-dim hover:border-accent hover:text-accent"
            >
              <CropIcon className="h-3 w-3" />
              {fitToPlay ? "Full court" : "Fit to play"}
            </button>
            <button
              type="button"
              onClick={flip}
              aria-label="Flip to the other side of the court"
              className="flex items-center gap-1 rounded-full border border-line-strong px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-foreground-dim hover:border-accent hover:text-accent"
            >
              <FlipIcon className="h-3 w-3" />
              Flip
            </button>
          </div>
        </div>
      </div>

      {detailsOpen && (
        <Sheet title="Play details" onClose={() => setDetailsOpen(false)} opener={detailsOpener}>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Play name" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">Situation (shown as the card subtitle)</label>
              <Input value={vs} onChange={(e) => setVs(e.target.value)} placeholder="vs Man, vs 2-3 Zone, Baseline OB…" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">What it is for</label>
              <TextArea value={about} onChange={(e) => setAbout(e.target.value)} rows={3} placeholder="One or two sentences a player reads first." />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">Coaching points — one per line</label>
              <TextArea value={keysText} onChange={(e) => setKeysText(e.target.value)} rows={5} placeholder={"Screener: hold until contact.\nCutter: set up the defender first."} />
            </div>
          </div>
        </Sheet>
      )}

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
          region={region}
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

function CropIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M18 22V8a2 2 0 0 0-2-2H2" />
    </svg>
  );
}

function FlipIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 3 4 7l4 4" />
      <path d="M4 7h11a5 5 0 0 1 5 5" />
      <path d="M16 21l4-4-4-4" />
      <path d="M20 17H9a5 5 0 0 1-5-5" />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}
