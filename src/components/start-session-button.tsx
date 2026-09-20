"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startWorkoutSession } from "@/app/actions";
import { haptic } from "@/lib/haptics";

export function StartSessionButton({
  playerId,
  workoutId,
  fullWidth = false,
}: {
  playerId: string;
  workoutId: string;
  // The featured/hero placement gets a full-bleed primary button; inline
  // cards keep the compact one.
  fullWidth?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleStart() {
    haptic("tap");
    startTransition(async () => {
      const result = await startWorkoutSession(playerId, workoutId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.push(`/players/${playerId}/sessions/${result.sessionId}`);
    });
  }

  return (
    <div className={fullWidth ? "w-full" : undefined}>
      <button
        type="button"
        onClick={handleStart}
        disabled={pending}
        className={
          fullWidth
            ? "w-full rounded-xl bg-accent py-3.5 text-sm font-extrabold uppercase tracking-[0.12em] text-white shadow-lg shadow-[var(--glow)] transition-colors hover:bg-accent-hover active:scale-[0.99] disabled:opacity-50"
            : "rounded-lg bg-accent px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        }
      >
        {pending ? "Starting…" : fullWidth ? "Start Session" : "Start Workout"}
      </button>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
