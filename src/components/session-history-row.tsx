import Link from "next/link";

/**
 * One row in the session history. Extracted from the page so the same
 * component that ships is the one that gets visually verified.
 */
export function SessionHistoryRow({
  href,
  workoutName,
  loggedCount,
  totalDrills,
  dateLabel,
  isInProgress,
  isFirst,
}: {
  href: string;
  workoutName: string;
  loggedCount: number;
  totalDrills: number;
  dateLabel: string;
  isInProgress: boolean;
  isFirst: boolean;
}) {
  const ratio = totalDrills === 0 ? 0 : loggedCount / totalDrills;

  return (
    <Link
      href={href}
      className={`flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[var(--raised)] ${
        isFirst ? "" : "border-t border-line"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-foreground">{workoutName}</p>
        <div className="mt-1.5 flex items-center gap-2">
          {/* The bar makes a part-finished session legible at a glance —
              "2 of 7" reads very differently from "6 of 7", and a number
              alone buries that difference. */}
          <div className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-[var(--data-dim)]">
            <div className="h-full rounded-full bg-accent" style={{ width: `${ratio * 100}%` }} />
          </div>
          <p className="truncate text-[10px] font-bold uppercase tracking-wider text-foreground-mute">
            {loggedCount}/{totalDrills} drills · {dateLabel}
          </p>
        </div>
      </div>
      <span
        className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide ${
          isInProgress ? "border-accent text-accent" : "border-line text-foreground-mute"
        }`}
      >
        {isInProgress ? "Resume" : "Done"}
      </span>
    </Link>
  );
}
