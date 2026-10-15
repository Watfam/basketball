"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteShotSession } from "@/app/actions";
import { haptic } from "@/lib/haptics";
import { forgetSessionHistory } from "@/lib/review/history-ops";
import { Button } from "@/components/ui/button";

export function DeleteShotSessionButton({
  sessionId,
  playerId,
  startedAt,
}: {
  sessionId: string;
  playerId: string;
  startedAt?: string;
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
      void forgetSessionHistory({ playerId, sessionId, startedAt });
      // The history page offers Undo for it.
      router.push(`/players/${playerId}/shooting?deleted=${sessionId}`);
    });
  }

  return (
    <Button variant="ghost" size="sm" block onClick={remove} disabled={pending} className="hover:text-danger">
      {pending ? "Deleting…" : "Delete this session"}
    </Button>
  );
}
