/**
 * Where the player came from. Every screen the app shows is noted here, in this tab, so a Back button can go to the screen the player was
 * really on (the workout library, not always Train), and say its name. Pure, so the rules are tested.
 */
export const NAV_KEY = "hl:nav";
/** Fired after the record of screens changes, so a Back control shown before it changed reads it again. */
export const NAV_EVENT = "hl:nav-changed";
const MAX = 40;

/** Adds a screen (its path and query). The same screen twice in a row is one. */
export function pushScreen(stack: string[], url: string): string[] {
  if (stack[stack.length - 1] === url) return stack;
  return [...stack, url].slice(-MAX);
}

/** The player went back: drop the screen they left. */
export function popScreen(stack: string[]): string[] {
  return stack.length > 1 ? stack.slice(0, -1) : stack;
}

const pathOf = (url: string) => url.split("?")[0].replace(/\/$/, "") || "/";

/** Is `url` a screen inside `current` (a lesson inside the Film Room, the library inside Train)? Back never goes deeper. */
export const isInside = (url: string, current: string) => pathOf(url).startsWith(pathOf(current) + "/");

/**
 * The screen before `current`, or null when there is none to go back to: the app was just opened here, or the last screen was one level
 * deeper than this one (it is a way in from here, so "back" from here is not to it: that is how a loop starts).
 */
export function screenBefore(stack: string[], current: string): string | null {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    if (pathOf(stack[i]) !== pathOf(current)) return isInside(stack[i], current) ? null : stack[i];
  }
  return null;
}

/** A navigation that replaces the current screen rather than adding one (the builder starting a workout) is noted before it happens. */
export const REPLACE_KEY = "hl:nav:replace";

/** What a screen is called in a Back button. Null for a screen with no good short name. */
export function screenName(url: string): string | null {
  const path = pathOf(url);
  const m = path.match(/^\/players\/[^/]+(\/.*)?$/);
  if (m) {
    const rest = m[1] ?? "";
    if (rest === "") return "Today";
    if (rest === "/workouts") return "Train";
    if (rest === "/workouts/library") return "Workouts";
    if (rest === "/workouts/build") return "Build";
    if (rest === "/film" || rest.startsWith("/film/")) return "Film room";
    if (rest === "/sessions") return "History";
    if (rest === "/shooting") return "Shoot";
    if (rest === "/me") return "Me";
    if (rest === "/progress") return "Progress";
    if (rest === "/assessments") return "Assessments";
    if (rest.startsWith("/programs/")) return "Program";
    return null;
  }
  if (path === "/coach") return "Coach home";
  if (path === "/") return "Home";
  return null;
}

/** Where a workout was started from, kept for the life of the session so leaving it goes back there. */
export const originKey = (sessionId: string) => `hl:origin:${sessionId}`;
