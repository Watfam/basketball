"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enrollInProgram } from "@/app/actions";
import { haptic } from "@/lib/haptics";

/**
 * Starting a program from its detail page. Confirms first when it would
 * replace a block already in progress — a player only runs one at a time,
 * and silently standing the old one down would lose their place in it.
 */
export function EnrollButton({
  playerId,
  programId,
  replacesExisting,
}: {
  playerId: string;
  programId: string;
  replacesExisting: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function enroll() {
    haptic("tap");
    startTransition(async () => {
      const result = await enrollInProgram(playerId, programId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.push(`/players/${playerId}`);
    });
  }

  if (replacesExisting && !confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="w-full rounded-xl border border-accent py-3.5 text-sm font-extrabold uppercase tracking-[0.12em] text-accent transition-colors hover:bg-accent/10"
      >
        Switch to this program
      </button>
    );
  }

  if (replacesExisting && confirming) {
    return (
      <div className="rounded-xl border border-line bg-surface px-4 py-3 text-center">
        <p className="text-xs leading-relaxed text-foreground-dim">
          You&rsquo;re part way through another program. Switching leaves that one behind —
          sessions you already logged stay in your history and still count.
        </p>
        <div className="mt-3 flex justify-center gap-4">
          <button
            type="button"
            onClick={enroll}
            disabled={pending}
            className="text-xs font-extrabold uppercase tracking-wide text-accent transition-colors hover:text-accent-hover disabled:opacity-50"
          >
            {pending ? "Switching…" : "Switch anyway"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-xs font-bold uppercase tracking-wide text-foreground-dim transition-colors hover:text-foreground"
          >
            Keep current
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={enroll}
        disabled={pending}
        className="w-full rounded-xl bg-accent py-3.5 text-sm font-extrabold uppercase tracking-[0.12em] text-white shadow-lg shadow-[var(--glow)] transition-colors hover:bg-accent-hover active:scale-[0.99] disabled:opacity-50"
      >
        {pending ? "Starting…" : "Start this program"}
      </button>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
