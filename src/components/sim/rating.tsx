import type { Rating } from "@/lib/sim/engine";
import { cx } from "@/components/ui/cx";

export const RATING_LABEL: Record<Rating, string> = { good: "Works", mixed: "Mixed", poor: "Struggles" };

export const RATING_TONE: Record<Rating, string> = {
  good: "border-data-positive/40 bg-data-positive/10 text-data-positive",
  mixed: "border-line-strong bg-raised text-foreground-dim",
  poor: "border-danger/40 bg-danger/10 text-danger",
};

export function RatingChip({ rating, score, reliable, className }: { rating: Rating; score: number; reliable: boolean; className?: string }) {
  if (!reliable) {
    return (
      <span className={cx("inline-flex min-w-12 flex-col items-center rounded-lg border border-dashed border-line px-2 py-1 text-foreground-mute", className)} title="Too little of this play happens where their diagram shows a defense, so no rating.">
        <span className="font-display text-lg leading-none">—</span>
        <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wide">No read</span>
      </span>
    );
  }
  return (
    <span className={cx("inline-flex min-w-12 flex-col items-center rounded-lg border px-2 py-1", RATING_TONE[rating], className)}>
      <span className="font-display text-lg leading-none tabular-nums">{score}</span>
      <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wide">{RATING_LABEL[rating]}</span>
    </span>
  );
}
