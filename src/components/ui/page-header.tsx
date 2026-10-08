import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

/**
 * The sticky bar at the top of a screen: a way back on the left, the
 * screen's own links on the right. The same on every screen, so "back" is
 * always in the same place.
 */
export function PageHeader({
  back,
  children,
  width = "lg",
}: {
  /** Where back goes, and what it says (the name of the place, e.g. the team or player). */
  back?: { href: string; label: ReactNode };
  /** Right-hand links. */
  children?: ReactNode;
  /** The content column the header lines up with. */
  width?: "md" | "lg";
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-background/85 px-5 py-3 backdrop-blur">
      <div className={cx("mx-auto flex w-full items-center justify-between gap-4", width === "md" ? "max-w-md" : "max-w-lg")}>
        {back ? <HeaderLink href={back.href}>← {back.label}</HeaderLink> : <span />}
        {children && <div className="flex items-center gap-4">{children}</div>}
      </div>
    </header>
  );
}

/**
 * Small caps header link. The padding (cancelled by negative margin) gives
 * a 44 px tall tap area without changing the layout.
 */
export function HeaderLink({
  tone = "dim",
  className,
  ...props
}: { tone?: "dim" | "accent" } & ComponentProps<typeof Link>) {
  return (
    <Link
      className={cx(
        "-my-3 inline-flex items-center py-3 text-[11px] font-extrabold uppercase tracking-[0.14em] transition-colors",
        tone === "accent" ? "text-accent hover:text-accent-hover" : "text-foreground-dim hover:text-foreground",
        className
      )}
      {...props}
    />
  );
}
