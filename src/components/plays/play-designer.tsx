"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { savePlayEditAction, saveMasterOverrideAction } from "@/app/actions/play-edits";
import { FilmPlayer } from "@/components/plays/film-player";
import { FrameStrip } from "@/components/plays/frame-strip";
import { PlayCourt, type Tool } from "@/components/plays/play-court";
import { PlayerSheet } from "@/components/plays/player-sheet";
import { Toolbar } from "@/components/plays/toolbar";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { FormError, Input, TextArea } from "@/components/ui/field";
import { computeContentBounds } from "@/lib/plays/bounds";
import type { Coverage } from "@/lib/plays/coverage";
import type { Point } from "@/lib/plays/geometry";
import { duplicateFrameAt, nextFrame, removeFrameAt } from "@/lib/plays/frames";
import { formationFrame, type Formation } from "@/lib/plays/formations";
import { mirrorFrames } from "@/lib/plays/mirror";
import { addDefense, addOffense, removeDefense, removeOffense } from "@/lib/plays/roster";
import { DEFENSE_IDS, EXAMPLE_PLAY, OFFENSE_IDS, type DefenseId, type DrawnLine, type Frame, type OffenseId } from "@/lib/plays/types";
import { haptic } from "@/lib/haptics";

const HISTORY_LIMIT = 20;

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
  const [past, setPast] = useState<Frame[][]>([]);
  const [future, setFuture] = useState<Frame[][]>([]);
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
  const [masterConfirmArmed, setMasterConfirmArmed] = useState(false);
  const [masterSaveState, setMasterSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [masterSaveError, setMasterSaveError] = useState<string | null>(null);
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

  /** Snapshots `frames` for Undo before a mutation — call once per user gesture, never inside a loop of continuous updates (a drag records one snapshot at pickup, not one per pointermove tick). */
  function recordHistory() {
    setPast((p) => [...p.slice(-(HISTORY_LIMIT - 1)), frames]);
    setFuture([]);
  }

  function undo() {
    if (!past.length) return;
    haptic("tap");
    const prev = past[past.length - 1];
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [frames, ...f].slice(0, HISTORY_LIMIT));
    setFrames(prev);
    setActiveIndex((i) => Math.min(i, prev.length - 1));
  }

  function redo() {
    if (!future.length) return;
    haptic("tap");
    const next = future[0];
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, frames].slice(-HISTORY_LIMIT));
    setFrames(next);
    setActiveIndex((i) => Math.min(i, next.length - 1));
  }

  function handleDragStateChange(d: { kind: "offense" | "defense"; id: string } | null) {
    if (d && !dragging) recordHistory();
    setDragging(d);
  }

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
    recordHistory();
    updateActive((f) => ({ ...f, lines: [...f.lines, { ...line, id: nextLineId() }] }));
  }

  function eraseLine(id: string) {
    recordHistory();
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
    recordHistory();
    setFrames((fs) => [...fs, nextFrame(fs[fs.length - 1])]);
    setActiveIndex(frames.length);
    setSelected(null);
  }

  function duplicateFrame(index: number) {
    recordHistory();
    setFrames((fs) => duplicateFrameAt(fs, index));
    setActiveIndex(index + 1);
    setSelected(null);
  }

  function deleteFrame(index: number) {
    if (frames.length <= 1) return;
    recordHistory();
    const newLength = frames.length - 1;
    setFrames((fs) => removeFrameAt(fs, index));
    setActiveIndex((i) => Math.min(i > index ? i - 1 : i, newLength - 1));
    setSelected(null);
  }

  function insertFormation(formation: Formation) {
    recordHistory();
    haptic("tap");
    const inserted = formationFrame(formation, frame);
    setFrames((fs) => {
      const next = [...fs];
      next.splice(activeIndex + 1, 0, inserted);
      return next;
    });
    setActiveIndex(activeIndex + 1);
    setSelected(null);
  }

  function flip() {
    haptic("tap");
    recordHistory();
    setFrames((fs) => mirrorFrames(fs));
  }

  function addPlayer(role: "offense" | "defense", id: OffenseId | DefenseId) {
    haptic("tap");
    recordHistory();
    setFrames((fs) => (role === "offense" ? addOffense(fs, id as OffenseId) : addDefense(fs, id as DefenseId)));
  }

  function removePlayer(role: "offense" | "defense", id: OffenseId | DefenseId) {
    haptic("tap");
    recordHistory();
    setFrames((fs) => (role === "offense" ? removeOffense(fs, id as OffenseId) : removeDefense(fs, id as DefenseId)));
    setSelected((s) => (s === id ? null : s));
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

  async function saveMaster() {
    if (!libraryPlayId) return;
    if (!masterConfirmArmed) {
      haptic("tap");
      setMasterConfirmArmed(true);
      return;
    }
    haptic("tap");
    setMasterSaveState("saving");
    setMasterSaveError(null);
    const keys = keysText.split("\n").map((k) => k.trim()).filter(Boolean);
    const result = await saveMasterOverrideAction(teamId, libraryPlayId, { name, vs, about, keys, frames });
    setMasterConfirmArmed(false);
    if (result.error) {
      setMasterSaveState("idle");
      setMasterSaveError(result.error);
      return;
    }
    setMasterSaveState("saved");
    setTimeout(() => setMasterSaveState("idle"), 2000);
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
        <Sheet
          title="Play details"
          onClose={() => {
            setDetailsOpen(false);
            setMasterConfirmArmed(false);
            setMasterSaveError(null);
          }}
          opener={detailsOpener}
        >
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

            <div className="space-y-3 border-t border-line pt-3">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">Roster — up to 5 a side</p>
              <RosterRow label="Offense" ids={OFFENSE_IDS} onCourt={frames[0].offense.map((o) => o.id)} color="offense" onAdd={(id) => addPlayer("offense", id)} onRemove={(id) => removePlayer("offense", id)} />
              <RosterRow label="Defense" ids={DEFENSE_IDS} onCourt={frames[0].defense.map((d) => d.id)} color="defense" onAdd={(id) => addPlayer("defense", id)} onRemove={(id) => removePlayer("defense", id)} />
              <p className="text-[11px] text-foreground-mute">Applies to the whole play, not just this step — tap a player on court to drop him, tap an empty slot to bring him back.</p>
            </div>

            <div className="space-y-2 border-t border-line pt-3">
              <p className="text-[11px] text-foreground-mute">
                Corrects the shared default every team starts from, not just your team&apos;s copy. A team with its own edit to this play keeps it.
              </p>
              {masterConfirmArmed ? (
                <div role="alertdialog" aria-label="Update the master copy for every team?" className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2.5">
                  <p className="text-center text-xs font-semibold text-foreground">Update the master copy for every team?</p>
                  <div className="mt-2 flex gap-2">
                    <Button variant="danger" size="sm" className="flex-1" onClick={saveMaster} disabled={masterSaveState === "saving"}>
                      {masterSaveState === "saving" ? "Updating…" : "Yes, update"}
                    </Button>
                    <Button variant="secondary" size="sm" className="flex-1" onClick={() => setMasterConfirmArmed(false)} disabled={masterSaveState === "saving"}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="secondary" size="sm" block onClick={saveMaster}>
                  {masterSaveState === "saved" ? "Master copy updated" : "Update master copy"}
                </Button>
              )}
              {masterSaveError && <FormError className="mt-1">{masterSaveError}</FormError>}
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
          onDragStateChange={handleDragStateChange}
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
        onDuplicateFrame={duplicateFrame}
        onDeleteFrame={deleteFrame}
        onInsertFormation={insertFormation}
        onPlay={() => setMode("film")}
        onNoteChange={setNote}
      />
      <Toolbar tool={tool} onSelect={setTool} onUndo={undo} onRedo={redo} canUndo={past.length > 0} canRedo={future.length > 0} />

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

const ROSTER_FILL = { offense: "#dc2626", defense: "#17306b" } as const;

function RosterRow<T extends string>({
  label,
  ids,
  onCourt,
  color,
  onAdd,
  onRemove,
}: {
  label: string;
  ids: readonly T[];
  onCourt: T[];
  color: "offense" | "defense";
  onAdd: (id: T) => void;
  onRemove: (id: T) => void;
}) {
  const present = new Set(onCourt);
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-14 shrink-0 text-xs font-bold text-foreground-dim">
        {label} <span className="text-foreground-mute">({onCourt.length}/5)</span>
      </span>
      <div className="flex flex-1 gap-1.5">
        {ids.map((id) => {
          const isOn = present.has(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => (isOn ? onRemove(id) : onAdd(id))}
              aria-label={`${isOn ? "Remove" : "Add"} ${label} ${id.slice(1)}`}
              className={
                isOn
                  ? "flex h-9 w-9 items-center justify-center rounded-full border text-xs font-extrabold transition-colors"
                  : "flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-line-strong text-xs font-extrabold text-foreground-mute transition-colors"
              }
              style={isOn ? { backgroundColor: ROSTER_FILL[color], borderColor: ROSTER_FILL[color], color: color === "defense" ? "#F2B705" : "#fff" } : undefined}
            >
              {id.slice(1)}
            </button>
          );
        })}
      </div>
    </div>
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
