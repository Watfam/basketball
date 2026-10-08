"use client";

import { useState, useTransition } from "react";
import { deleteHousehold } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { FormError, Input } from "@/components/ui/field";

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
      <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)} className="-ml-3">
        Household settings
      </Button>

      {open && (
        <div className="mt-3 rounded-2xl border border-red-500/40 bg-red-500/5 p-4">
          <p className="text-sm font-semibold text-foreground">Delete household</p>
          <p className="mt-1 text-xs text-foreground-dim">
            Permanently deletes <strong>{householdName}</strong> and every player, Player Card,
            and workout history nested under it. This can&rsquo;t be undone. Type the household
            name to confirm.
          </p>
          <Input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={householdName}
            className="mt-3 focus:border-danger!"
          />
          {error && <FormError className="mt-2">{error}</FormError>}
          <Button variant="danger" block onClick={handleDelete} disabled={!canDelete || pending} className="mt-3">
            {pending ? "Deleting…" : "Delete household forever"}
          </Button>
        </div>
      )}
    </div>
  );
}
