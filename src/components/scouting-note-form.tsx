"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveScoutingNote, deleteScoutingNote } from "@/app/actions";
import { haptic } from "@/lib/haptics";
import { Button, buttonClass } from "@/components/ui/button";
import { ConfirmDelete } from "@/components/ui/confirm-delete";
import { FormError, Input, TextArea } from "@/components/ui/field";
import { PlayThumbnail } from "@/components/plays/play-thumbnail";
import {
  SCOUT_SECTIONS,
  parseScoutingNotes,
  serializeScoutingNotes,
  type ScoutDoc,
  type ScoutPlayer,
  type ScoutSectionDef,
} from "@/lib/scouting/report";

type ExistingNote = {
  id: string;
  opponent_name: string;
  notes: unknown;
};

const labelClass = "text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent";
const cardClass = "panel-lit rounded-3xl border border-line bg-surface p-5";

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Everything the coach types, without the diagrams (those are saved from the designer, not from here). */
function editable(doc: ScoutDoc) {
  const { diagrams: _diagrams, ...rest } = doc; // eslint-disable-line @typescript-eslint/no-unused-vars
  return rest;
}

/**
 * A scouting report written section by section, the way the film gets watched: tip, their
 * defense (half court and press), their offense, baseline and sideline out-of-bounds, then the
 * players that matter. Every section that can be shown on a court has its own "Draw diagram".
 * "Generate report" turns whatever is here into a printable PDF.
 */
export function ScoutingNoteForm({ teamId, existing }: { teamId: string; existing?: ExistingNote }) {
  const router = useRouter();
  const savedDoc = parseScoutingNotes(existing?.notes);
  const [opponentName, setOpponentName] = useState(existing?.opponent_name ?? "");
  const [doc, setDoc] = useState(() => editable(savedDoc));
  const [snapshot, setSnapshot] = useState(() => JSON.stringify([existing?.opponent_name ?? "", editable(savedDoc)]));
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const [deleting, startDeleteTransition] = useTransition();
  const [busyAction, setBusyAction] = useState<"report" | "diagram" | null>(null);

  const dirty = JSON.stringify([opponentName, doc]) !== snapshot;
  const diagrams = savedDoc.diagrams;

  function setSection(key: ScoutSectionDef["key"], value: string) {
    setJustSaved(false);
    setDoc((d) => ({ ...d, sections: { ...d.sections, [key]: value } }));
  }

  function patch(p: Partial<Omit<ScoutDoc, "sections" | "players" | "diagrams">>) {
    setJustSaved(false);
    setDoc((d) => ({ ...d, ...p }));
  }

  function setPlayers(fn: (p: ScoutPlayer[]) => ScoutPlayer[]) {
    setJustSaved(false);
    setDoc((d) => ({ ...d, players: fn(d.players) }));
  }

  /** Writes the note, returning its id — what Draw diagram and Generate report need before they can send the coach anywhere. */
  async function persist(): Promise<{ noteId: string } | { error: string }> {
    if (!opponentName.trim()) return { error: "Name the opponent." };
    const result = await saveScoutingNote(teamId, existing?.id ?? null, {
      opponentName,
      notes: serializeScoutingNotes({ ...doc, diagrams: [] }),
    });
    if (result?.error || !result.noteId) return { error: result?.error ?? "Could not save." };
    setSnapshot(JSON.stringify([opponentName, doc]));
    return { noteId: result.noteId };
  }

  function save() {
    haptic("tap");
    setError(null);
    startTransition(async () => {
      const result = await persist();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      haptic("success");
      if (!existing) {
        router.replace(`/teams/${teamId}/scouting/${result.noteId}`);
        return;
      }
      setJustSaved(true);
      router.refresh();
    });
  }

  async function drawDiagram(section: ScoutSectionDef["key"]) {
    haptic("tap");
    setError(null);
    setBusyAction("diagram");
    let noteId = existing?.id;
    if (!existing || dirty) {
      const result = await persist();
      if ("error" in result) {
        setBusyAction(null);
        setError(result.error);
        return;
      }
      noteId = result.noteId;
    }
    router.push(`/teams/${teamId}/scouting/${noteId}/diagram/${newId()}?section=${section}`);
  }

  async function generateReport() {
    haptic("tap");
    setError(null);
    // Opened before the save finishes — a tab opened after an await is blocked as a popup on iOS.
    const tab = window.open("", "_blank");
    setBusyAction("report");
    let noteId = existing?.id;
    if (!existing || dirty) {
      const result = await persist();
      if ("error" in result) {
        tab?.close();
        setBusyAction(null);
        setError(result.error);
        return;
      }
      noteId = result.noteId;
      setJustSaved(true);
    }
    const url = `/api/scouting-pdf?teamId=${teamId}&noteId=${noteId}`;
    if (tab) tab.location.href = url;
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a PDF file route, not a page
    else window.location.href = url;
    setBusyAction(null);
    if (!existing) router.replace(`/teams/${teamId}/scouting/${noteId}`);
    else router.refresh();
  }

  function remove() {
    if (!existing) return;
    haptic("tap");
    startDeleteTransition(async () => {
      const result = await deleteScoutingNote(existing.id, teamId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.push(`/teams/${teamId}/scouting`);
    });
  }

  function renderSection(s: ScoutSectionDef) {
    const own = diagrams.filter((d) => d.section === s.key);
    return (
      <section key={s.key} className={cardClass}>
        <p className={labelClass}>{s.label}</p>
        <TextArea
          value={doc.sections[s.key]}
          onChange={(e) => setSection(s.key, e.target.value)}
          rows={s.key === "personnel" || s.key === "tendencies" ? 3 : 5}
          placeholder={s.placeholder}
          className="mt-2.5"
        />
        {s.diagram && (
          <div className="mt-3">
            {own.length > 0 && (
              <ul className="mb-2.5 grid grid-cols-2 gap-2.5">
                {own.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/teams/${teamId}/scouting/${existing?.id}/diagram/${d.id}`}
                      className="block overflow-hidden rounded-xl border border-line bg-raised hover:border-accent"
                    >
                      <div className="aspect-[4/3] w-full overflow-hidden bg-background">
                        <PlayThumbnail frames={d.frames} />
                      </div>
                      <p className="truncate px-2.5 py-1.5 text-xs font-bold text-foreground">{d.title}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Button variant="secondary" size="sm" onClick={() => drawDiagram(s.key)} disabled={busyAction !== null}>
              {busyAction === "diagram" ? "Opening…" : own.length ? "+ Add another diagram" : `+ Draw diagram`}
            </Button>
          </div>
        )}
      </section>
    );
  }

  const beforePlayers = SCOUT_SECTIONS.slice(0, SCOUT_SECTIONS.findIndex((s) => s.key === "personnel") + 1);
  const afterPlayers = SCOUT_SECTIONS.slice(beforePlayers.length);

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 pb-28">
      <section className={cardClass}>
        <p className={labelClass}>Opponent</p>
        <input
          value={opponentName}
          onChange={(e) => {
            setJustSaved(false);
            setOpponentName(e.target.value);
          }}
          placeholder="Central Valley"
          className="font-display mt-2 w-full border-b border-line bg-transparent pb-2 text-2xl uppercase text-foreground placeholder:text-foreground-mute focus:border-accent focus:outline-none"
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-[11rem_1fr]">
          <label className="block space-y-1">
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">Game date</span>
            <Input type="date" value={doc.gameDate} onChange={(e) => patch({ gameDate: e.target.value })} />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">In one line</span>
            <Input value={doc.headline} onChange={(e) => patch({ headline: e.target.value })} placeholder="Presses full court, lives on the ball screen" />
          </label>
        </div>
      </section>

      {beforePlayers.map(renderSection)}

      <section className={cardClass}>
        <div className="flex items-center justify-between gap-3">
          <p className={labelClass}>Players to know</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              haptic("tap");
              setPlayers((p) => [...p, { id: newId(), number: "", name: "", label: "", tendencies: "", plan: "" }]);
            }}
          >
            + Add player
          </Button>
        </div>
        {doc.players.length === 0 && <p className="mt-2 text-xs text-foreground-mute">Each player added here gets a card on the front page of the report.</p>}
        <div className="mt-3 space-y-3">
          {doc.players.map((p, i) => (
            <div key={p.id} className="rounded-2xl border border-line bg-raised p-3.5">
              <div className="grid grid-cols-[4.5rem_1fr] gap-2.5">
                <label className="block space-y-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute">No.</span>
                  <Input
                    inputMode="numeric"
                    value={p.number}
                    onChange={(e) => setPlayers((all) => all.map((x, j) => (j === i ? { ...x, number: e.target.value } : x)))}
                    placeholder="2"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute">Name (if you know it)</span>
                  <Input value={p.name} onChange={(e) => setPlayers((all) => all.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                </label>
              </div>
              <label className="mt-2.5 block space-y-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute">Role in a few words</span>
                <Input value={p.label} onChange={(e) => setPlayers((all) => all.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Best player" />
              </label>
              <label className="mt-2.5 block space-y-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute">What he does</span>
                <TextArea
                  rows={3}
                  value={p.tendencies}
                  onChange={(e) => setPlayers((all) => all.map((x, j) => (j === i ? { ...x, tendencies: e.target.value } : x)))}
                  placeholder="Wants to drive, shoots the 3 if left open"
                />
              </label>
              <label className="mt-2.5 block space-y-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute">How we guard him</span>
                <TextArea rows={2} value={p.plan} onChange={(e) => setPlayers((all) => all.map((x, j) => (j === i ? { ...x, plan: e.target.value } : x)))} />
              </label>
              <button
                type="button"
                onClick={() => {
                  haptic("tap");
                  setPlayers((all) => all.filter((_, j) => j !== i));
                }}
                className="mt-2 text-xs font-bold text-foreground-mute hover:text-danger"
              >
                Remove this player
              </button>
            </div>
          ))}
        </div>
      </section>

      {afterPlayers.map(renderSection)}

      {error && <FormError className="text-center">{error}</FormError>}

      {existing && (
        <ConfirmDelete label="Delete this note" question="Delete this scouting note and its diagrams? This can't be undone." busy={deleting} onConfirm={remove} />
      )}

      <div
        className="fixed inset-x-0 z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur"
        style={{ bottom: "var(--team-bottom-nav-height, calc(4.75rem + env(safe-area-inset-bottom)))" }}
      >
        <div className="mx-auto flex w-full max-w-xl gap-2.5">
          <Button variant="secondary" size="md" className="flex-1" onClick={save} disabled={pending || busyAction !== null}>
            {pending ? "Saving…" : justSaved && !dirty ? "Saved" : existing ? "Save" : "Save note"}
          </Button>
          <button
            type="button"
            onClick={generateReport}
            disabled={pending || busyAction !== null}
            className={buttonClass({ variant: "primary", size: "md", className: "flex-[1.4]" })}
          >
            {busyAction === "report" ? "Building…" : "Generate report"}
          </button>
        </div>
      </div>
    </div>
  );
}
