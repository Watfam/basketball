"use client";

import { RIM_WARNING_TEXT, type RimAssessment } from "@/lib/review/rim-warning";
import { Button } from "@/components/ui/button";

/** The experimental rim warning, display only. Shows nothing unless the assessment says warn. It changes no count, call or record. */
export function RimWarningBanner({ assessment, shotNumbers, onReview }: { assessment: RimAssessment; shotNumbers: number[]; onReview: () => void }) {
  if (!assessment.warn) return null;
  return (
    <div role="status" aria-label="Rim warning (experimental)" className="mt-3 rounded-2xl border border-line bg-raised p-3 text-left text-[12px] text-foreground-dim">
      <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">Heads up · experimental</p>
      <p className="mt-1 text-[13px] font-bold text-foreground">{RIM_WARNING_TEXT.headline}</p>
      <p className="mt-1">{RIM_WARNING_TEXT.body}</p>
      <p className="mt-1">{shotNumbers.length > 0 ? `${shotNumbers.length} shot${shotNumbers.length === 1 ? " is" : "s are"} marked: ${shotNumbers.join(", ")}.` : ""}</p>
      <Button size="sm" className="mt-2" onClick={onReview}>{shotNumbers.length === 1 ? "Review the marked shot" : "Review the marked shots"}</Button>
    </div>
  );
}
