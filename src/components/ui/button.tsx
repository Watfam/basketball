import Link from "next/link";
import type { ComponentProps } from "react";
import { cx } from "./cx";

/**
 * The app's buttons. Every action that used to carry its own long class
 * string uses one of these, so a button looks and behaves the same on every
 * screen: one primary per screen (solid accent), secondaries outlined,
 * quiet actions as ghost text with a full-size tap area.
 *
 * Sizes: lg is the screen's main action (full width, 52 px tall); md is a
 * button in a row or a card (44 px); sm sits inside a list row or a header
 * and still has a 36 px tap area.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 text-center font-extrabold uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "border border-line-strong bg-surface text-foreground hover:border-accent hover:text-accent",
  ghost: "text-foreground-dim hover:text-foreground",
  danger: "border border-danger/40 text-danger hover:bg-danger/10",
};

const sizes: Record<ButtonSize, string> = {
  lg: "min-h-13 rounded-xl px-4 py-3.5 text-sm tracking-[0.12em]",
  md: "min-h-11 rounded-xl px-4 py-2.5 text-xs tracking-[0.1em]",
  sm: "min-h-9 rounded-lg px-3 py-1.5 text-[11px] tracking-[0.1em]",
};

/** The glow and press feedback only the main action gets. */
const lift = "shadow-lg shadow-[var(--glow)] active:scale-[0.99] disabled:shadow-none";

export function buttonClass({
  variant = "primary",
  size = "md",
  block = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
} = {}): string {
  return cx(base, variants[variant], sizes[size], variant === "primary" && size === "lg" && lift, block && "w-full", className);
}

type Style = { variant?: ButtonVariant; size?: ButtonSize; block?: boolean };

export function Button({
  variant,
  size,
  block,
  className,
  type = "button",
  ...props
}: Style & ComponentProps<"button">) {
  return <button type={type} className={buttonClass({ variant, size, block, className })} {...props} />;
}

export function ButtonLink({ variant, size, block, className, ...props }: Style & ComponentProps<typeof Link>) {
  return <Link className={buttonClass({ variant, size, block, className })} {...props} />;
}
