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
    if (!window.confirm("Delete this session? This can't be undone.")) return;
    haptic("tap");
    startTransition(async () => {
      const result = await deleteShotSession(sessionId, playerId);
      if (result?.error) {
        window.alert(result.error);
        return;
      }
      router.push(`/players/${playerId}/shooting`);
    });
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={pending}
      className="w-full text-center text-[11px] font-bold uppercase tracking-wide text-foreground-mute transition-colors hover:text-red-400 disabled:opacity-50"
    >
      {pending ? "Deleting…" : "Delete this session"}
    </button>
  );
}
