/**
 * The Hardwood Lab mark (a ball dropping through a rim and net) and its
 * lockup with the wordmark. The mark's colours are the brand's own and stay
 * the same in light and dark: the source files are public/brand/*.svg and
 * the home-screen icons in public/icons/ are rendered from them.
 */
export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 180 180" aria-hidden="true" className={className}>
      <rect width="180" height="180" rx="40" fill="#0f1a2e" />
      <g transform="translate(90 0)">
        <circle cx="0" cy="38" r="17" fill="#ff6a1a" />
        <path d="M0 21V55M-17 38H17" stroke="#070d18" strokeWidth="3.5" strokeLinecap="round" />
        <ellipse cx="0" cy="84" rx="54" ry="14" fill="none" stroke="#ff6a1a" strokeWidth="9" />
        <g fill="none" stroke="#f1f5f9" strokeWidth="5" strokeLinecap="round">
          <path d="M-46 92L-24 148M-22 96L-12 152M0 98V154M22 96L12 152M46 92L24 148" />
          <path d="M-36 112Q0 124 36 112M-27 130Q0 140 27 130" />
        </g>
      </g>
    </svg>
  );
}

/** Mark and wordmark side by side. `size` is the mark's size in px; the wordmark follows it. */
export function BrandLockup({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <BrandMark size={size} />
      <span
        className="font-display uppercase leading-none tracking-[0.07em] text-foreground"
        style={{ fontSize: Math.round(size * 0.85) }}
      >
        Hardwood Lab
      </span>
    </span>
  );
}
