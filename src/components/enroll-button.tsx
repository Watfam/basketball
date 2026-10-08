"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enrollInProgram } from "@/app/actions";
import { haptic } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";

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
      <Button variant="secondary" size="lg" block onClick={() => setConfirming(true)}>
        Switch to this program
      </Button>
    );
  }

  if (replacesExisting && confirming) {
    return (
      <div className="rounded-xl border border-line bg-surface px-4 py-3 text-center">
        <p className="text-xs leading-relaxed text-foreground-dim">
          You&rsquo;re part way through another program. Switching leaves that one behind —
          sessions you already logged stay in your history and still count.
        </p>
        <div className="mt-3 flex justify-center gap-2">
          <Button size="sm" onClick={enroll} disabled={pending}>
            {pending ? "Switching…" : "Switch anyway"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
            Keep current
          </Button>
        </div>
        {error && <FormError className="mt-2">{error}</FormError>}
      </div>
    );
  }

  return (
    <div>
      <Button size="lg" block onClick={enroll} disabled={pending}>
        {pending ? "Starting…" : "Start this program"}
      </Button>
      {error && <FormError className="mt-2">{error}</FormError>}
    </div>
  );
}
