/**
 * The team area's bottom-bar destinations.
 *
 * Five tabs, matching how a coach actually thinks about a team: what is
 * happening next, what we are running, when we play, how it is going, and
 * who we are playing. Replaces the tile grid that used to sit on the team
 * hub — with a bar, every destination is one tap from anywhere.
 *
 * The first tab keeps the key "roster" (its route is still the team hub,
 * which still holds the roster) but reads "Today", because that hub now
 * leads with the next practice or game rather than the roster.
 */
export type TeamTab = {
  key: "roster" | "practice" | "games" | "history" | "scouting";
  label: string;
  href: (teamId: string) => string;
};

export const TEAM_TABS: TeamTab[] = [
  { key: "roster", label: "Today", href: (id) => `/teams/${id}` },
  { key: "practice", label: "Practice", href: (id) => `/teams/${id}/practice` },
  { key: "games", label: "Games", href: (id) => `/teams/${id}/games` },
  { key: "history", label: "History", href: (id) => `/teams/${id}/practice/history` },
  { key: "scouting", label: "Scouting", href: (id) => `/teams/${id}/scouting` },
];

/**
 * Which tab a path belongs to. Order matters: History lives *under*
 * /practice/history, so it has to be matched before Practice or every
 * history page would light up the Practice tab instead.
 *
 * Returns null for paths outside the team area entirely.
 */
export function activeTeamTab(pathname: string, teamId: string): TeamTab["key"] | null {
  const base = `/teams/${teamId}`;
  if (!pathname.startsWith(base)) return null;

  const rest = pathname.slice(base.length).replace(/\/$/, "");

  if (rest === "" || rest === "/edit") return "roster";
  if (rest.startsWith("/practice/history")) return "history";
  if (rest.startsWith("/practice")) return "practice";
  if (rest.startsWith("/games")) return "games";
  if (rest.startsWith("/scouting")) return "scouting";
  return null;
}

/**
 * Run Practice is a full-screen, one-drill-at-a-time mode meant to be
 * read across a gym — a nav bar competing for that space (and one
 * mis-tap away from dumping the coach out mid-practice) has no business
 * there. Same reasoning as the player-facing session player.
 */
export function isImmersiveTeamRoute(pathname: string): boolean {
  return pathname.endsWith("/run");
}
