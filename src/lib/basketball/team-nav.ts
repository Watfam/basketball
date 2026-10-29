/**
 * The team area's bottom-bar destinations.
 *
 * Four tabs on the bar itself, matching the iPhone norm (five slots, one
 * reserved for More) instead of cramming all six destinations into one
 * row. History and Scouting — the two a coach reaches for less often than
 * the daily loop of planning, running, and reviewing a team — live behind
 * the More tab instead; see TEAM_MORE_TABS.
 *
 * The first tab keeps the key "roster" (its route is still the team hub,
 * which still holds the roster) but reads "Today", because that hub now
 * leads with the next practice or game rather than the roster.
 *
 * Plays points at the playbook list, not straight into the designer — the
 * designer is a full-bleed, nav-free canvas (its own toolbar owns the
 * bottom strip), so landing there the instant this tab is tapped felt like
 * being dropped into a different app. The list is an ordinary page with
 * this same bottom bar; opening an actual play from it is what earns the
 * jump into the immersive designer.
 */
export type TeamTab = {
  key: "roster" | "practice" | "games" | "history" | "scouting" | "plays";
  label: string;
  href: (teamId: string) => string;
};

export const TEAM_TABS: TeamTab[] = [
  { key: "roster", label: "Today", href: (id) => `/teams/${id}` },
  { key: "practice", label: "Practice", href: (id) => `/teams/${id}/practice` },
  { key: "games", label: "Games", href: (id) => `/teams/${id}/games` },
  { key: "plays", label: "Plays", href: (id) => `/teams/${id}/plays/playbook` },
];

/** The destinations tucked behind the bottom bar's More tab. */
export const TEAM_MORE_TABS: TeamTab[] = [
  { key: "history", label: "Practice history", href: (id) => `/teams/${id}/practice/history` },
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
  if (rest.startsWith("/plays")) return "plays";
  return null;
}

/**
 * Run Practice is a full-screen, one-drill-at-a-time mode meant to be
 * read across a gym — a nav bar competing for that space (and one
 * mis-tap away from dumping the coach out mid-practice) has no business
 * there. Same reasoning as the player-facing session player.
 *
 * The play designer is the same shape for the same reason: its own bottom
 * toolbar (Move/Pass/Cut/Dribble/Screen) already owns that strip of the
 * screen, and the court above it is drawn edge to edge.
 */
export function isImmersiveTeamRoute(pathname: string): boolean {
  return pathname.endsWith("/run") || pathname.endsWith("/plays");
}
