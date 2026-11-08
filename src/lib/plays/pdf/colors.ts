/**
 * A fixed color per jersey number (1-5), the same on every page and every play — matching the
 * varsity team's own printed playbook (same five colors, same legend, repeated on every page) so a
 * player already used to that document recognizes "I'm always this color" immediately in this one
 * too. Different from the live in-app court (which colors by OFFENSE/DEFENSE team, since that
 * renderer usually has defenders to distinguish) — a printed BLOB page rarely shows defense at all,
 * so coloring by player number is the more useful convention here.
 */
export const PLAYER_COLORS: Record<string, string> = {
  O1: "#d6342c",
  O2: "#2565c7",
  O3: "#1f9e52",
  O4: "#e08a1e",
  O5: "#7a3fc4",
};

export const DEFENSE_COLOR = "#5b6475";
export const DEFENSE_TEXT = "#f3f4f6";
export const BALL_COLOR = "#e8580c";

export function playerColor(id: string): string {
  return PLAYER_COLORS[id] ?? "#333333";
}
