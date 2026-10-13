"use client";

import { ButtonLink } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/card";
import { useLocalDraft } from "@/lib/use-local-draft";
import { draftKey, parseDraft } from "@/lib/basketball/shot-draft";

/**
 * A shooting set lives on the phone until it is saved. If the app reopens somewhere else (a phone taken off its stand, a call,
 * a restart), this says so on Today, instead of the set being invisible until someone happens to open Shoot.
 */
export function ResumeShotSet({ playerId }: { playerId: string }) {
  const [raw] = useLocalDraft(draftKey(playerId));
  const d = parseDraft(raw);
  if (!d || d.shots.length === 0) return null;
  const makes = d.shots.filter((s) => s.made).length;
  const review = d.mode === "camera" && d.reviewing;

  return (
    <section aria-label="Shooting set in progress" className="theme-dark hero-sheen panel-lit relative overflow-hidden rounded-3xl border border-accent shadow-[var(--shadow-panel)]">
      <div className="relative p-5">
        <Eyebrow className="text-accent">{review ? "Waiting for your review" : "Shooting set not saved yet"}</Eyebrow>
        <h2 className="mt-1.5 font-display text-3xl uppercase leading-[0.95] tracking-tight text-foreground">
          {d.label || "Shooting"} · {makes}/{d.shots.length}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground-dim">
          {review ? "Check the camera's calls, then save it." : "It is kept on this phone. Pick it up to carry on or save it."}
        </p>
        <ButtonLink href={`/players/${playerId}/shooting`} size="lg" block className="mt-4">
          {review ? "Review and save" : "Pick it up"}
        </ButtonLink>
      </div>
    </section>
  );
}
