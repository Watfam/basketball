/**
 * Weekly training volume. Bars rather than a line: sessions-per-week is a
 * count, and a smoothed line would imply values between weeks that don't
 * exist. The dashed rule is the player's own average, so the read is
 * "against my normal," not against some invented target.
 */

export type VolumeWeek = { label: string; count: number; isCurrent?: boolean };

export function VolumeChart({ weeks, height = 108 }: { weeks: VolumeWeek[]; height?: number }) {
  const peak = Math.max(1, ...weeks.map((w) => w.count));
  const average = weeks.reduce((sum, w) => sum + w.count, 0) / Math.max(1, weeks.length);
  const averageRatio = average / peak;

  return (
    <div>
      <div className="relative flex items-end gap-1.5" style={{ height }}>
        {average > 0 && (
          <div
            className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-[var(--line-strong)]"
            style={{ bottom: `${averageRatio * 100}%` }}
          >
            {/* Anchored left: the most recent weeks are on the right and are
                usually the tallest bars, so a right-aligned label sits on top
                of them. */}
            <span className="absolute -top-2.5 left-0 rounded bg-[var(--surface)] px-1 text-[9px] font-bold uppercase tracking-wider text-foreground-mute">
              avg {average.toFixed(1)}
            </span>
          </div>
        )}

        {weeks.map((week, i) => {
          const ratio = week.count / peak;
          return (
            <div key={week.label + i} className="flex h-full flex-1 flex-col justify-end gap-1.5">
              <div
                className="animate-grow w-full rounded-t-[3px]"
                style={{
                  height: `${Math.max(ratio * 100, week.count > 0 ? 6 : 2)}%`,
                  // Only the current week carries the accent. Past weeks stay
                  // neutral: a dimmed orange mixed against a near-black navy
                  // reads as brown mud, and reserving the accent for "now"
                  // is the stronger hierarchy anyway.
                  background: week.isCurrent
                    ? "linear-gradient(180deg, var(--accent-hover), var(--accent))"
                    : week.count > 0
                      ? "var(--line-strong)"
                      : "var(--data-dim)",
                  animationDelay: `${i * 45}ms`,
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex gap-1.5">
        {weeks.map((week, i) => (
          <span
            key={week.label + i}
            className={`flex-1 text-center text-[9px] font-bold uppercase tracking-wide ${
              week.isCurrent ? "text-accent" : "text-foreground-mute"
            }`}
          >
            {week.label}
          </span>
        ))}
      </div>
    </div>
  );
}
