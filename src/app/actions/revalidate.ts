import { revalidatePath } from "next/cache";

/**
 * The player hub and history list read workout sessions, so any action
 * that starts, finishes or discards one has to purge the client's cached
 * copy of them - otherwise navigating straight back would show a stale
 * streak or a "Continue" banner for up to the router cache window.
 * Revalidates only those two page patterns, deliberately not the session
 * page itself: revalidating the page the caller is standing on makes the
 * action re-render it mid-workout.
 */
export function revalidatePlayerSessionViews() {
  revalidatePath("/players/[playerId]", "page");
  revalidatePath("/players/[playerId]/sessions", "page");
}
