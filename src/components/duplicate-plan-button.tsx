"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { duplicatePracticePlan } from "@/app/actions";
import { haptic } from "@/lib/haptics";

/**
 * Copies a plan and drops the coach straight onto the copy's edit page —
 * a coach running a similar practice most weeks shouldn't have to rebuild
 * it from a blank list every time.
 */
export function DuplicatePlanButton({ planId, teamId }: { planId: string; teamId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function duplicate() {
    haptic("tap");
    startTransition(async () => {
      const result = await duplicatePracticePlan(planId, teamId);
      if (result?.error || !("planId" in result)) return;
      router.push(`/teams/${teamId}/practice/${result.planId}`);
    });
  }

  return (
    <button
      type="button"
      onClick={duplicate}
      disabled={pending}
      className="shrink-0 text-[10px] font-extrabold uppercase tracking-wide text-foreground-mute transition-colors hover:text-accent disabled:opacity-50"
    >
      {pending ? "Copying…" : "Duplicate"}
    </button>
  );
}
