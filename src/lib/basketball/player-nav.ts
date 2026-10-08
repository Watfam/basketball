/**
 * The player area's bottom bar: four tabs, one job each.
 *
 * - Today: the one thing to do next, and this week.
 * - Shoot: count a set; the camera will live here too.
 * - Train: workouts, programs and film (film is learning, so it trains).
 * - Me: the player card, progress, level, history.
 *
 * It used to be five tabs on top of the home screen's own four inner tabs,
 * with Film and Me in both.
 */
export type PlayerTab = {
  key: "today" | "shoot" | "train" | "me";
  label: string;
  href: (playerId: string) => string;
};

export const PLAYER_TABS: PlayerTab[] = [
  { key: "today", label: "Today", href: (id) => `/players/${id}` },
  { key: "shoot", label: "Shoot", href: (id) => `/players/${id}/shooting` },
  { key: "train", label: "Train", href: (id) => `/players/${id}/workouts` },
  { key: "me", label: "Me", href: (id) => `/players/${id}/me` },
];

/** Which tab a path belongs to, or null outside the player area. */
export function activePlayerTab(pathname: string, playerId: string, search = ""): PlayerTab["key"] | null {
  const base = `/players/${playerId}`;
  if (!pathname.startsWith(base)) return null;
  const rest = pathname.slice(base.length).replace(/\/$/, "");
  if (rest.startsWith("/shooting")) return "shoot";
  if (rest.startsWith("/workouts") || rest.startsWith("/programs") || rest.startsWith("/film") || rest === "/sessions") {
    return "train";
  }
  if (rest.startsWith("/me") || rest.startsWith("/assessments") || (rest === "" && new URLSearchParams(search).get("tab") === "profile")) {
    return "me";
  }
  return "today";
}

/**
 * Screens meant to fill the phone with nothing to tap by mistake: a
 * workout being run, the assessment, the combine.
 */
export function isImmersivePlayerRoute(pathname: string): boolean {
  return /^\/players\/[^/]+\/(sessions\/[^/]+|assessment|combine)\/?$/.test(pathname);
}
