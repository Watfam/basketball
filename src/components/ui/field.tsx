import type { ComponentProps } from "react";
import { cx } from "./cx";

/** Text inputs, selects and text areas share one look. */
export const fieldClass =
  "w-full rounded-lg border border-line bg-raised px-3 py-2.5 text-base text-foreground placeholder:text-foreground-mute focus:border-accent focus:outline-none sm:text-sm";

// 16 px on phones: iOS zooms into any input with smaller text when it's focused.

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(fieldClass, className)} {...props} />;
}

export function TextArea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(fieldClass, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(fieldClass, className)} {...props} />;
}

/** Error text under a form. */
export function FormError({ className, ...props }: ComponentProps<"p">) {
  return <p role="alert" className={cx("text-xs font-semibold text-danger", className)} {...props} />;
}
