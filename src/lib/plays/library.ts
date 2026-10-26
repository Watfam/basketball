import type { DrawnLine, Frame, OffenseId, OffensePlayer } from "./types";

export type PlayCategory = "man" | "zone" | "blob" | "slob" | "fullCourt";
export const PLAY_CATEGORY_LABEL: Record<PlayCategory, string> = {
  man: "Man",
  zone: "Zone",
  blob: "BLOB",
  slob: "SLOB",
  fullCourt: "Full court",
};

export type LibraryTeam = "UConn" | "Auburn" | "Louisville" | "Generic";

export type LibraryPlay = {
  id: string;
  name: string;
  team: LibraryTeam;
  category: PlayCategory;
  /** Where this was sourced from, and how confident that sourcing is — shown in the playbook so nothing reads as more authoritative than it is. */
  source: string;
  frames: Frame[];
};

function o(id: OffenseId, x: number, y: number): OffensePlayer {
  return { id, pos: { x, y } };
}

let seq = 0;
function ln(type: DrawnLine["type"], color: DrawnLine["color"], points: { x: number; y: number }[]): DrawnLine {
  seq += 1;
  return { id: `lib${seq}`, type, color, points };
}

function play(
  id: string,
  name: string,
  team: LibraryTeam,
  category: PlayCategory,
  source: string,
  frames: Frame[]
): LibraryPlay {
  return { id, name, team, category, source, frames };
}

/**
 * A small, illustrated playbook. Every play here shows offense only (no defenders) — these are
 * publicly-documented actions, not a scouted defense's reaction to them, so drawing defenders would
 * mean inventing a defense nobody confirmed. Each play's `source` says plainly how solid the
 * attribution is: a named, move-by-move breakdown of real film is marked as such; where that kind of
 * detail was not publicly available for a given team, the entry says so and is either a standard,
 * unattributed action (not claimed as that team's own) or built from the team's publicly stated
 * stylistic principles rather than a specific sourced play.
 */
export const LIBRARY_PLAYS: LibraryPlay[] = [
  // ---------------------------------------------------------------- UConn (Dan Hurley) — man sets
  play("uconn-hilo", "Middle Pin Hi-Lo", "UConn", "man",
    "Hoop Vision, \"the UConn playbook\" — move-by-move breakdown of a 2023 possession for Adama Sanogo.",
    [
      {
        offense: [o("O1", 25, 34), o("O2", 14, 21), o("O3", 38, 21), o("O4", 44, 9), o("O5", 25, 9)],
        defense: [],
        ballHolder: "O1",
        lines: [
          ln("screen", "offense", [{ x: 25, y: 9 }, { x: 19, y: 13 }]),
          ln("cut", "offense", [{ x: 14, y: 21 }, { x: 20, y: 18 }]),
          ln("pass", "offense", [{ x: 25, y: 34 }, { x: 20, y: 18 }]),
        ],
        note: "Sanogo pins down in the restricted area for the wing, then ducks into the post.",
      },
      {
        offense: [o("O1", 25, 30), o("O2", 20, 18), o("O3", 38, 21), o("O4", 44, 9), o("O5", 30, 8)],
        defense: [],
        ballHolder: "O5",
        lines: [],
        note: "Hi-lo feed off the duck-in — post touch for Sanogo near the rim.",
      },
    ]
  ),

  play("uconn-dho-rip", "DHO and Rip", "UConn", "man",
    "Hoop Vision, \"the UConn playbook\" — move-by-move breakdown of a 2023 possession for Adama Sanogo.",
    [
      {
        offense: [o("O1", 14, 30), o("O5", 25, 19), o("O2", 38, 24), o("O3", 10, 10), o("O4", 40, 10)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("pass", "offense", [{ x: 14, y: 30 }, { x: 25, y: 19 }])],
        note: "Entry pass to Sanogo at the elbow.",
      },
      {
        offense: [o("O1", 23, 19), o("O5", 25, 19), o("O2", 38, 24), o("O3", 10, 10), o("O4", 40, 10)],
        defense: [],
        ballHolder: "O1",
        lines: [
          ln("screen", "offense", [{ x: 23, y: 19 }, { x: 27, y: 16 }]),
          ln("cut", "offense", [{ x: 25, y: 19 }, { x: 30, y: 8 }]),
        ],
        note: "Dribble handoff back to the point guard, who immediately sets a rip screen.",
      },
      {
        offense: [o("O1", 21, 17), o("O5", 30, 8), o("O2", 38, 24), o("O3", 10, 10), o("O4", 40, 10)],
        defense: [],
        ballHolder: "O5",
        lines: [],
        note: "The rip screen clears Sanogo to the opposite block for the post touch.",
      },
    ]
  ),

  play("uconn-buckeye-slip", "Buckeye Slip", "UConn", "man",
    "Hoop Vision, \"the UConn playbook\" — move-by-move breakdown of a 2023 possession (Newton/Karaban/Sanogo).",
    [
      {
        offense: [o("O1", 25, 30), o("O2", 14, 22), o("O3", 36, 22), o("O4", 44, 10), o("O5", 25, 9)],
        defense: [],
        ballHolder: "O1",
        lines: [
          ln("screen", "offense", [{ x: 25, y: 9 }, { x: 19, y: 15 }]),
          ln("cut", "offense", [{ x: 25, y: 30 }, { x: 14, y: 26 }]),
        ],
        note: "Newton cuts weak side off a screen from Sanogo; the ball swings back to him.",
      },
      {
        offense: [o("O1", 14, 26), o("O2", 14, 22), o("O3", 36, 22), o("O4", 44, 10), o("O5", 22, 17)],
        defense: [],
        ballHolder: "O1",
        lines: [
          ln("screen", "offense", [{ x: 22, y: 17 }, { x: 18, y: 20 }]),
          ln("cut", "offense", [{ x: 22, y: 17 }, { x: 25, y: 9 }]),
        ],
        note: "Karaban steps up to ball-screen for Newton, then slips the screen before it is even set.",
      },
      {
        offense: [o("O1", 16, 22), o("O2", 14, 22), o("O3", 36, 22), o("O4", 44, 10), o("O5", 25, 9)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("pass", "offense", [{ x: 16, y: 22 }, { x: 25, y: 9 }])],
        note: "The defense has to respect the ball screen for a beat — Karaban slips behind it for the layup.",
      },
    ]
  ),

  play("uconn-lob-jackson", "Lob for Jackson", "UConn", "man",
    "Hoop Vision, \"the UConn playbook\" — move-by-move breakdown of a 2023 possession.",
    [
      {
        offense: [o("O1", 25, 32), o("O2", 10, 20), o("O3", 40, 20), o("O4", 25, 9), o("O5", 18, 8)],
        defense: [],
        ballHolder: "O1",
        lines: [
          ln("pass", "offense", [{ x: 25, y: 32 }, { x: 40, y: 20 }]),
          ln("screen", "offense", [{ x: 25, y: 9 }, { x: 31, y: 11 }]),
        ],
        note: "Jackson passes to the wing and sets a rub screen for Karaban coming off the opposite side.",
      },
      {
        offense: [o("O1", 25, 28), o("O2", 10, 20), o("O3", 40, 20), o("O4", 29, 12), o("O5", 25, 9)],
        defense: [],
        ballHolder: "O3",
        lines: [
          ln("screen", "offense", [{ x: 25, y: 28 }, { x: 19, y: 25 }]),
          ln("cut", "offense", [{ x: 29, y: 12 }, { x: 14, y: 20 }]),
        ],
        note: "Newton runs Karaban off a triple screen to clear that whole side of the floor.",
      },
      {
        offense: [o("O1", 19, 25), o("O2", 10, 20), o("O3", 40, 20), o("O4", 14, 20), o("O5", 18, 8)],
        defense: [],
        ballHolder: "O3",
        lines: [ln("pass", "offense", [{ x: 40, y: 20 }, { x: 18, y: 8 }])],
        note: "Karaban sets the final screen on the lob defender — alley-oop for Jackson at the rim.",
      },
    ]
  ),

  play("uconn-flare-slip", "Horns Flare Slip", "UConn", "man",
    "Confirmed from two independent sources: a named breakdown (\"the 4 [Karaban] sets the flare screen for [Spencer]... Karaban's defender jumps out to switch, worried about the 3PA... Karaban then slips to the rim for a pass and finish\") plus a separately-found clip titled \"UConn's Flare to Slip Action.\" UConn's own playbook is also documented chaining flare action with Zoom in other possessions (lesson titles like \"horns : flare : zoom\"), but no move-by-move source confirmed a Zoom step inside this specific sequence, so none is drawn here — the direct skip to the slipping big is the confirmed read.",
    [
      {
        offense: [o("O1", 25, 30), o("O4", 22, 14), o("O3", 30, 20), o("O2", 6, 20), o("O5", 44, 9)],
        defense: [],
        ballHolder: "O1",
        lines: [
          ln("screen", "offense", [{ x: 22, y: 14 }, { x: 27, y: 17 }]),
          ln("cut", "offense", [{ x: 30, y: 20 }, { x: 44, y: 14 }]),
          ln("cut", "offense", [{ x: 22, y: 14 }, { x: 28, y: 9 }]),
          ln("pass", "offense", [{ x: 25, y: 30 }, { x: 28, y: 9 }]),
        ],
        note: "Horns flare: O4 screens for the shooter, then slips it the instant the defense switches onto him — direct skip to the short corner instead.",
      },
      {
        offense: [o("O1", 25, 26), o("O4", 28, 9), o("O3", 44, 14), o("O2", 6, 20), o("O5", 44, 9)],
        defense: [],
        ballHolder: "O4",
        lines: [ln("dribble", "offense", [{ x: 28, y: 9 }, { x: 25, y: 6 }])],
        note: "The slip beats the switch — catch in the short corner, one dribble from the rim.",
      },
      {
        offense: [o("O1", 25, 26), o("O4", 25, 6), o("O3", 44, 14), o("O2", 6, 20), o("O5", 44, 9)],
        defense: [],
        ballHolder: "O4",
        lines: [],
        note: "Finish at the rim.",
      },
    ]
  ),

  // ------------------------------------------------------------- Auburn (Bruce Pearl) — man + BLOB
  play("auburn-flex", "Flex Continuity", "Auburn", "man",
    "Hoop Vision, \"the Auburn flex\" (HV Weekly), plus briangeisinger.substack.com \"Big Flex\" — both move-by-move breakdowns of real Auburn possessions, stitched into the fuller continuity those breakdowns describe (shallow cut, flex cut, screen-the-screener, then the two-man ball-screen game and its flare-screen counter) rather than stopping at the first read.",
    [
      {
        offense: [o("O1", 25, 32), o("O5", 32, 22), o("O2", 8, 9), o("O4", 20, 9), o("O3", 42, 12)],
        defense: [],
        ballHolder: "O1",
        lines: [
          ln("cut", "offense", [{ x: 32, y: 22 }, { x: 10, y: 20 }]),
          ln("screen", "offense", [{ x: 20, y: 9 }, { x: 14, y: 9 }]),
          ln("cut", "offense", [{ x: 8, y: 9 }, { x: 22, y: 9 }]),
        ],
        note: "2-3 alignment: the top player (O5) cuts shallow to the weak slot while the corner (O2) flex-cuts off the baseline screen.",
      },
      {
        offense: [o("O1", 25, 30), o("O5", 10, 20), o("O2", 22, 9), o("O4", 20, 9), o("O3", 42, 12)],
        defense: [],
        ballHolder: "O1",
        lines: [
          ln("screen", "offense", [{ x: 22, y: 9 }, { x: 28, y: 9 }]),
          ln("cut", "offense", [{ x: 42, y: 12 }, { x: 18, y: 9 }]),
          ln("screen", "offense", [{ x: 20, y: 9 }, { x: 24, y: 13 }]),
          ln("cut", "offense", [{ x: 22, y: 9 }, { x: 28, y: 22 }]),
        ],
        note: "Screen the screener: O2 screens away for O3 cutting through, then immediately curls back out off a pindown from O4.",
      },
      {
        offense: [o("O1", 25, 28), o("O5", 10, 20), o("O2", 28, 22), o("O4", 24, 13), o("O3", 18, 9)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("cut", "offense", [{ x: 28, y: 22 }, { x: 22, y: 26 }])],
        note: "O2 clears out further to the top to set up the ball-screen two-man game with the point guard.",
      },
      {
        offense: [o("O1", 25, 28), o("O5", 10, 20), o("O2", 22, 26), o("O4", 24, 13), o("O3", 18, 9)],
        defense: [],
        ballHolder: "O1",
        lines: [
          ln("screen", "offense", [{ x: 22, y: 26 }, { x: 25, y: 26 }]),
          ln("dribble", "offense", [{ x: 25, y: 28 }, { x: 30, y: 23 }]),
        ],
        note: "O2 sets the ball screen for the point guard — downhill drive off the two-man game.",
      },
      {
        offense: [o("O1", 30, 23), o("O5", 10, 20), o("O2", 25, 26), o("O4", 24, 13), o("O3", 18, 9)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("pass", "offense", [{ x: 30, y: 23 }, { x: 10, y: 20 }])],
        note: "The drive collapses the defense — kick out to O5 for the catch-and-shoot three.",
      },
      {
        offense: [o("O1", 30, 23), o("O5", 10, 20), o("O2", 25, 26), o("O4", 24, 13), o("O3", 18, 9)],
        defense: [],
        ballHolder: "O5",
        lines: [],
        note: "Catch-and-shoot three off the delayed close-out.",
      },
    ]
  ),

  play("auburn-zoom", "Zoom Action", "Auburn", "man",
    "The Auburn Observer, \"How Auburn basketball's offense zoomed into a new era vs. Baylor\" — named, move-by-move breakdown of a 2024-25 possession (Broome/Johnson/Jones), extended through to the finish the same breakdown describes rather than stopping at the handoff.",
    [
      {
        offense: [o("O1", 25, 32), o("O4", 25, 19), o("O2", 18, 9), o("O3", 40, 22), o("O5", 32, 9)],
        defense: [],
        ballHolder: "O4",
        lines: [
          ln("screen", "offense", [{ x: 32, y: 9 }, { x: 26, y: 12 }]),
          ln("cut", "offense", [{ x: 18, y: 9 }, { x: 25, y: 19 }]),
        ],
        note: "Broome has the ball at the top; O5 pin-downs for O2, who curls up toward the ball.",
      },
      {
        offense: [o("O1", 25, 32), o("O4", 25, 19), o("O2", 24, 20), o("O3", 40, 22), o("O5", 30, 8)],
        defense: [],
        ballHolder: "O4",
        lines: [ln("dribble", "offense", [{ x: 25, y: 19 }, { x: 21, y: 18 }])],
        note: "Broome dribbles at O2 for the handoff, creating two-side spacing.",
      },
      {
        offense: [o("O1", 25, 32), o("O4", 21, 18), o("O2", 21, 18), o("O3", 40, 22), o("O5", 30, 8)],
        defense: [],
        ballHolder: "O2",
        lines: [
          ln("dribble", "offense", [{ x: 21, y: 18 }, { x: 18, y: 9 }]),
          ln("cut", "offense", [{ x: 30, y: 8 }, { x: 25, y: 7 }]),
        ],
        note: "Handoff complete — O2 attacks downhill off the Zoom action, collapsing the defense toward the rim.",
      },
      {
        offense: [o("O1", 25, 30), o("O4", 21, 18), o("O2", 18, 9), o("O3", 40, 22), o("O5", 25, 7)],
        defense: [],
        ballHolder: "O2",
        lines: [ln("pass", "offense", [{ x: 18, y: 9 }, { x: 25, y: 7 }])],
        note: "The drive draws O5's defender off him — dish for the finish at the rim.",
      },
      {
        offense: [o("O1", 25, 30), o("O4", 21, 18), o("O2", 18, 9), o("O3", 40, 22), o("O5", 25, 7)],
        defense: [],
        ballHolder: "O5",
        lines: [],
        note: "Finish at the rim off the Zoom action.",
      },
    ]
  ),

  play("auburn-flare", "Flare Counter", "Auburn", "man",
    "The Auburn Observer, \"How Auburn basketball's offense zoomed into a new era vs. Baylor\" — named, move-by-move breakdown (Jasper/Williams/Green).",
    [
      {
        offense: [o("O3", 25, 30), o("O1", 14, 20), o("O4", 36, 18), o("O2", 10, 10), o("O5", 40, 10)],
        defense: [],
        ballHolder: "O3",
        lines: [ln("dribble", "offense", [{ x: 25, y: 30 }, { x: 18, y: 22 }])],
        note: "O3 drives middle off the dribble, collapsing the defense toward the paint.",
      },
      {
        offense: [o("O3", 18, 22), o("O1", 14, 20), o("O4", 36, 18), o("O2", 10, 10), o("O5", 40, 10)],
        defense: [],
        ballHolder: "O3",
        lines: [
          ln("screen", "offense", [{ x: 36, y: 18 }, { x: 40, y: 14 }]),
          ln("pass", "offense", [{ x: 18, y: 22 }, { x: 44, y: 10 }]),
        ],
        note: "O4 flares out to the corner off a screen as the drive draws help — kick-out for three.",
      },
      {
        offense: [o("O3", 18, 22), o("O1", 14, 20), o("O4", 44, 10), o("O2", 10, 10), o("O5", 40, 10)],
        defense: [],
        ballHolder: "O4",
        lines: [],
        note: "Open corner three off the flare.",
      },
    ]
  ),

  play("auburn-blob-14lob", "1-4 Flat Lob", "Auburn", "blob",
    "Successknocks.com coaching breakdown names Auburn's use of \"1-4 flat stacks for lob plays\" on BLOB, without move-by-move detail — the alignment and action below is a standard way to run that call, not a confirmed exact diagram.",
    [
      {
        offense: [o("O3", 25, 2), o("O1", 14, 9), o("O2", 20, 9), o("O4", 30, 9), o("O5", 36, 9)],
        defense: [],
        ballHolder: "O3",
        lines: [
          ln("screen", "offense", [{ x: 20, y: 9 }, { x: 24, y: 9 }]),
          ln("cut", "offense", [{ x: 30, y: 9 }, { x: 25, y: 7 }]),
          ln("pass", "offense", [{ x: 25, y: 2 }, { x: 25, y: 7 }]),
        ],
        note: "1-4 flat along the foul line. O2 screens across for O4, who cuts to the rim for the lob.",
      },
      {
        offense: [o("O3", 25, 2), o("O1", 14, 9), o("O2", 24, 9), o("O4", 25, 7), o("O5", 36, 9)],
        defense: [],
        ballHolder: "O4",
        lines: [],
        note: "Lob finished at the rim.",
      },
    ]
  ),

  // --------------------------------------------------------- Louisville (Pat Kelsey) — style-based
  play("louisville-5out-flow", "5-Out Flow", "Louisville", "man",
    "Built from Kelsey's publicly stated system (SI/On3/Half Court Hoops reporting on his 5-out, pace-and-space principles at Charleston and Louisville) — a representative possession, not a specific sourced diagram.",
    [
      {
        offense: [o("O1", 25, 32), o("O2", 10, 20), o("O3", 40, 20), o("O4", 6, 10), o("O5", 44, 10)],
        defense: [],
        ballHolder: "O1",
        lines: [
          ln("pass", "offense", [{ x: 25, y: 32 }, { x: 10, y: 20 }]),
          ln("cut", "offense", [{ x: 25, y: 32 }, { x: 25, y: 20 }]),
        ],
        note: "Five-out spacing — no post. Ball reverses to the wing as O1 cuts through to the opposite corner.",
      },
      {
        offense: [o("O1", 44, 10), o("O2", 10, 20), o("O3", 40, 20), o("O4", 6, 10), o("O5", 44, 10)],
        defense: [],
        ballHolder: "O2",
        lines: [],
        note: "Floor stays spaced for the next side ball screen or drive-and-kick.",
      },
    ]
  ),

  play("louisville-5out-ballscreen", "5-Out Ball-Screen Attack", "Louisville", "man",
    "Built from Kelsey's publicly stated system (pace, spacing, high three-point volume) — a representative possession, not a specific sourced diagram.",
    [
      {
        offense: [o("O1", 25, 30), o("O2", 10, 20), o("O3", 40, 20), o("O4", 6, 10), o("O5", 44, 10)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("screen", "offense", [{ x: 40, y: 20 }, { x: 32, y: 26 }])],
        note: "O3 relocates up to set a ball screen for O1 with the floor spaced five-out.",
      },
      {
        offense: [o("O1", 32, 20), o("O2", 10, 20), o("O3", 36, 24), o("O4", 6, 10), o("O5", 44, 10)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("pass", "offense", [{ x: 32, y: 20 }, { x: 44, y: 10 }])],
        note: "Downhill off the screen, draws the help, kicks to the corner for three.",
      },
      {
        offense: [o("O1", 32, 20), o("O2", 10, 20), o("O3", 36, 24), o("O4", 6, 10), o("O5", 44, 10)],
        defense: [],
        ballHolder: "O5",
        lines: [],
        note: "Catch-and-shoot three in the corner.",
      },
    ]
  ),

  // ------------------------------------------------------------- Generic category fillers
  play("generic-zone-131", "1-3-1 vs 2-3: Pin and Skip", "Generic", "zone",
    "Standard zone-offense action (coachesclipboard.net, basketballforcoaches.com) — not attributed to UConn, Auburn, or Louisville specifically; included to cover the zone-offense category with a legitimate, well-documented action.",
    [
      {
        offense: [o("O1", 25, 32), o("O2", 10, 20), o("O3", 40, 20), o("O4", 25, 12), o("O5", 40, 10)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("pass", "offense", [{ x: 25, y: 32 }, { x: 10, y: 20 }])],
        note: "1-3-1 alignment against a 2-3 zone. Ball goes to the wing.",
      },
      {
        offense: [o("O1", 25, 28), o("O2", 10, 20), o("O3", 40, 20), o("O4", 25, 12), o("O5", 40, 10)],
        defense: [],
        ballHolder: "O2",
        lines: [
          ln("cut", "offense", [{ x: 25, y: 12 }, { x: 25, y: 12 }]),
          ln("pass", "offense", [{ x: 10, y: 20 }, { x: 6, y: 9 }]),
        ],
        note: "The weak-side post stays put and back-screens the low defender as the ball skips to the weak corner.",
      },
      {
        offense: [o("O1", 25, 28), o("O2", 10, 20), o("O3", 40, 20), o("O4", 25, 12), o("O5", 6, 9)],
        defense: [],
        ballHolder: "O5",
        lines: [],
        note: "Open three in the corner — the skip pass beats the zone's rotation.",
      },
    ]
  ),

  play("generic-slob-box", "Box Set", "Generic", "slob",
    "Standard SLOB alignment (coachesclipboard.net, teachhoops.com) — a widely-used quick-hitter, not attributed to any of the three programs specifically.",
    [
      {
        offense: [o("O1", 2, 42), o("O2", 20, 9), o("O3", 30, 9), o("O4", 20, 19), o("O5", 30, 19)],
        defense: [],
        ballHolder: "O1",
        lines: [
          ln("screen", "offense", [{ x: 20, y: 19 }, { x: 20, y: 24 }]),
          ln("cut", "offense", [{ x: 20, y: 9 }, { x: 14, y: 22 }]),
        ],
        note: "Box alignment. O4 screens for O2, who pops out to the sideline for the inbound.",
      },
      {
        offense: [o("O1", 2, 42), o("O2", 14, 22), o("O3", 30, 9), o("O4", 20, 19), o("O5", 30, 19)],
        defense: [],
        ballHolder: "O2",
        lines: [],
        note: "Safe entry — offense into the half-court set.",
      },
    ]
  ),

  play("generic-pressbreak-4across", "4-Across vs 2-2-1", "Generic", "fullCourt",
    "Standard press-break structure (coachesclipboard.net) — a widely-used press break, not attributed to any of the three programs specifically.",
    [
      {
        offense: [o("O1", 25, 80), o("O2", 6, 60), o("O3", 44, 60), o("O4", 15, 45), o("O5", 35, 45)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("pass", "offense", [{ x: 25, y: 80 }, { x: 6, y: 60 }])],
        note: "Four across against the 2-2-1. Inbound to the side, away from the middle trap.",
      },
      {
        offense: [o("O1", 25, 70), o("O2", 6, 60), o("O3", 44, 60), o("O4", 25, 42), o("O5", 35, 45)],
        defense: [],
        ballHolder: "O2",
        lines: [ln("pass", "offense", [{ x: 6, y: 60 }, { x: 25, y: 42 }])],
        note: "O4 flashes to the middle for the quick pass up the gut, splitting the trap.",
      },
      {
        offense: [o("O1", 25, 70), o("O2", 6, 60), o("O3", 44, 60), o("O4", 25, 42), o("O5", 35, 45)],
        defense: [],
        ballHolder: "O4",
        lines: [],
        note: "Numbers advantage the rest of the way up the floor.",
      },
    ]
  ),
];
