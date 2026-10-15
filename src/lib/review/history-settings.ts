/**
 * The player's opt-in for keeping tracking history. OFF unless the phone's local storage holds "1" under hl:history:retain AND the
 * session-review flag is on (flag.ts). Nothing is kept for a player who has not turned it on; turning it off stops new saving and leaves
 * what is already kept until it is deleted from the history screen.
 */
import { sessionReviewEnabled } from "./flag.ts";

export const HISTORY_RETAIN_KEY = "hl:history:retain";

export function historyRetentionEnabled(read: (key: string) => string | null = defaultRead): boolean {
  try {
    return sessionReviewEnabled(read) && read(HISTORY_RETAIN_KEY) === "1";
  } catch {
    return false;
  }
}
function defaultRead(key: string): string | null {
  return typeof window === "undefined" ? null : window.localStorage.getItem(key);
}
