/** The opening frame a new scouting diagram starts from, so the coach is moving five dots into place rather than building a court from nothing. */
import { FORMATIONS } from "@/lib/plays/formations";
import type { DefensePlayer, Frame, OffensePlayer } from "@/lib/plays/types";
import { SCOUT_SECTION_BY_KEY, type ScoutSectionKey } from "./report";

function formation(id: string) {
  const f = FORMATIONS.find((x) => x.id === id);
  if (!f) throw new Error(`Unknown formation ${id}`);
  return f;
}

function fromFormation(id: string, withDefense: boolean): Frame {
  const f = formation(id);
  const defense: DefensePlayer[] =
    withDefense && f.defense ? f.defense.map((d) => ({ id: d.id, man: d.man, coverage: "manual" as const, manualPos: d.pos })) : [];
  return { offense: f.offense.map((o) => ({ ...o })), defense, ballHolder: "O1", lines: [], note: "" };
}

const BLOB_OFFENSE: OffensePlayer[] = [
  { id: "O1", pos: { x: 25, y: -1.4 } },
  { id: "O2", pos: { x: 19, y: 19 } },
  { id: "O3", pos: { x: 31, y: 19 } },
  { id: "O4", pos: { x: 19, y: 8 } },
  { id: "O5", pos: { x: 31, y: 8 } },
];

export function defaultScoutFrames(section: ScoutSectionKey): Frame[] {
  const side = SCOUT_SECTION_BY_KEY[section].diagram?.side ?? "offense";
  if (section === "blob_defense") {
    const zone = formation("2-3-zone");
    return [
      {
        offense: BLOB_OFFENSE,
        defense: (zone.defense ?? []).map((d) => ({ id: d.id, man: d.man, coverage: "manual" as const, manualPos: d.pos })),
        ballHolder: "O1",
        lines: [],
        note: "",
      },
    ];
  }
  if (section === "blob_offense" || section === "slob") return [{ offense: BLOB_OFFENSE, defense: [], ballHolder: "O1", lines: [], note: "" }];
  if (section === "defense_half") return [fromFormation("2-3-zone", true)];
  if (section === "defense_full") return [fromFormation("man-shell", true)];
  return [fromFormation("5-out", side === "defense")];
}
