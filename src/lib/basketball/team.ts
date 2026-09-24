/**
 * Coach & Team Tools domain types and small helpers.
 *
 * The one real design decision here: a roster entry doesn't require a
 * full Hardwood Lab player profile. Real rosters run ten to fifteen kids
 * deep and most of those families will never sign up for this app, so
 * team_members can carry a bare name (roster_name/roster_position)
 * instead of a player_id — see migration 0015. Once linked to a real
 * profile, that row reads from the profile instead.
 */

export type RosterMember = {
  id: string;
  role: string;
  jersey_number: string | null;
  player_id: string | null;
  roster_name: string | null;
  roster_position: string | null;
  roster_linked_player_id: string | null;
  // Joined in from hoops.players when player_id is set.
  players?: { id: string; display_name: string; primary_position: string | null } | null;
};

/** The name to show for a roster row, whichever shape it is. */
export function rosterDisplayName(member: RosterMember): string {
  return member.players?.display_name ?? member.roster_name ?? "Unnamed player";
}

export function rosterPosition(member: RosterMember): string | null {
  return member.players?.primary_position ?? member.roster_position ?? null;
}

/** True when this row has a real Hardwood Lab profile behind it. */
export function isLinkedMember(member: RosterMember): boolean {
  return Boolean(member.player_id);
}

/**
 * Sorts a roster the way a coach actually scans one: jersey number first
 * (numeric, not lexical — "9" before "10"), unnumbered players last,
 * alphabetical within each group.
 */
export function sortRoster<T extends RosterMember>(members: T[]): T[] {
  return [...members].sort((a, b) => {
    const an = a.jersey_number ? Number(a.jersey_number) : null;
    const bn = b.jersey_number ? Number(b.jersey_number) : null;
    if (an !== null && bn !== null && !Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
    if (an !== null) return -1;
    if (bn !== null) return 1;
    return rosterDisplayName(a).localeCompare(rosterDisplayName(b));
  });
}
