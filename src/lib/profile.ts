/**
 * Who is using the app on this phone: one of the household's players, or
 * the coach. Chosen once on the front door (/) and remembered, so nothing
 * later asks "who's shooting?" again. Changed only from the front door,
 * or by opening a player's or team's page directly (a shared link), which
 * makes that the active profile.
 *
 * Kept in a cookie so server pages can read it, and nowhere else. It is a
 * convenience, not a permission: the kids share the parent login, so any
 * profile on this phone can open any other (see the 0020 migration notes).
 */
export const PROFILE_COOKIE = "hl_profile";

export type Profile = { kind: "player"; playerId: string } | { kind: "coach"; teamId: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeProfile(p: Profile): string {
  return p.kind === "player" ? `player:${p.playerId}` : `coach:${p.teamId ?? ""}`;
}

export function parseProfile(value: string | undefined | null): Profile | null {
  if (!value) return null;
  const [kind, id = ""] = value.split(":");
  if (kind === "player" && UUID.test(id)) return { kind: "player", playerId: id };
  if (kind === "coach") return { kind: "coach", teamId: UUID.test(id) ? id : null };
  return null;
}

/** Where a profile's home is. */
export function profileHome(p: Profile): string {
  if (p.kind === "player") return `/players/${p.playerId}`;
  return p.teamId ? `/teams/${p.teamId}` : "/teams/new";
}
