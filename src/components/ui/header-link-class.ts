import { cx } from "./cx";

/** The small-caps link in a screen's top bar. The padding (cancelled by negative margin) gives a 44 px tall tap area without changing the layout. */
export function headerLinkClass(tone: "dim" | "accent" = "dim", className?: string) {
  return cx(
    "-my-3 inline-flex items-center py-3 text-[11px] font-extrabold uppercase tracking-[0.14em] transition-colors",
    tone === "accent" ? "text-accent hover:text-accent-hover" : "text-foreground-dim hover:text-foreground",
    className
  );
}
