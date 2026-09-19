"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { removePlayer } from "@/app/actions";
import { haptic } from "@/lib/haptics";

type Props = {
  id: string;
  displayName: string;
  subtitle: string;
  hasAssessment: boolean;
};

export function PlayerRow({ id, displayName, subtitle, hasAssessment }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleRemove() {
    haptic("tap");
    startTransition(async () => {
      const result = await removePlayer(id);
      if (result?.error) setError(result.error);
    });
  }

  if (confirming) {
    return (
      <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3.5">
        <p className="text-sm text-foreground">
          Remove <strong>{displayName}</strong>? This deletes their Player Card, assessment
          history, and logged workouts. This can&rsquo;t be undone.
        </p>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={handleRemove}
            disabled={pending}
            className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-red-400 disabled:opacity-50"
          >
            {pending ? "Removing…" : "Remove player"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-foreground-dim hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3.5">
      <div>
        <p className="font-semibold text-foreground">{displayName}</p>
        <p className="mt-0.5 text-xs text-foreground-dim">{subtitle}</p>
      </div>
      <div className="flex items-center gap-3">
        {!hasAssessment && (
          <Link
            href={`/players/${id}/assessment`}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-accent-hover"
          >
            Start
          </Link>
        )}
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-xs font-semibold text-foreground-dim hover:text-red-400"
        >
          Remove
        </button>
      </div>
    </div>
  );
}
