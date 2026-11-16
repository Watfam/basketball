/**
 * Reads a team's public MaxPreps pages — the stats page for the record and points, the roster page
 * for name, grade, height and position, and each athlete's own page for their season line. MaxPreps
 * embeds all of it as JSON in the page, so there is nothing to scrape out of the markup. Every
 * parser here takes plain strings and returns plain data, so it can be tested without the network.
 */

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export type MaxPrepsPlayer = {
  number: string;
  name: string;
  grade: string;
  height: string;
  position: string;
  /** "16.0 PPG, 1 GP" — this season's line, with last season's when this one is a handful of games. */
  stats: string;
};

export type MaxPrepsTeam = {
  record: string;
  gamesPlayed: number;
  pointsFor: number;
  pointsAgainst: number;
  region: string;
  regionPlace: string;
  players: MaxPrepsPlayer[];
};

/** Accepts any MaxPreps team page for a level ("…/basketball/jv/stats/", "…/roster/") and returns the team's base path. */
export function teamBasePath(input: string): string | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || (u.hostname !== "www.maxpreps.com" && u.hostname !== "maxpreps.com")) return null;
  const m = /^(\/[a-z]{2}\/[^/]+\/[^/]+\/basketball(?:\/(?:jv|freshman|varsity))?)(?:\/|$)/.exec(u.pathname);
  return m ? m[1] : null;
}

export function nextData(html: string): Record<string, unknown> | null {
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  try {
    const props = (JSON.parse(m[1]) as { props?: { pageProps?: Record<string, unknown> } }).props;
    return props?.pageProps ?? null;
  } catch {
    return null;
  }
}

/** The streamed (React server component) payload of a page, decoded back to the JSON text it carries. */
export function flightText(html: string): string {
  let out = "";
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try {
      out += JSON.parse(m[1]) as string;
    } catch {
      // a chunk that does not decode is skipped; the rest is still usable
    }
  }
  return out;
}

type Raw = Record<string, unknown>;
const asStr = (v: unknown) => (typeof v === "string" ? v : "");

export function parseTeamStats(html: string): Pick<MaxPrepsTeam, "record" | "gamesPlayed" | "pointsFor" | "pointsAgainst" | "region" | "regionPlace"> | null {
  const page = nextData(html);
  const ctx = page?.teamContext as Raw | undefined;
  const standings = ctx?.standingsData as Raw | undefined;
  const overall = standings?.overallStanding as Raw | undefined;
  if (!overall) return null;
  const record = asStr(overall.overallWinLossTies);
  const games = record.split("-").reduce((n, x) => n + (Number.parseInt(x, 10) || 0), 0);
  const league = (standings?.leagueStanding as Raw | undefined) ?? {};
  return {
    record,
    gamesPlayed: games,
    pointsFor: Number(overall.points) || 0,
    pointsAgainst: Number(overall.pointsAgainst) || 0,
    region: asStr(league.leagueName),
    regionPlace: asStr(league.conferenceStandingPlacement),
  };
}

/** Roster rows are positional arrays; read them by what each slot holds, and refuse the page if the shape moved. */
export function parseRoster(html: string): { players: { number: string; name: string; height: string; grade: string; position: string; url: string }[]; seasonId: string } | null {
  const page = nextData(html);
  const rows = page?.athleteData;
  if (!Array.isArray(rows)) return null;
  const seasonId = asStr((page?.countData as Raw | undefined)?.sportSeasonId);
  const players = rows.flatMap((r) => {
    if (!Array.isArray(r)) return [];
    const url = r.find((x) => typeof x === "string" && /^https:\/\/www\.maxpreps\.com\/.+\/athletes\//.test(x));
    const name = asStr(r[34]);
    if (!url || !name) return [];
    return [{ number: asStr(r[8]), name, height: asStr(r[35]).replace(/\s+/g, ""), grade: asStr(r[37]), position: asStr(r[12]), url: url as string }];
  });
  return players.length ? { players, seasonId } : null;
}

type SeasonLine = { year: string; level: string; ssid: string; stats: Record<string, string> };

/** Every season entry on an athlete's page: which team-season it was, and the stat lines MaxPreps has for it. */
export function parseAthleteSeasons(html: string): SeasonLine[] {
  const text = flightText(html);
  const out: SeasonLine[] = [];
  for (const m of text.matchAll(/"teamLevel":"([^"]*)"[^]*?"year":"(\d\d-\d\d)"[^]*?"stats":\[/g)) {
    const start = (m.index ?? 0) + m[0].length - 1;
    let depth = 0;
    let end = -1;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (c === "[") depth++;
      else if (c === "]" && --depth === 0) {
        end = i;
        break;
      }
    }
    if (end < 0) continue;
    // "ssid" sits a little ahead of "teamLevel" in the same object — take the nearest one before this match.
    const before = text.slice(Math.max(0, (m.index ?? 0) - 400), m.index ?? 0);
    const ssid = [...before.matchAll(/"ssid":"([^"]+)"/g)].pop()?.[1] ?? "";
    let list: unknown;
    try {
      list = JSON.parse(text.slice(start, end + 1));
    } catch {
      continue;
    }
    if (!Array.isArray(list)) continue;
    const stats: Record<string, string> = {};
    for (const s of list as Raw[]) if (asStr(s.header)) stats[asStr(s.header)] = asStr(s.value);
    // Game-by-game entries share the same keys but carry no team-season id and no games-played line.
    if (!ssid || !stats.GP) continue;
    out.push({ year: m[2], level: m[1], ssid, stats });
  }
  return out;
}

const PER_GAME: [string, string][] = [
  ["P/G", "PPG"],
  ["Reb/G", "RPG"],
  ["Ast/G", "APG"],
  ["Stl/G", "SPG"],
  ["Blk/G", "BPG"],
];

function line(stats: Record<string, string>): string {
  const bits = PER_GAME.filter(([h]) => stats[h] && Number(stats[h]) > 0).map(([h, label]) => `${stats[h]} ${label}`);
  return bits.join(", ");
}

/**
 * This season's line, e.g. "16.0 PPG (1 GP)". When this season is only a few games the number is
 * noise, so last season's line rides along: "16.0 PPG (1 GP) · last season 11.2 PPG, 1.9 SPG (19 GP)".
 */
export function summarizeSeasons(seasons: SeasonLine[], seasonId: string): string {
  const now = seasons.find((s) => s.ssid === seasonId && Number(s.stats.GP) > 0);
  const prior = seasons
    .filter((s) => s.ssid !== seasonId && Number(s.stats.GP) > 0 && line(s.stats))
    .sort((a, b) => b.year.localeCompare(a.year))[0];
  const parts: string[] = [];
  if (now && line(now.stats)) parts.push(`${line(now.stats)} (${now.stats.GP} GP)`);
  if (prior && (!now || Number(now.stats.GP) < 8)) parts.push(`${now ? "last season " : "Last season "}${line(prior.stats)} (${prior.stats.GP} GP)`);
  return parts.join(" · ");
}

async function getHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(12_000), cache: "no-store" });
  if (!res.ok) throw new Error(`MaxPreps answered ${res.status}.`);
  return res.text();
}

/** Pulls the team numbers plus the listed players' names, sizes and stat lines. `wantNumbers` limits the per-player page fetches to the cards the coach has made. */
export async function fetchMaxPrepsTeam(inputUrl: string, wantNumbers: string[]): Promise<MaxPrepsTeam> {
  const base = teamBasePath(inputUrl);
  if (!base) throw new Error("That doesn't look like a MaxPreps team page. Paste the team's stats or roster link.");
  const origin = "https://www.maxpreps.com";
  const [statsHtml, rosterHtml] = await Promise.all([getHtml(`${origin}${base}/stats/`), getHtml(`${origin}${base}/roster/`)]);
  const team = parseTeamStats(statsHtml);
  const roster = parseRoster(rosterHtml);
  if (!team || !roster) throw new Error("MaxPreps changed its page layout, so the numbers couldn't be read.");

  const want = new Set(wantNumbers.map((n) => n.trim()).filter(Boolean));
  const players = await Promise.all(
    roster.players
      .filter((p) => want.has(p.number))
      .map(async (p): Promise<MaxPrepsPlayer> => {
        let stats = "";
        try {
          stats = summarizeSeasons(parseAthleteSeasons(await getHtml(p.url)), roster.seasonId);
        } catch {
          // a player page that fails still gives the name and size
        }
        return { number: p.number, name: p.name, grade: p.grade, height: p.height, position: p.position, stats };
      })
  );
  const { record, gamesPlayed, pointsFor, pointsAgainst, region, regionPlace } = team;
  return { record, gamesPlayed, pointsFor, pointsAgainst, region, regionPlace, players };
}
