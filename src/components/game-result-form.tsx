"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveGameResult, deleteGame } from "@/app/actions";
import { haptic } from "@/lib/haptics";

export function GameResultForm({
  teamId,
  gameId,
  initialTeamScore,
  initialOpponentScore,
  initialNotes,
}: {
  teamId: string;
  gameId: string;
  initialTeamScore: number | null;
  initialOpponentScore: number | null;
  initialNotes: string | null;
}) {
  const router = useRouter();
  const [teamScore, setTeamScore] = useState(initialTeamScore?.toString() ?? "");
  const [opponentScore, setOpponentScore] = useState(initialOpponentScore?.toString() ?? "");
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [deleting, startDeleteTransition] = useTransition();

  function save() {
    haptic("tap");
    setError(null);
    startTransition(async () => {
      const result = await saveGameResult(gameId, teamId, {
        teamScore: teamScore.trim() ? Number(teamScore) : null,
        opponentScore: opponentScore.trim() ? Number(opponentScore) : null,
        notes: notes.trim() || null,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      haptic("success");
      router.push(`/teams/${teamId}/games`);
    });
  }

  function remove() {
    haptic("tap");
    startDeleteTransition(async () => {
      const result = await deleteGame(gameId, teamId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.push(`/teams/${teamId}/games`);
    });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-line bg-surface p-6">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent">
          Final Score
        </p>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1">
            <label className="text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute">
              Us
            </label>
            <input
              type="number"
              value={teamScore}
              onChange={(e) => setTeamScore(e.target.value)}
              placeholder="—"
              className="mt-1 w-full rounded-lg border border-line bg-[var(--raised)] px-3 py-2 text-center font-display text-2xl text-foreground placeholder:text-foreground-mute focus:border-accent focus:outline-none"
            />
          </div>
          <span className="mt-4 text-foreground-mute">–</span>
          <div className="flex-1">
            <label className="text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute">
              Them
            </label>
            <input
              type="number"
              value={opponentScore}
              onChange={(e) => setOpponentScore(e.target.value)}
              placeholder="—"
              className="mt-1 w-full rounded-lg border border-line bg-[var(--raised)] px-3 py-2 text-center font-display text-2xl text-foreground placeholder:text-foreground-mute focus:border-accent focus:outline-none"
            />
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-line bg-surface p-6">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent">
          Post-Game Notes
        </p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={6}
          placeholder="What worked, what to fix, who stood out..."
          className="mt-2 w-full rounded-lg border border-line bg-[var(--raised)] px-3 py-2 text-sm text-foreground placeholder:text-foreground-mute focus:border-accent focus:outline-none"
        />
      </section>

      {error && <p className="text-center text-sm text-red-400">{error}</p>}

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="w-full rounded-xl bg-accent py-3.5 text-sm font-extrabold uppercase tracking-[0.12em] text-white shadow-lg shadow-[var(--glow)] transition-colors hover:bg-accent-hover disabled:opacity-40"
      >
        {pending ? "Saving…" : "Save"}
      </button>

      <button
        type="button"
        onClick={remove}
        disabled={deleting}
        className="w-full text-center text-[11px] font-bold uppercase tracking-wide text-foreground-mute transition-colors hover:text-red-400 disabled:opacity-50"
      >
        {deleting ? "Removing…" : "Remove this game"}
      </button>
    </div>
  );
}
