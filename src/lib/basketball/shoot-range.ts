import { parseRange, type ProgressRange } from "./progress-range.ts";

/**
 * The date range of the Shoot tab's history. With no range in the address it is the season, as it always was; from Today or Progress it is whatever
 * the player chose (7 days, 4 weeks, season, all time, or one week or a custom pair of dates). Pure, so the rules are tested.
 */
export type ShootSearch = { range?: string | string[]; from?: string | string[]; to?: string | string[] };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export type ShootRange = {
  /** The chosen range, or null for the default (the season). */
  sel: ProgressRange | null;
  /** How far back the sets are read: the season, or as far as the chosen range reaches if that is earlier; null reads everything. */
  readFrom: Date | null;
  inRange: (startedAtIso: string) => boolean;
  /** The parts of the address that carry the range, to keep on every link. */
  keep: Record<string, string>;
  label: string;
};

export function resolveShootRange(sp: ShootSearch, season: Date, now: Date = new Date()): ShootRange {
  const raw = { range: first(sp.range), from: first(sp.from), to: first(sp.to) };
  const sel = raw.range || raw.from || raw.to ? parseRange(raw, now) : null;
  const readFrom = sel ? (sel.from === null ? null : sel.from < season ? sel.from : season) : season;
  const inRange = (iso: string) => {
    const at = new Date(iso);
    return sel ? (!sel.from || at >= sel.from) && (!sel.to || at <= sel.to) : at >= season;
  };
  const keep: Record<string, string> = sel ? (sel.key === "custom" ? { ...(raw.from ? { from: raw.from } : {}), ...(raw.to ? { to: raw.to } : {}) } : { range: sel.key }) : {};
  const label = sel ? sel.label : `This season, since ${season.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  return { sel, readFrom, inRange, keep, label };
}

/** A link to the Shoot tab: the range is kept unless the caller gives its own parts. */
export function shootHref(playerId: string, extra: Record<string, string>, base: Record<string, string>): string {
  const q = new URLSearchParams({ ...base, ...extra }).toString();
  return `/players/${playerId}/shooting${q ? `?${q}` : ""}`;
}
