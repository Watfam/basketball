"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveScoutingNote, deleteScoutingNote } from "@/app/actions";
import { haptic } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { FormError, TextArea } from "@/components/ui/field";

type ExistingNote = {
  id: string;
  opponent_name: string;
  notes: Record<string, string> | null;
};

const SECTIONS = [
  { key: "personnel", label: "Personnel", placeholder: "Who to know — their best player, who guards who, matchups you want or don't want" },
  { key: "tendencies", label: "Tendencies", placeholder: "What they run, when they press, how they close games out" },
  { key: "game_plan", label: "Our Game Plan", placeholder: "What we're doing about it" },
] as const;

/**
 * A scouting report kept to three labeled sections rather than one open
 * text box — enough shape that reading an old note before a rematch is
 * fast, without being rigid enough to fight how a coach actually writes.
 */
export function ScoutingNoteForm({
  teamId,
  existing,
}: {
  teamId: string;
  existing?: ExistingNote;
}) {
  const router = useRouter();
  const [opponentName, setOpponentName] = useState(existing?.opponent_name ?? "");
  const [notes, setNotes] = useState<Record<string, string>>(existing?.notes ?? {});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [deleting, startDeleteTransition] = useTransition();

  function save() {
    if (!opponentName.trim()) {
      setError("Name the opponent.");
      return;
    }
    haptic("tap");
    setError(null);
    startTransition(async () => {
      const result = await saveScoutingNote(teamId, existing?.id ?? null, {
        opponentName,
        notes,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      haptic("success");
      router.push(`/teams/${teamId}/scouting`);
    });
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

  return (
    <div className="mx-auto w-full max-w-md space-y-5">
      <section className="panel-lit rounded-3xl border border-line bg-surface p-6">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent">
          Opponent
        </p>
        <input
          value={opponentName}
          onChange={(e) => setOpponentName(e.target.value)}
          placeholder="Central Valley"
          className="font-display mt-2 w-full border-b border-line bg-transparent pb-2 text-2xl uppercase text-foreground placeholder:text-foreground-mute focus:border-accent focus:outline-none"
        />
      </section>

      {SECTIONS.map((s) => (
        <section key={s.key} className="panel-lit rounded-3xl border border-line bg-surface p-6">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent">
            {s.label}
          </p>
          <TextArea
            value={notes[s.key] ?? ""}
            onChange={(e) => setNotes((prev) => ({ ...prev, [s.key]: e.target.value }))}
            rows={4}
            placeholder={s.placeholder}
            className="mt-2.5"
          />
        </section>
      ))}

      {error && <FormError className="text-center">{error}</FormError>}

      <Button size="lg" block onClick={save} disabled={pending}>
        {pending ? "Saving…" : existing ? "Save changes" : "Save note"}
      </Button>

      {existing && (
        <Button variant="danger" size="sm" block onClick={remove} disabled={deleting}>
          {deleting ? "Deleting…" : "Delete this note"}
        </Button>
      )}
    </div>
  );
}
