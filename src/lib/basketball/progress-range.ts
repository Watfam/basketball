/** The date range every progress screen is looking at. Pure, so it is the same on the server and in tests. */
export type RangeKey = "7d" | "4w" | "12w" | "season" | "all" | "custom";
export type ProgressRange = { key: RangeKey; from: Date | null; to: Date | null; label: string };

export const RANGE_CHOICES: { key: Exclude<RangeKey, "custom">; label: string }[] = [
  { key: "7d", label: "7 days" },
  { key: "4w", label: "4 weeks" },
  { key: "12w", label: "12 weeks" },
  { key: "season", label: "Season" },
  { key: "all", label: "All time" },
];

const DAY = 24 * 60 * 60 * 1000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (s: string): Date | null => {
  if (!ISO_DAY.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
};
const shortDay = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

/** The season starts on 1 August, as the shooting history already treats it. */
export function seasonStartOf(now: Date): Date {
  return new Date(now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1, 7, 1);
}

export function parseRange(sp: { range?: string | null; from?: string | null; to?: string | null }, now: Date = new Date()): ProgressRange {
  if (sp.from || sp.to) {
    let from = sp.from ? day(sp.from) : null, to = sp.to ? day(sp.to) : null;
    if (from || to) {
      if (from && to && from > to) [from, to] = [to, from];
      const end = to ? new Date(to.getTime() + DAY - 1) : null;
      return { key: "custom", from, to: end, label: `${from ? shortDay(from) : "the start"} to ${to ? shortDay(to) : "today"}` };
    }
  }
  switch (sp.range) {
    case "7d": return { key: "7d", from: new Date(now.getTime() - 7 * DAY), to: null, label: "Last 7 days" };
    case "4w": return { key: "4w", from: new Date(now.getTime() - 28 * DAY), to: null, label: "Last 4 weeks" };
    case "season": return { key: "season", from: seasonStartOf(now), to: null, label: "This season" };
    case "all": return { key: "all", from: null, to: null, label: "All time" };
    default: return { key: "12w", from: new Date(now.getTime() - 84 * DAY), to: null, label: "Last 12 weeks" };
  }
}

/** The link for a range, keeping the other parts of the address. */
export function rangeParams(r: ProgressRange): Record<string, string> {
  if (r.key === "custom") {
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { ...(r.from ? { from: iso(r.from) } : {}), ...(r.to ? { to: iso(new Date(r.to.getTime() - DAY + 1)) } : {}) };
  }
  return { range: r.key };
}

/** The moment this many days ago. */
export const daysAgo = (days: number, now: Date = new Date()): Date => new Date(now.getTime() - days * DAY);
