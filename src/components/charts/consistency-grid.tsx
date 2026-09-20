/**
 * Work-ethic heatmap — one cell per day, newest column on the right.
 * The point isn't any single day; it's that a season of effort becomes one
 * glanceable shape. Empty stretches are meant to be visible.
 */

export type DayCell = { date: string; count: number };

// The ramp is art-directed per theme rather than computed by blending the
// accent with the background: an sRGB blend passes through brown and an
// OKLCH blend swings through magenta, because the two endpoints are on
// opposite sides of the hue wheel. Hand-picked steps stay on one hue.
function intensity(count: number): string {
  if (count <= 0) return "var(--data-dim)";
  if (count === 1) return "var(--heat-1)";
  if (count === 2) return "var(--heat-2)";
  return "var(--accent)";
}

export function ConsistencyGrid({
  days,
  weeks = 14,
}: {
  days: DayCell[];
  weeks?: number;
}) {
  // Newest last, chunked into columns of 7 (a week per column).
  const cells = days.slice(-weeks * 7);
  const columns: DayCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    columns.push(cells.slice(i, i + 7));
  }

  return (
    <div>
      <div className="flex gap-[3px]">
        {columns.map((column, ci) => (
          <div key={ci} className="flex flex-1 flex-col gap-[3px]">
            {column.map((day) => (
              <div
                key={day.date}
                title={`${day.date}: ${day.count} session${day.count === 1 ? "" : "s"}`}
                className="aspect-square w-full rounded-[2px]"
                style={{ background: intensity(day.count) }}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="mt-2.5 flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-wider text-foreground-mute">
          {weeks} weeks
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-wider text-foreground-mute">
            Less
          </span>
          {[0, 1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-2 w-2 rounded-[2px]"
              style={{ background: intensity(n) }}
            />
          ))}
          <span className="text-[9px] font-bold uppercase tracking-wider text-foreground-mute">
            More
          </span>
        </div>
      </div>
    </div>
  );
}
