"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startWorkoutSession } from "@/app/actions";
import { haptic } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";

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
      <Button size={fullWidth ? "lg" : "sm"} block={fullWidth} onClick={handleStart} disabled={pending}>
        {pending ? "Starting…" : fullWidth ? "Start Session" : "Start Workout"}
      </Button>
      {error && <FormError className="mt-1">{error}</FormError>}
    </div>
  );
}
