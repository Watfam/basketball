/** Which of our plays get tested against which of their defenses, and the grid of results. */
import type { LibraryPlay } from "@/lib/plays/library";
import type { ScoutDoc } from "@/lib/scouting/report";
import { isUsableDefenseDiagram, MAN_MODEL, scoutedModel, type DefenseModel } from "./defense-model";
import { simulateMatchup, type MatchupSummary, type SimMode } from "./engine";

export type PlayGroup = "half" | "blob" | "slob" | "press";

export const PLAY_GROUP_LABEL: Record<PlayGroup, string> = {
  half: "Half-court offense",
  blob: "Baseline out of bounds",
  slob: "Sideline out of bounds",
  press: "Press break",
};

/** Defensive categories are the other side of the ball, so they never get tested as our offense. */
const DEFENSIVE = new Set(["defense", "defenseSystem"]);

export function groupFor(play: Pick<LibraryPlay, "category" | "frames">): PlayGroup | null {
  if (DEFENSIVE.has(play.category)) return null;
  const first = play.frames[0];
  if (!first || !first.offense.length) return null;
  if (play.category === "fullCourt" || Math.max(...first.offense.map((o) => o.pos.y)) > 50) return "press";
  if (play.category === "blob") return "blob";
  if (play.category === "slob") return "slob";
  return "half";
}

export type DefenseOption = { key: string; label: string; model: DefenseModel; scouted: boolean };

/** The defenses a play in this group is tested against: every set they drew for that situation, plus ordinary man-to-man where it applies. */
export function defensesFor(group: PlayGroup, doc: ScoutDoc): DefenseOption[] {
  const drawn = (section: "defense_half" | "defense_full" | "blob_defense", kind: "zone" | "press" | "blob") =>
    doc.diagrams
      .filter((d) => d.section === section && isUsableDefenseDiagram(d))
      .map((d): DefenseOption => ({ key: d.id, label: d.title, model: scoutedModel(d, kind), scouted: true }));
  const man: DefenseOption = { key: "man", label: "Man-to-man (generic)", model: MAN_MODEL, scouted: false };
  if (group === "press") return drawn("defense_full", "press");
  if (group === "blob") return [...drawn("blob_defense", "blob"), man];
  return [...drawn("defense_half", "zone"), man];
}

export const modeFor = (group: PlayGroup): SimMode => (group === "press" ? "press" : "half");

/** Below this much of the play happening where their diagram shows something, the number is a guess and the screens say so instead of rating it. */
export const RELIABLE = 0.5;

export type Cell = { defenseKey: string; summary: MatchupSummary };
export type Row = { play: LibraryPlay; group: PlayGroup; cells: Cell[] };
export type Grid = {
  rows: Row[];
  defenses: Record<PlayGroup, DefenseOption[]>;
};

export function runGrid(plays: LibraryPlay[], doc: ScoutDoc): Grid {
  const defenses: Grid["defenses"] = {
    half: defensesFor("half", doc),
    blob: defensesFor("blob", doc),
    slob: defensesFor("slob", doc),
    press: defensesFor("press", doc),
  };
  const rows: Row[] = [];
  for (const play of plays) {
    const group = groupFor(play);
    if (!group) continue;
    const cells = defenses[group].map((d) => ({
      defenseKey: d.key,
      summary: simulateMatchup(play.frames, d.model, modeFor(group), `${play.id}|${d.key}`).summary,
    }));
    if (cells.length) rows.push({ play, group, cells });
  }
  return { rows, defenses };
}

export type DefenseReport = {
  defense: DefenseOption;
  group: PlayGroup;
  best: { play: LibraryPlay; summary: MatchupSummary }[];
  worst: { play: LibraryPlay; summary: MatchupSummary }[];
  average: number;
};

/** For each defense, the plays that beat it and the ones to keep in the folder. */
export function reportByDefense(grid: Grid): DefenseReport[] {
  const out: DefenseReport[] = [];
  for (const group of Object.keys(grid.defenses) as PlayGroup[]) {
    for (const defense of grid.defenses[group]) {
      const entries = grid.rows
        .filter((r) => r.group === group)
        .flatMap((r) => {
          const cell = r.cells.find((c) => c.defenseKey === defense.key);
          return cell && cell.summary.confidence >= RELIABLE ? [{ play: r.play, summary: cell.summary }] : [];
        })
        .sort((a, b) => b.summary.ppp - a.summary.ppp);
      if (!entries.length) continue;
      const avg = entries.reduce((a, e) => a + e.summary.ppp, 0) / entries.length;
      out.push({ defense, group, best: entries.slice(0, 3), worst: entries.slice(-2).reverse(), average: avg });
    }
  }
  return out;
}

export type DefenseProfile = { turnover: number; openLook: number; advance: number; ppp: number; plays: number };

/** What a defense does to the whole playbook on average: how often it forces a turnover, how often it leaves a shooter open, and how often the press gets beaten. */
export function defenseProfile(grid: Grid, group: PlayGroup, defenseKey: string): DefenseProfile | null {
  const cells = grid.rows
    .filter((r) => r.group === group)
    .flatMap((r) => r.cells.filter((c) => c.defenseKey === defenseKey && c.summary.confidence >= RELIABLE).map((c) => c.summary));
  if (cells.length < 3) return null;
  const avg = (f: (s: MatchupSummary) => number) => cells.reduce((a, s) => a + f(s), 0) / cells.length;
  return { turnover: avg((s) => s.pTurnover), openLook: avg((s) => s.pOpenLook), advance: avg((s) => s.pAdvance), ppp: avg((s) => s.ppp), plays: cells.length };
}
