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
  positionLabel: string | null;
  overall: number | null;
  streakWeeks: number;
  totalSessions: number;
  programLabel: string | null;
};

/**
 * A player's row on the household dashboard. Carries enough of the hub to
 * be worth looking at — rating, program position, work done — so the
 * dashboard answers "how are my kids doing" rather than just listing
 * names and making you open each one to find out.
 */
export function PlayerRow({
  id,
  displayName,
  subtitle,
  hasAssessment,
  positionLabel,
  overall,
  streakWeeks,
  totalSessions,
  programLabel,
}: Props) {
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

  // Pre-assessment players get a stripped-down row: there's no rating or
  // training history to show yet, and the only useful action is starting.
  if (!hasAssessment) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5">
        <div className="min-w-0">
          <p className="font-display text-xl uppercase leading-none tracking-tight text-foreground">
            {displayName}
          </p>
          <p className="mt-1 text-xs text-foreground-dim">{subtitle || "No assessment yet"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link
            href={`/players/${id}/assessment`}
            className="rounded-lg bg-accent px-3 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white transition-colors hover:bg-accent-hover"
          >
            Start
          </Link>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-[11px] font-bold uppercase tracking-wide text-foreground-mute transition-colors hover:text-red-400"
          >
            Remove
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-lit overflow-hidden rounded-2xl border border-line bg-surface">
      <Link href={`/players/${id}`} className="block px-4 pt-4 transition-colors hover:bg-[var(--raised)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {positionLabel && (
              <span className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-accent">
                {positionLabel}
              </span>
            )}
            <p className="font-display mt-1 text-2xl uppercase leading-none tracking-tight text-foreground">
              {displayName}
            </p>
            <p className="mt-1 truncate text-xs font-semibold text-foreground-dim">{subtitle}</p>
          </div>

          {overall !== null && (
            <div className="shrink-0 text-right">
              <p className="font-display text-3xl leading-none text-accent">{overall}</p>
              <p className="text-[8px] font-extrabold uppercase tracking-[0.16em] text-foreground-mute">
                Overall
              </p>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center gap-4 border-t border-line py-2.5">
          <Stat value={String(streakWeeks)} unit={streakWeeks === 1 ? "wk streak" : "wk streak"} />
          <Stat value={String(totalSessions)} unit={totalSessions === 1 ? "session" : "sessions"} />
        </div>
      </Link>

      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5">
        <p className="min-w-0 truncate text-[11px] font-bold uppercase tracking-wider text-foreground-mute">
          {programLabel ?? "No program yet"}
        </p>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-foreground-mute transition-colors hover:text-red-400"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

function Stat({ value, unit }: { value: string; unit: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="font-display text-lg leading-none text-foreground">{value}</span>
      <span className="text-[10px] font-extrabold uppercase tracking-wider text-foreground-mute">
        {unit}
      </span>
    </div>
  );
}
