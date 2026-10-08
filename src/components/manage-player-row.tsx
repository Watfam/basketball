"use client";

import { useState, useTransition } from "react";
import { removePlayer } from "@/app/actions";
import { haptic } from "@/lib/haptics";

/** One player in Manage family: their name and a guarded Remove. */
export function ManagePlayerRow({ id, name }: { id: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-semibold text-foreground">{name}</p>
        {!confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-[11px] font-bold uppercase tracking-wide text-foreground-mute transition-colors hover:text-danger"
          >
            Remove
          </button>
        )}
      </div>
      {confirming && (
        <div className="mt-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3">
          <p className="text-xs text-foreground">
            Remove <strong>{name}</strong>? This deletes their Player Card, assessments, workouts and shooting
            history. It can&rsquo;t be undone.
          </p>
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                haptic("tap");
                startTransition(async () => {
                  const res = await removePlayer(id);
                  if (res?.error) setError(res.error);
                });
              }}
              className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-bold uppercase text-white disabled:opacity-50"
            >
              {pending ? "Removing…" : "Remove player"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirming(false)}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-foreground-dim"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
