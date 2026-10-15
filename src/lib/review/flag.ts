/**
 * The session-review feature flag. OFF unless this phone's local storage holds "1" under hl:session-review.
 * Turn on:  localStorage.setItem("hl:session-review", "1")      Turn off: localStorage.removeItem("hl:session-review")
 * With the flag off nothing here runs: the camera records no review data and the review screen shows no entry point.
 */
export const SESSION_REVIEW_KEY = "hl:session-review";

export function sessionReviewEnabled(read: (key: string) => string | null = defaultRead): boolean {
  try {
    return read(SESSION_REVIEW_KEY) === "1";
  } catch {
    return false;
  }
}

function defaultRead(key: string): string | null {
  return typeof window === "undefined" ? null : window.localStorage.getItem(key);
}
