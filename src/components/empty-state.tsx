/**
 * Shared "nothing here yet" pattern: eyebrow + heading + subtext inside a
 * dashed brand-toned card, optionally with a call-to-action slot. Every
 * empty state in the app should use this rather than inventing its own —
 * an empty list with no explanation reads as broken; this always reads as
 * "designed, just waiting for your first thing."
 */
export function EmptyState({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface/60 px-5 py-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">{eyebrow}</p>
      <h3 className="mt-2 text-base font-bold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-foreground-dim">{subtitle}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
