/**
 * Multi-series line chart for ratings over time.
 *
 * Built for few, irregularly spaced points — a player might assess three
 * times in a year — so the x axis is assessment order rather than real
 * time. Spacing by date would bunch two check-ins a week apart into a
 * single unreadable blob and leave the rest of the chart empty.
 */

export type TrendSeries = {
  label: string;
  color: string;
  values: (number | null)[];
};

export function TrendChart({
  series,
  labels,
  max,
  height = 160,
  // A constant target to hold a series against — e.g. a drill's goal
  // score. Drawn as a dashed reference line rather than another series,
  // since it doesn't vary by point the way real data does.
  goalLine,
}: {
  series: TrendSeries[];
  labels: string[];
  max: number;
  height?: number;
  goalLine?: number;
}) {
  const width = 320;
  const padX = 8;
  const padY = 10;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const n = labels.length;

  const x = (i: number) => (n <= 1 ? padX + innerW / 2 : padX + (i / (n - 1)) * innerW);
  const y = (v: number) => padY + innerH - (Math.max(0, Math.min(max, v)) / max) * innerH;

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={series.map((s) => `${s.label}: ${s.values.join(", ")}`).join("; ")}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((r) => (
          <line
            key={r}
            x1={padX}
            x2={width - padX}
            y1={padY + innerH * r}
            y2={padY + innerH * r}
            stroke="var(--line)"
            strokeWidth={1}
          />
        ))}

        {goalLine !== undefined && goalLine <= max && (
          <g>
            <line
              x1={padX}
              x2={width - padX}
              y1={y(goalLine)}
              y2={y(goalLine)}
              stroke="var(--line-strong)"
              strokeWidth={1.5}
              strokeDasharray="4,4"
            />
            <text
              x={width - padX}
              y={y(goalLine) - 4}
              textAnchor="end"
              className="fill-[var(--foreground-mute)] text-[9px] font-bold"
            >
              goal {goalLine}
            </text>
          </g>
        )}

        {series.map((s) => {
          // Gaps are skipped rather than drawn through — a category that
          // wasn't recorded shouldn't imply a value it never had.
          const points = s.values
            .map((v, i) => (v === null ? null : ([x(i), y(v)] as const)))
            .filter((p): p is readonly [number, number] => p !== null);
          if (points.length === 0) return null;

          const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");

          return (
            <g key={s.label}>
              <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
              {points.map((p, i) => (
                <circle
                  key={i}
                  cx={p[0]}
                  cy={p[1]}
                  r={3}
                  fill={s.color}
                  stroke="var(--surface)"
                  strokeWidth={1.5}
                />
              ))}
            </g>
          );
        })}
      </svg>

      <div className="mt-1 flex justify-between px-1">
        {labels.map((l, i) => (
          <span
            key={l + i}
            className="text-[9px] font-bold uppercase tracking-wide text-foreground-mute"
          >
            {l}
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-foreground-dim">
              {s.label}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
