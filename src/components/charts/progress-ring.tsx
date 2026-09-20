/**
 * Circular gauge used for the overall rating and the weekly target. The
 * track is always a full circle so an early-stage player still sees the
 * whole distance they're working through, not a mostly-empty widget.
 */

export function ProgressRing({
  ratio,
  size = 132,
  stroke = 9,
  idPrefix = "ring",
  animate = true,
  children,
}: {
  ratio: number;
  size?: number;
  stroke?: number;
  idPrefix?: string;
  // Off for live countdowns: the draw-in animation is a one-time reveal,
  // and replaying it against a value that changes every second fights the
  // actual reading.
  animate?: boolean;
  children?: React.ReactNode;
}) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * clamped;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90">
        <defs>
          <linearGradient id={`${idPrefix}-stroke`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--accent-hover)" />
            <stop offset="100%" stopColor="var(--accent)" />
          </linearGradient>
        </defs>

        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--data-dim)"
          strokeWidth={stroke}
        />
        {/* Skipped entirely at zero: a round line cap on a zero-length dash
            still paints a dot, which reads as a stray artifact rather than
            an empty gauge. */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${idPrefix}-stroke)`}
          strokeWidth={clamped === 0 ? 0 : stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          className={animate ? "animate-draw" : "transition-[stroke-dasharray] duration-500 ease-linear"}
          style={animate ? { ["--dash-len" as string]: `${circumference}` } : undefined}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
