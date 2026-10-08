"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteShotSession } from "@/app/actions";
import { haptic } from "@/lib/haptics";

export function DeleteShotSessionButton({
  sessionId,
  playerId,
}: {
  sessionId: string;
  playerId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove() {
    if (!window.confirm("Delete this session? It leaves your totals now; you can undo for a few seconds.")) return;
    haptic("tap");
    startTransition(async () => {
      const result = await deleteShotSession(sessionId, playerId);
      if (result?.error) {
        window.alert(result.error);
        return;
      }
      // The history page offers Undo for it.
      router.push(`/players/${playerId}/shooting?deleted=${sessionId}`);
    });
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={pending}
      className="w-full text-center text-[11px] font-bold uppercase tracking-wide text-foreground-mute transition-colors hover:text-danger disabled:opacity-50"
    >
      {pending ? "Deleting…" : "Delete this session"}
    </button>
  );
}
