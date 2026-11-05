/**
 * Applies a team's saved play order (an array of library play ids, in order) on top of a play
 * list — a play present in `order` sorts to its position there; a play absent from it (new in the
 * library since the team last customized, or never touched) keeps its original relative position,
 * appended after every explicitly-ordered play. Array.prototype.sort is stable in every engine this
 * app runs on, so "both unranked" ties preserve input order without any extra bookkeeping.
 */
export function applyPlayOrder<T extends { id: string }>(plays: T[], order: string[]): T[] {
  if (!order.length) return plays;
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...plays].sort((a, b) => {
    const ra = rank.get(a.id);
    const rb = rank.get(b.id);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return 0;
  });
}

/**
 * Swaps two ids' positions within a full order array — this is how moving a play up/down within
 * one category's displayed group turns into a change to the team's one global order list, without
 * disturbing any other category's relative order. `currentOrder` should already be every play's id
 * in its current display order (what the page is showing right now), so there's always a well
 * defined position for both ids even if the team has never explicitly saved an order before.
 */
export function swapInOrder(currentOrder: string[], a: string, b: string): string[] {
  const full = [...currentOrder];
  const ia = full.indexOf(a);
  const ib = full.indexOf(b);
  if (ia < 0 || ib < 0) return full;
  [full[ia], full[ib]] = [full[ib], full[ia]];
  return full;
}
