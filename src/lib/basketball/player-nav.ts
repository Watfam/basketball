/**
 * The player area's bottom-bar destinations, as in the design review
 * (docs/camera-shot-counting-plan.md): Shoot sits in the middle, one thumb
 * away from anywhere. The hub keeps its own Today / Progress / Film /
 * Profile tabs inside Home.
 */
export type PlayerTab = {
  key: "home" | "train" | "shoot" | "film" | "me";
  label: string;
  href: (playerId: string) => string;
};

export const PLAYER_TABS: PlayerTab[] = [
  { key: "home", label: "Home", href: (id) => `/players/${id}` },
  { key: "train", label: "Train", href: (id) => `/players/${id}/workouts` },
  { key: "shoot", label: "Shoot", href: (id) => `/players/${id}/shooting` },
  { key: "film", label: "Film", href: (id) => `/players/${id}/film` },
  { key: "me", label: "Me", href: (id) => `/players/${id}?tab=profile` },
];

/** Which tab a path belongs to, or null outside the player area. */
export function activePlayerTab(pathname: string, playerId: string, search = ""): PlayerTab["key"] | null {
  const base = `/players/${playerId}`;
  if (!pathname.startsWith(base)) return null;
  const rest = pathname.slice(base.length).replace(/\/$/, "");
  if (rest.startsWith("/shooting")) return "shoot";
  if (rest.startsWith("/film")) return "film";
  if (rest.startsWith("/workouts") || rest.startsWith("/programs") || rest === "/sessions") return "train";
  if (rest.startsWith("/assessments") || (rest === "" && new URLSearchParams(search).get("tab") === "profile")) return "me";
  return "home";
}

/**
 * Screens meant to fill the phone with nothing to tap by mistake: a
 * workout being run, the assessment, the combine.
 */
export function isImmersivePlayerRoute(pathname: string): boolean {
  return /^\/players\/[^/]+\/(sessions\/[^/]+|assessment|combine)\/?$/.test(pathname);
}
