"use client";

import { useState, useTransition } from "react";
import { deleteHousehold } from "@/app/actions";

export function HouseholdSettings({ householdId, householdName }: { householdId: string; householdName: string }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canDelete = confirmText.trim() === householdName;

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteHousehold(householdId);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="pt-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-semibold uppercase tracking-wide text-foreground-dim hover:text-foreground"
      >
        Household settings
      </button>

      {open && (
        <div className="mt-3 rounded-2xl border border-red-500/40 bg-red-500/5 p-4">
          <p className="text-sm font-semibold text-foreground">Delete household</p>
          <p className="mt-1 text-xs text-foreground-dim">
            Permanently deletes <strong>{householdName}</strong> and every player, Player Card,
            and workout history nested under it. This can&rsquo;t be undone. Type the household
            name to confirm.
          </p>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={householdName}
            className="mt-3 w-full rounded-xl border border-line bg-elevated px-3.5 py-2 text-sm text-foreground outline-none focus:border-red-400"
          />
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
          <button
            type="button"
            onClick={handleDelete}
            disabled={!canDelete || pending}
            className="mt-3 w-full rounded-xl bg-red-500 px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "Deleting…" : "Delete household forever"}
          </button>
        </div>
      )}
    </div>
  );
}
