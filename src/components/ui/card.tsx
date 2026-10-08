import Link from "next/link";
import type { ComponentProps } from "react";
import { cx } from "./cx";

/**
 * The standard surface: white card, hairline border, large radius. Padding
 * is the caller's, because lists (rows edge to edge) and panels (p-4/p-5)
 * both use it.
 */
export const cardClass = "rounded-2xl border border-line bg-surface";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx(cardClass, className)} {...props} />;
}

export function CardSection({ className, ...props }: ComponentProps<"section">) {
  return <section className={cx(cardClass, className)} {...props} />;
}

/** A whole card that is a link: the border lifts on hover. */
export function CardLink({ className, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      className={cx(cardClass, "block transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-accent", className)}
      {...props}
    />
  );
}

/** The small caps label above a card's content ("THIS SEASON", "COUNT YOUR SHOTS"). */
export function Eyebrow({ className, ...props }: ComponentProps<"p">) {
  return <p className={cx("text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute", className)} {...props} />;
}
