"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { FormError, Input, TextArea } from "@/components/ui/field";
import { haptic } from "@/lib/haptics";
import { saveTeamPhilosophyAction, resetTeamPhilosophyAction } from "@/app/actions/philosophy";
import type { PhilosophyPillar } from "@/lib/plays/philosophy";

type DraftPillar = { title: string; pointsText: string };

function toDraft(pillars: PhilosophyPillar[]): DraftPillar[] {
  return pillars.map((p) => ({ title: p.title, pointsText: p.points.join("\n") }));
}

function toSaved(draft: DraftPillar[]): PhilosophyPillar[] {
  return draft.map((p) => ({ title: p.title, points: p.pointsText.split("\n").map((pt) => pt.trim()).filter(Boolean) }));
}

/**
 * The front-matter page every play in the printed playbook sits behind — standing rules (ball-screen
 * coverage, man principles, communication), not a diagram. Edited the same way a play's name/about/keys
 * are: a details sheet with plain text fields, no canvas, since there is nothing here to draw.
 */
export function PhilosophyEditor({ teamId, canEdit, initialPillars, hasOverride }: { teamId: string; canEdit: boolean; initialPillars: PhilosophyPillar[]; hasOverride: boolean }) {
  const [pillars, setPillars] = useState<PhilosophyPillar[]>(initialPillars);
  const [draft, setDraft] = useState<DraftPillar[]>(() => toDraft(initialPillars));
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsOpener, setDetailsOpener] = useState<HTMLElement | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [resetConfirmArmed, setResetConfirmArmed] = useState(false);
  const [resetState, setResetState] = useState<"idle" | "resetting">("idle");
  const [resetError, setResetError] = useState<string | null>(null);
  const [isOverride, setIsOverride] = useState(hasOverride);

  function openDetails(e: React.MouseEvent<HTMLElement>) {
    haptic("tap");
    setDraft(toDraft(pillars));
    setDetailsOpener(e.currentTarget);
    setDetailsOpen(true);
  }

  function updateTitle(i: number, title: string) {
    setDraft((ds) => ds.map((d, j) => (i === j ? { ...d, title } : d)));
  }

  function updatePoints(i: number, pointsText: string) {
    setDraft((ds) => ds.map((d, j) => (i === j ? { ...d, pointsText } : d)));
  }

  function addPillar() {
    haptic("tap");
    setDraft((ds) => [...ds, { title: "", pointsText: "" }]);
  }

  function removePillar(i: number) {
    haptic("tap");
    setDraft((ds) => ds.filter((_, j) => j !== i));
  }

  async function save() {
    haptic("tap");
    setSaveState("saving");
    setSaveError(null);
    const value = toSaved(draft);
    const result = await saveTeamPhilosophyAction(teamId, value);
    if (result.error) {
      setSaveState("idle");
      setSaveError(result.error);
      return;
    }
    setPillars(value);
    setIsOverride(true);
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 2000);
  }

  async function resetToDefault() {
    if (!resetConfirmArmed) {
      haptic("tap");
      setResetConfirmArmed(true);
      return;
    }
    haptic("tap");
    setResetState("resetting");
    setResetError(null);
    const result = await resetTeamPhilosophyAction(teamId);
    setResetConfirmArmed(false);
    if (result.error) {
      setResetState("idle");
      setResetError(result.error);
      return;
    }
    window.location.reload();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Team Philosophy</h1>
          <p className="text-xs text-foreground-mute">The standing rules every play in the book runs inside of.</p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={openDetails}
            aria-label="Edit team philosophy"
            className="flex shrink-0 items-center gap-1 rounded-full border border-line-strong px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-foreground-dim hover:border-accent hover:text-accent"
          >
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 20h4L19 9l-4-4L4 16z" />
              <path d="M13.5 6.5l4 4" />
            </svg>
            Edit
          </button>
        )}
      </div>

      <div className="space-y-3">
        {pillars.map((pillar, i) => (
          <section key={i} className="rounded-xl border border-line bg-raised p-4">
            <h2 className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">{pillar.title}</h2>
            <ul className="list-disc space-y-1.5 pl-5">
              {pillar.points.map((pt, j) => (
                <li key={j} className="text-sm leading-relaxed text-foreground-dim">
                  {pt}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {detailsOpen && (
        <Sheet
          title="Team philosophy"
          onClose={() => {
            setDetailsOpen(false);
            setResetConfirmArmed(false);
            setResetError(null);
          }}
          opener={detailsOpener}
        >
          <div className="space-y-3">
            {draft.map((pillar, i) => (
              <div key={i} className="space-y-2 rounded-xl border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">Pillar title</label>
                  <button type="button" onClick={() => removePillar(i)} className="text-[11px] font-bold uppercase tracking-wide text-danger">
                    Remove
                  </button>
                </div>
                <Input value={pillar.title} onChange={(e) => updateTitle(i, e.target.value)} placeholder="Ball-Screen Coverage" />
                <label className="block text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">Points — one per line</label>
                <TextArea value={pillar.pointsText} onChange={(e) => updatePoints(i, e.target.value)} rows={4} placeholder={"Guard on guard: blitz the ball handler.\nBig on guard: hedge, then recover."} />
              </div>
            ))}

            <Button variant="secondary" size="sm" block onClick={addPillar}>
              Add pillar
            </Button>

            <div className="space-y-2 border-t border-line pt-3">
              <Button onClick={save} disabled={saveState === "saving"} size="lg" block>
                {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save"}
              </Button>
              {saveError && <FormError>{saveError}</FormError>}
            </div>

            {isOverride && (
              <div className="space-y-2 border-t border-line pt-3">
                <p className="text-[11px] text-foreground-mute">Drops your team&apos;s saved edit and goes back to the built-in defaults.</p>
                {resetConfirmArmed ? (
                  <div role="alertdialog" aria-label="Drop your edit and go back to the default?" className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2.5">
                    <p className="text-center text-xs font-semibold text-foreground">Drop your edit and go back to the default?</p>
                    <div className="mt-2 flex gap-2">
                      <Button variant="danger" size="sm" className="flex-1" onClick={resetToDefault} disabled={resetState === "resetting"}>
                        {resetState === "resetting" ? "Resetting…" : "Yes, reset"}
                      </Button>
                      <Button variant="secondary" size="sm" className="flex-1" onClick={() => setResetConfirmArmed(false)} disabled={resetState === "resetting"}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="secondary" size="sm" block onClick={resetToDefault}>
                    Reset to default
                  </Button>
                )}
                {resetError && <FormError>{resetError}</FormError>}
              </div>
            )}
          </div>
        </Sheet>
      )}
    </div>
  );
}
