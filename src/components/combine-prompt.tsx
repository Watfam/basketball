"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { snoozeCombine } from "@/app/actions";
import { haptic } from "@/lib/haptics";
import { Button, ButtonLink } from "@/components/ui/button";

/**
 * The outstanding combine.
 *
 * Self-rating gets a player started, but it is a guess — and every
 * workout, program and film recommendation keys off it. The combine is
 * the measurement that makes those numbers mean something, so this stays
 * on the hub until it has actually been done.
 *
 * "Not now" snoozes for a week rather than dismissing. There is no
 * permanent dismiss on purpose: a player who never measures is a player
 * whose whole development plan is built on a guess, and quietly letting
 * that happen would be the app failing at its job.
 */
export function CombinePrompt({
  playerId,
  hasEverDone,
}: {
  playerId: string;
  hasEverDone: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function snooze() {
    haptic("tap");
    startTransition(async () => {
      await snoozeCombine(playerId);
      router.refresh();
    });
  }

  return (
    <section className="theme-dark hero-sheen panel-lit relative overflow-hidden rounded-2xl border border-accent shadow-[var(--shadow-panel)]">
      <div className="court-lines absolute inset-0 opacity-60" aria-hidden />
      <div className="relative p-5">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-accent">
          {hasEverDone ? "Time to retest" : "Not measured yet"}
        </p>
        <h2 className="font-display mt-1.5 text-2xl uppercase leading-[0.98] tracking-tight text-foreground">
          {hasEverDone ? "Run the combine again" : "Run the combine"}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground-dim">
          {hasEverDone
            ? "Your last measured numbers are over a month old. Re-run the tests and see what actually moved."
            : "Your ratings are still a self-estimate. Nine timed and counted tests turn them into something real — and everything the app recommends gets sharper."}
        </p>

        <ButtonLink href={`/players/${playerId}/combine`} size="lg" block className="mt-4">
          {hasEverDone ? "Retest" : "Start the combine"}
        </ButtonLink>

        <Button variant="ghost" size="sm" block onClick={snooze} disabled={pending} className="mt-2">
          {pending ? "…" : "Not now — remind me in a week"}
        </Button>
      </div>
    </section>
  );
}
