/**
 * The scouting note document. It lives in the existing hoops.scouting_notes.notes jsonb column, so
 * no migration is needed: every section is a flat string key (the three original keys —
 * personnel, tendencies, game_plan — keep their names, so an older note still opens as-is), and the
 * structured extras (game date, the player cards, the drawn diagrams) sit beside them.
 */
import type { Frame } from "@/lib/plays/types";

export type ScoutSectionKey =
  | "tip"
  | "defense_half"
  | "defense_full"
  | "offense"
  | "ball_screen"
  | "transition"
  | "blob_offense"
  | "blob_defense"
  | "slob"
  | "personnel"
  | "tendencies"
  | "game_plan";

/** Which side of the ball the opponent is on in a section's diagrams — drives the legend line under each one. */
export type ScoutSide = "offense" | "defense";

export type ScoutSectionDef = {
  key: ScoutSectionKey;
  label: string;
  placeholder: string;
  /** Sections that can hold diagrams, and whose side the opponent is on. */
  diagram?: { side: ScoutSide; hint: string };
};

/** In the order a coach thinks through film — and the order the form shows them. */
export const SCOUT_SECTIONS: ScoutSectionDef[] = [
  {
    key: "tip",
    label: "Tip ball",
    placeholder: "Where they tip it, who jumps, what we do about it",
    diagram: { side: "offense", hint: "Their tip alignment" },
  },
  {
    key: "defense_half",
    label: "Defense: half court",
    placeholder: "Their zones and man looks, one per line — what each one gives up",
    diagram: { side: "defense", hint: "Their half-court defense" },
  },
  {
    key: "defense_full",
    label: "Defense: full court",
    placeholder: "Their press, when they run it, how to beat it",
    diagram: { side: "defense", hint: "Their press" },
  },
  {
    key: "offense",
    label: "Offense",
    placeholder: "What they run, who it runs through, how they get shots — and how we guard it",
    diagram: { side: "offense", hint: "Their sets" },
  },
  {
    key: "ball_screen",
    label: "Ball screens",
    placeholder: "How they run it (who screens, where), how they guard ours (drop, hedge, switch, trap), and how we cover theirs",
    diagram: { side: "offense", hint: "Their ball-screen action" },
  },
  {
    key: "transition",
    label: "Transition",
    placeholder: "How fast they run, who leaks out, where the first pass goes, and how we get back",
    diagram: { side: "offense", hint: "Their transition" },
  },
  {
    key: "blob_offense",
    label: "BLOB offense",
    placeholder: "Their baseline out-of-bounds plays, one per line",
    diagram: { side: "offense", hint: "Their BLOB sets" },
  },
  {
    key: "blob_defense",
    label: "BLOB defense",
    placeholder: "How they guard our baseline out-of-bounds",
    diagram: { side: "defense", hint: "How they guard our BLOB" },
  },
  {
    key: "slob",
    label: "SLOB / sideline out-of-bounds",
    placeholder: "Their sideline plays and how they guard ours",
    diagram: { side: "offense", hint: "Their SLOB sets" },
  },
  {
    key: "personnel",
    label: "Personnel overview",
    placeholder: "The group as a whole — size, speed, who the game runs through (individual players go in the cards below)",
  },
  {
    key: "game_plan",
    label: "Our game plan",
    placeholder: "One line per point — the first ones become the keys on the front page",
  },
  {
    key: "tendencies",
    label: "Other tendencies",
    placeholder: "Anything else — transition, late-game habits, how the bench plays",
  },
];

export const SCOUT_SECTION_BY_KEY = Object.fromEntries(SCOUT_SECTIONS.map((s) => [s.key, s])) as Record<ScoutSectionKey, ScoutSectionDef>;

export type ScoutPlayer = {
  id: string;
  number: string;
  name: string;
  /** A few words: "Best player", "Sixth man". */
  label: string;
  tendencies: string;
  /** How we guard him. */
  plan: string;
  position: string;
  /** "5' 9\"" as MaxPreps prints it. */
  height: string;
  /** "Fr.", "So.", "8th". */
  grade: string;
  /** Shooting hand — "R" or "L". Drives how we shade him. */
  hand: "" | "R" | "L";
  /** A one-line stat summary, e.g. "16.0 PPG (1 GP)". */
  stats: string;
};

/** One tile in the front-page numbers strip: Record, Points/game, and whatever else the coach adds. */
export type ScoutStat = { id: string; label: string; value: string };

export type ScoutDiagram = {
  id: string;
  section: ScoutSectionKey;
  title: string;
  caption: string;
  frames: Frame[];
};

export type ScoutDoc = {
  gameDate: string;
  /** One line that sums the opponent up — printed large on the report cover. */
  headline: string;
  /** Where the numbers came from, so one tap refreshes them. */
  maxprepsUrl: string;
  teamStats: ScoutStat[];
  sections: Record<ScoutSectionKey, string>;
  players: ScoutPlayer[];
  diagrams: ScoutDiagram[];
};

const SECTION_KEYS = SCOUT_SECTIONS.map((s) => s.key);
const DIAGRAM_SECTION_KEYS = new Set(SCOUT_SECTIONS.filter((s) => s.diagram).map((s) => s.key));

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function isFrame(f: unknown): f is Frame {
  if (!f || typeof f !== "object") return false;
  const fr = f as Partial<Frame>;
  return Array.isArray(fr.offense) && Array.isArray(fr.defense) && Array.isArray(fr.lines) && typeof fr.ballHolder === "string";
}

/** Reads whatever is in the notes column — an older three-key note, a v2 document, or nothing — into a complete document. Never throws. */
export function parseScoutingNotes(raw: unknown): ScoutDoc {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const sections = Object.fromEntries(SECTION_KEYS.map((k) => [k, str(obj[k])])) as Record<ScoutSectionKey, string>;

  const players: ScoutPlayer[] = Array.isArray(obj.players)
    ? (obj.players as unknown[]).flatMap((p, i) => {
        if (!p || typeof p !== "object") return [];
        const r = p as Record<string, unknown>;
        const hand = str(r.hand);
        return [
          {
            id: str(r.id) || `p${i}`,
            number: str(r.number),
            name: str(r.name),
            label: str(r.label),
            tendencies: str(r.tendencies),
            plan: str(r.plan),
            position: str(r.position),
            height: str(r.height),
            grade: str(r.grade),
            hand: hand === "R" || hand === "L" ? hand : "",
            stats: str(r.stats),
          } satisfies ScoutPlayer,
        ];
      })
    : [];

  const teamStats: ScoutStat[] = Array.isArray(obj.teamStats)
    ? (obj.teamStats as unknown[]).flatMap((t, i) => {
        if (!t || typeof t !== "object") return [];
        const r = t as Record<string, unknown>;
        return str(r.label).trim() || str(r.value).trim() ? [{ id: str(r.id) || `t${i}`, label: str(r.label), value: str(r.value) }] : [];
      })
    : [];

  const diagrams: ScoutDiagram[] = Array.isArray(obj.diagrams)
    ? (obj.diagrams as unknown[]).flatMap((d, i) => {
        if (!d || typeof d !== "object") return [];
        const r = d as Record<string, unknown>;
        const section = str(r.section) as ScoutSectionKey;
        if (!DIAGRAM_SECTION_KEYS.has(section) || !Array.isArray(r.frames) || !r.frames.length || !r.frames.every(isFrame)) return [];
        return [{ id: str(r.id) || `d${i}`, section, title: str(r.title), caption: str(r.caption), frames: r.frames as Frame[] }];
      })
    : [];

  return { gameDate: str(obj.gameDate), headline: str(obj.headline), maxprepsUrl: str(obj.maxprepsUrl), teamStats, sections, players, diagrams };
}

/** The jsonb that goes back into the notes column. */
export function serializeScoutingNotes(doc: ScoutDoc): Record<string, unknown> {
  return { v: 2, gameDate: doc.gameDate, headline: doc.headline, maxprepsUrl: doc.maxprepsUrl, teamStats: doc.teamStats, ...doc.sections, players: doc.players, diagrams: doc.diagrams };
}

/** Non-empty lines of a section's text, with any leading bullet stripped. */
export function sectionLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
}

/** True when a section has anything to print — text, or a diagram that belongs to it. */
export function sectionHasContent(doc: ScoutDoc, key: ScoutSectionKey): boolean {
  return sectionLines(doc.sections[key]).length > 0 || doc.diagrams.some((d) => d.section === key);
}

export function formatGameDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

/** What the notes list shows under the opponent's name. */
export function notePreview(raw: unknown): string {
  const doc = parseScoutingNotes(raw);
  return doc.headline || sectionLines(doc.sections.game_plan)[0] || sectionLines(doc.sections.personnel)[0] || sectionLines(doc.sections.tendencies)[0] || "";
}
