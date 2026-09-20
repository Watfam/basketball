"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startWorkoutSession } from "@/app/actions";
import { haptic } from "@/lib/haptics";

export function StartSessionButton({ playerId, workoutId }: { playerId: string; workoutId: string }) {
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
    <div>
      <button
        type="button"
        onClick={handleStart}
        disabled={pending}
        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {pending ? "Starting…" : "Start Workout"}
      </button>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
