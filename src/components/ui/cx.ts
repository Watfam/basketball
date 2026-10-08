import { twMerge } from "tailwind-merge";

/**
 * Join class names, skipping empty ones. Later classes win over earlier
 * ones for the same property (tailwind-merge), so a screen can pass
 * `py-4` or `rounded-xl` to a primitive and get it: plain joining leaves
 * both, and which one applies then depends on stylesheet order, not on
 * which was written last.
 */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return twMerge(parts.filter(Boolean).join(" "));
}
