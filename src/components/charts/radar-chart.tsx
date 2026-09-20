/**
 * Attribute radar. Hand-built SVG rather than a charting library — the
 * shape is four points and a couple of rings, and pulling in a chart
 * dependency for that would cost more bundle than it saves in code.
 *
 * Renders a comparison polygon underneath the current one when previous
 * values are supplied, which is what makes movement legible ("this is
 * where you were").
 */

type Axis = { label: string; value: number; previous?: number };

export function RadarChart({
  axes,
  max,
  size = 240,
  idPrefix = "radar",
}: {
  axes: Axis[];
  max: number;
  size?: number;
  idPrefix?: string;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.32;
  const rings = [0.25, 0.5, 0.75, 1];
  // The viewBox bleeds past the plot horizontally so the left/right axis
  // labels have somewhere to live. Without this they run outside the SVG
  // and get clipped by the panel's rounded overflow.
  const padX = size * 0.28;

  const pointAt = (index: number, ratio: number) => {
    const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
    const r = radius * ratio;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r] as const;
  };

  const polygon = (getRatio: (a: Axis) => number) =>
    axes
      .map((axis, i) => {
        const [x, y] = pointAt(i, Math.max(0, Math.min(1, getRatio(axis))));
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  const currentPoints = polygon((a) => a.value / max);
  const hasPrevious = axes.some((a) => typeof a.previous === "number");
  const previousPoints = hasPrevious
    ? polygon((a) => (a.previous ?? a.value) / max)
    : null;

  return (
    <svg
      viewBox={`${-padX} 0 ${size + padX * 2} ${size}`}
      className="h-auto w-full"
      role="img"
      aria-label={axes.map((a) => `${a.label} ${a.value} of ${max}`).join(", ")}
    >
      <defs>
        <radialGradient id={`${idPrefix}-fill`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--accent-hover)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.2" />
        </radialGradient>
      </defs>

      {rings.map((ratio) => (
        <polygon
          key={ratio}
          points={polygon(() => ratio)}
          fill="none"
          stroke="var(--line)"
          strokeWidth={1}
        />
      ))}

      {axes.map((axis, i) => {
        const [x, y] = pointAt(i, 1);
        return (
          <line
            key={axis.label}
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke="var(--line)"
            strokeWidth={1}
          />
        );
      })}

      {previousPoints && (
        <polygon
          points={previousPoints}
          fill="none"
          stroke="var(--foreground-mute)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      )}

      <polygon
        points={currentPoints}
        fill={`url(#${idPrefix}-fill)`}
        stroke="var(--accent)"
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {axes.map((axis, i) => {
        const [x, y] = pointAt(i, Math.max(0, Math.min(1, axis.value / max)));
        return (
          <circle
            key={axis.label}
            cx={x}
            cy={y}
            r={3.5}
            fill="var(--accent)"
            stroke="var(--background)"
            strokeWidth={1.5}
          />
        );
      })}

      {axes.map((axis, i) => {
        const [x, y] = pointAt(i, 1.3);
        // Side labels hang outward from the vertex; top/bottom center on it.
        const anchor = Math.abs(x - cx) < 6 ? "middle" : x > cx ? "start" : "end";
        return (
          <g key={axis.label}>
            <text
              x={x}
              y={y - 3}
              textAnchor={anchor}
              className="fill-[var(--foreground-dim)] text-[8.5px] font-bold uppercase"
              style={{ letterSpacing: "0.08em" }}
            >
              {axis.label}
            </text>
            <text
              x={x}
              y={y + 9}
              textAnchor={anchor}
              className="fill-[var(--foreground)] font-display text-[14px]"
            >
              {axis.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
