import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRoster, parseTeamStats, summarizeSeasons, teamBasePath } from "./maxpreps";

const page = (props: unknown) => `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: props } })}</script></html>`;

test("only MaxPreps team pages are accepted, and any level page maps to the team's base path", () => {
  assert.equal(teamBasePath("https://www.maxpreps.com/al/fairfield/restoration-academy/basketball/jv/stats/"), "/al/fairfield/restoration-academy/basketball/jv");
  assert.equal(teamBasePath("https://www.maxpreps.com/al/fairfield/restoration-academy/basketball/roster/"), "/al/fairfield/restoration-academy/basketball");
  assert.equal(teamBasePath("https://evil.example/al/fairfield/restoration-academy/basketball/jv/stats/"), null);
  assert.equal(teamBasePath("http://www.maxpreps.com/al/fairfield/restoration-academy/basketball/jv/stats/"), null);
  assert.equal(teamBasePath("not a url"), null);
});

test("team numbers come from the standings block", () => {
  const t = parseTeamStats(
    page({ teamContext: { standingsData: { overallStanding: { overallWinLossTies: "4-0", points: 139, pointsAgainst: 57 }, leagueStanding: { leagueName: "AISA AA Region 2", conferenceStandingPlacement: "1st" } } } })
  );
  assert.deepEqual(t, { record: "4-0", gamesPlayed: 4, pointsFor: 139, pointsAgainst: 57, region: "AISA AA Region 2", regionPlace: "1st" });
  assert.equal(parseTeamStats("<html></html>"), null);
});

test("the roster is read by slot and refused when the shape moves", () => {
  const row = Array(40).fill("");
  row[8] = "2";
  row[34] = "Cortez Ruffin";
  row[35] = "5' 9\"";
  row[37] = "Fr.";
  row.push("https://www.maxpreps.com/al/x/athletes/cortez-ruffin/");
  const r = parseRoster(page({ athleteData: [row], countData: { sportSeasonId: "ssid-1" } }));
  assert.equal(r?.seasonId, "ssid-1");
  assert.deepEqual(r?.players[0], { number: "2", name: "Cortez Ruffin", height: "5'9\"", grade: "Fr.", position: "", url: "https://www.maxpreps.com/al/x/athletes/cortez-ruffin/" });
  assert.equal(parseRoster(page({ athleteData: "nope" })), null);
});

test("a small current sample carries last season's line; a full sample stands alone", () => {
  const cur = { year: "26-27", level: "JV", ssid: "now", stats: { GP: "1", "P/G": "16.0" } };
  const prev = { year: "25-26", level: "JV", ssid: "old", stats: { GP: "19", "P/G": "11.2", "Stl/G": "1.9" } };
  assert.equal(summarizeSeasons([cur, prev], "now"), "16.0 PPG (1 GP) · last season 11.2 PPG, 1.9 SPG (19 GP)");
  assert.equal(summarizeSeasons([{ ...cur, stats: { GP: "12", "P/G": "9.5" } }, prev], "now"), "9.5 PPG (12 GP)");
  assert.equal(summarizeSeasons([prev], "now"), "Last season 11.2 PPG, 1.9 SPG (19 GP)");
});
