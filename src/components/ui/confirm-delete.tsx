"use client";

import { useState } from "react";
import { haptic } from "@/lib/haptics";
import { Button } from "./button";

/**
 * A delete that asks first. The first tap only opens the question, so a stray tap next to Save can't lose a plan, a game or a
 * note; the second tap, on a different button, does it.
 */
export function ConfirmDelete({
  label,
  question,
  busyLabel = "Deleting…",
  busy,
  onConfirm,
}: {
  /** The resting button, e.g. "Delete this plan". */
  label: string;
  /** What is lost, e.g. "Delete this plan? This can't be undone." */
  question: string;
  busyLabel?: string;
  busy: boolean;
  onConfirm: () => void;
}) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <Button
        variant="danger"
        size="sm"
        block
        onClick={() => {
          haptic("tap");
          setAsking(true);
        }}
      >
        {label}
      </Button>
    );
  }

  return (
    <div role="alertdialog" aria-label={question} className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3">
      <p className="text-center text-sm font-semibold text-foreground">{question}</p>
      <div className="mt-3 flex gap-2">
        <Button variant="danger" size="md" className="flex-1" onClick={onConfirm} disabled={busy}>
          {busy ? busyLabel : "Yes, delete"}
        </Button>
        <Button variant="secondary" size="md" className="flex-1" onClick={() => setAsking(false)} disabled={busy}>
          Keep it
        </Button>
      </div>
    </div>
  );
}
