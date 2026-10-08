"use client";

import { useState, useTransition } from "react";
import { removePlayer } from "@/app/actions";
import { haptic } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";

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
          <Button variant="ghost" size="sm" onClick={() => setConfirming(true)} className="-my-1.5 -mr-3 hover:text-danger!">
            Remove
          </Button>
        )}
      </div>
      {confirming && (
        <div className="mt-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3">
          <p className="text-xs text-foreground">
            Remove <strong>{name}</strong>? This deletes their Player Card, assessments, workouts and shooting
            history. It can&rsquo;t be undone.
          </p>
          {error && <FormError className="mt-2">{error}</FormError>}
          <div className="mt-2 flex gap-2">
            <Button
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={() => {
                haptic("tap");
                startTransition(async () => {
                  const res = await removePlayer(id);
                  if (res?.error) setError(res.error);
                });
              }}
            >
              {pending ? "Removing…" : "Remove player"}
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
