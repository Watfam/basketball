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
  /** Short situation tag shown as a subtitle in the list — "vs Man", "vs 2-3 Zone", "Baseline OB". */
  vs: string;
  /** Where this was sourced from, and how confident that sourcing is — shown in the playbook so nothing reads as more authoritative than it is. */
  source: string;
  /** Scannable coaching cues for this specific action — shown next to the diagram so a coach can read the whole play without stepping through every frame. */
  keys: string[];
  /** A real, verified YouTube video that shows or teaches this exact action. Left out rather than guessed at when nothing specific enough turned up — see the no-invented-URLs rule. */
  videoUrl?: string;
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
  vs: string,
  source: string,
  keys: string[],
  frames: Frame[],
  videoUrl?: string
): LibraryPlay {
  return { id, name, team, category, vs, source, keys, frames, videoUrl };
}

/**
 * A small, illustrated playbook. Every play here shows offense only (no defenders) — these are
 * publicly-documented actions, not a scouted defense's reaction to them, so drawing defenders would
 * mean inventing a defense nobody confirmed. Each play's `source` says plainly how solid the
 * attribution is: a named, move-by-move breakdown of real film is marked as such; where that kind of
 * detail was not publicly available for a given team, the entry says so and is either a standard,
 * unattributed action (not claimed as that team's own) or built from the team's publicly stated
 * stylistic principles rather than a specific sourced play. `videoUrl` is only ever a real link found
 * and checked against the play it is attached to — never a guess at what a matching video's address
 * might be.
 */
export const LIBRARY_PLAYS: LibraryPlay[] = [
  // ---------------------------------------------------------------- UConn (Dan Hurley) — man sets
  play("uconn-hilo", "Middle Pin Hi-Lo", "UConn", "man", "vs Man",
    "Hoop Vision, \"the UConn playbook\" — move-by-move breakdown of a 2023 possession for Adama Sanogo, played out here across the full pin-down-to-post-touch-to-finish sequence the breakdown describes rather than stopping partway through it.",
    [
      "Sanogo: hold the pin down until contact, then duck in — don't pop.",
      "Cutter: use the screen tight, shoulder to hip.",
      "Passer: hit the cutter on the move, then look inside immediately for the hi-lo.",
      "Hi-lo denied? Reverse the ball and start over, don't force it.",
    ],
    [
      {
        offense: [o("O1", 25, 34), o("O2", 14, 21), o("O3", 38, 21), o("O4", 44, 9), o("O5", 25, 12)],
        defense: [],
        ballHolder: "O1",
        lines: [],
        note: "2-3 alignment. Sanogo starts up high at the post, ready to pin down for Calcaterra.",
      },
      {
        offense: [o("O1", 25, 34), o("O2", 14, 21), o("O3", 38, 21), o("O4", 44, 9), o("O5", 22, 14)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("screen", "offense", [{ x: 22, y: 14 }, { x: 19, y: 15 }])],
        note: "Sanogo steps out and sets the pin down in the restricted area.",
      },
      {
        offense: [o("O1", 25, 34), o("O2", 20, 18), o("O3", 38, 21), o("O4", 44, 9), o("O5", 27, 9)],
        defense: [],
        ballHolder: "O1",
        lines: [
          ln("cut", "offense", [{ x: 14, y: 21 }, { x: 20, y: 18 }]),
          ln("cut", "offense", [{ x: 22, y: 14 }, { x: 27, y: 9 }]),
        ],
        note: "Calcaterra cuts hard off the screen toward the wing as Sanogo immediately ducks into the post behind him.",
      },
      {
        offense: [o("O1", 25, 30), o("O2", 20, 18), o("O3", 38, 21), o("O4", 44, 9), o("O5", 29, 8)],
        defense: [],
        ballHolder: "O2",
        lines: [ln("pass", "offense", [{ x: 25, y: 34 }, { x: 20, y: 18 }])],
        note: "Entry pass to Calcaterra on the move.",
      },
      {
        offense: [o("O1", 25, 30), o("O2", 20, 18), o("O3", 38, 21), o("O4", 44, 9), o("O5", 29, 8)],
        defense: [],
        ballHolder: "O5",
        lines: [ln("pass", "offense", [{ x: 20, y: 18 }, { x: 29, y: 8 }])],
        note: "Hi-lo feed off the duck-in — post touch for Sanogo near the rim.",
      },
      {
        offense: [o("O1", 25, 30), o("O2", 20, 18), o("O3", 38, 21), o("O4", 44, 9), o("O5", 26, 6)],
        defense: [],
        ballHolder: "O5",
        lines: [],
        note: "Sanogo turns over his inside shoulder to finish at the rim.",
      },
    ]
  ),

  play("uconn-dho-rip", "DHO and Rip", "UConn", "man", "vs Man",
    "Hoop Vision, \"the UConn playbook\" — move-by-move breakdown of a 2023 possession for Adama Sanogo, with the entry, handoff, rip screen, and finish each shown as its own beat.",
    [
      "Big man: hand it off at the hip, square up, then pivot straight into the rip screen.",
      "Guard: take the handoff on the move — don't stand and wait for it.",
      "Rip screener: set it moving toward the baseline, not standing still.",
      "Cutter: sprint off the rip — the defense is still recovering from the handoff.",
    ],
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
        ballHolder: "O5",
        lines: [ln("dribble", "offense", [{ x: 25, y: 19 }, { x: 23, y: 19 }])],
        note: "Newton comes back to Sanogo for the dribble handoff.",
      },
      {
        offense: [o("O1", 23, 19), o("O5", 25, 19), o("O2", 38, 24), o("O3", 10, 10), o("O4", 40, 10)],
        defense: [],
        ballHolder: "O1",
        lines: [
          ln("screen", "offense", [{ x: 23, y: 19 }, { x: 27, y: 16 }]),
          ln("cut", "offense", [{ x: 25, y: 19 }, { x: 30, y: 8 }]),
        ],
        note: "Handoff complete — Newton immediately turns to set the rip screen for Sanogo.",
      },
      {
        offense: [o("O1", 21, 17), o("O5", 30, 8), o("O2", 38, 24), o("O3", 10, 10), o("O4", 40, 10)],
        defense: [],
        ballHolder: "O1",
        lines: [],
        note: "The rip screen clears Sanogo across the lane to the opposite block.",
      },
      {
        offense: [o("O1", 21, 17), o("O5", 30, 8), o("O2", 38, 24), o("O3", 10, 10), o("O4", 40, 10)],
        defense: [],
        ballHolder: "O5",
        lines: [ln("pass", "offense", [{ x: 21, y: 17 }, { x: 30, y: 8 }])],
        note: "Post touch for Sanogo on the opposite block.",
      },
    ]
  ),

  play("uconn-buckeye-slip", "Buckeye Slip", "UConn", "man", "vs Man",
    "Hoop Vision, \"the UConn playbook\" — move-by-move breakdown of a 2023 possession (Newton/Karaban/Sanogo), with the weak-side cut, the slipped ball screen, and the finish each broken into their own beat.",
    [
      "First screener: hold just long enough to occupy the defender, then relocate.",
      "Second screener: only fake the screen — slip the instant the defense shows help.",
      "Ball handler: sell the ball screen with your eyes before the slip happens.",
      "Passer: find the slipping screener immediately — the window is one beat.",
    ],
    [
      {
        offense: [o("O1", 25, 30), o("O2", 14, 22), o("O3", 36, 22), o("O4", 44, 10), o("O5", 25, 9)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("screen", "offense", [{ x: 25, y: 9 }, { x: 19, y: 15 }])],
        note: "Sanogo sets the screen for Newton to cut weak side.",
      },
      {
        offense: [o("O1", 25, 30), o("O2", 14, 22), o("O3", 36, 22), o("O4", 44, 10), o("O5", 22, 17)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("cut", "offense", [{ x: 25, y: 30 }, { x: 14, y: 26 }])],
        note: "Newton cuts off the screen; Sanogo relocates to the slot for the ball-screen game.",
      },
      {
        offense: [o("O1", 14, 26), o("O2", 14, 22), o("O3", 36, 22), o("O4", 44, 10), o("O5", 22, 17)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("screen", "offense", [{ x: 22, y: 17 }, { x: 18, y: 20 }])],
        note: "The ball swings back to Newton — Karaban steps up as if to set the ball screen.",
      },
      {
        offense: [o("O1", 16, 23), o("O2", 14, 22), o("O3", 36, 22), o("O4", 44, 10), o("O5", 24, 12)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("cut", "offense", [{ x: 22, y: 17 }, { x: 25, y: 9 }])],
        note: "Karaban slips the screen before it is even set — the defense still has to respect it for a beat.",
      },
      {
        offense: [o("O1", 16, 22), o("O2", 14, 22), o("O3", 36, 22), o("O4", 44, 10), o("O5", 25, 9)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("pass", "offense", [{ x: 16, y: 22 }, { x: 25, y: 9 }])],
        note: "Newton finds Karaban slipping behind the screen.",
      },
      {
        offense: [o("O1", 16, 22), o("O2", 14, 22), o("O3", 36, 22), o("O4", 44, 10), o("O5", 25, 7)],
        defense: [],
        ballHolder: "O5",
        lines: [],
        note: "Layup off the slip.",
      },
    ]
  ),

  play("uconn-lob-jackson", "Lob for Jackson", "UConn", "man", "vs Man",
    "Hoop Vision, \"the UConn playbook\" — move-by-move breakdown of a 2023 possession, with the rub screen, the triple-screen clearout, and the lob broken into their own beats instead of compressed into two frames.",
    [
      "Clear out the whole strong side before the lob — spacing is what makes this work.",
      "Final screener: screen the lob defender's body, not just a spot on the floor.",
      "Lob passer: throw it above the rim, to the rim side, never behind.",
      "Finisher: time the cut so you catch in the air, not standing under it.",
    ],
    [
      {
        offense: [o("O1", 25, 32), o("O2", 10, 20), o("O3", 40, 20), o("O4", 25, 9), o("O5", 18, 8)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("pass", "offense", [{ x: 25, y: 32 }, { x: 40, y: 20 }])],
        note: "Jackson passes to the wing.",
      },
      {
        offense: [o("O1", 25, 28), o("O2", 10, 20), o("O3", 40, 20), o("O4", 25, 9), o("O5", 18, 8)],
        defense: [],
        ballHolder: "O3",
        lines: [ln("screen", "offense", [{ x: 25, y: 9 }, { x: 31, y: 11 }])],
        note: "Jackson sets a rub screen for Karaban coming off the opposite side.",
      },
      {
        offense: [o("O1", 25, 28), o("O2", 10, 20), o("O3", 40, 20), o("O4", 29, 12), o("O5", 25, 9)],
        defense: [],
        ballHolder: "O3",
        lines: [ln("cut", "offense", [{ x: 25, y: 9 }, { x: 29, y: 12 }])],
        note: "Karaban comes off the rub screen toward the ball side.",
      },
      {
        offense: [o("O1", 25, 28), o("O2", 10, 20), o("O3", 40, 20), o("O4", 14, 20), o("O5", 18, 8)],
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
        lines: [ln("cut", "offense", [{ x: 14, y: 20 }, { x: 19, y: 10 }])],
        note: "Karaban peels off the clearout and sets the final screen on the lob defender.",
      },
      {
        offense: [o("O1", 19, 25), o("O2", 10, 20), o("O3", 40, 20), o("O4", 19, 10), o("O5", 18, 8)],
        defense: [],
        ballHolder: "O5",
        lines: [ln("pass", "offense", [{ x: 40, y: 20 }, { x: 18, y: 8 }])],
        note: "Alley-oop lofted to Jackson at the rim.",
      },
    ]
  ),

  play("uconn-flare-slip", "Horns Flare Slip", "UConn", "man", "vs Man",
    "Confirmed from two independent sources: a named breakdown (\"the 4 [Karaban] sets the flare screen for [Spencer]... Karaban's defender jumps out to switch, worried about the 3PA... Karaban then slips to the rim for a pass and finish\") plus a separately-found clip titled \"UConn's Flare to Slip Action.\" UConn's own playbook is also documented chaining flare action with Zoom in other possessions (lesson titles like \"horns : flare : zoom\"), but no move-by-move source confirmed a Zoom step inside this specific sequence, so none is drawn here — the direct skip to the slipping big is the confirmed read.",
    [
      "Screener: sell the flare screen hard enough that the defense has to respect the three.",
      "The instant the defender jumps to switch, slip — don't wait to see if the switch happens.",
      "Passer: hit the short corner on the move, before help can rotate back.",
      "Finisher: one live dribble to the rim, not a standing catch-and-shoot.",
    ],
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
    ],
    "https://youtube.com/shorts/DZWPPWGTA7c"
  ),

  // ------------------------------------------------------------- Auburn (Bruce Pearl) — man + BLOB
  play("auburn-flex", "Flex Continuity", "Auburn", "man", "vs Man",
    "Hoop Vision, \"the Auburn flex\" (HV Weekly), plus briangeisinger.substack.com \"Big Flex\" — both move-by-move breakdowns of real Auburn possessions, stitched into the fuller continuity those breakdowns describe (shallow cut, flex cut, screen-the-screener, then the two-man ball-screen game and its flare-screen counter) rather than stopping at the first read. The linked video is a separate, confirmed X's-and-O's breakdown of this same flex system.",
    [
      "Cutters: walk your man in before you use the screen — set him up, don't just run the pattern.",
      "Down screener: screen low, then pop — never stand after setting it.",
      "Ball screen: screener sprints into it, wide base, holds until contact.",
      "Keep the floor balanced — two up, three in the flex spots at all times.",
    ],
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
    ],
    "https://www.youtube.com/watch?v=FBj8lJPW9io"
  ),

  play("auburn-zoom", "Zoom Action", "Auburn", "man", "vs Man",
    "The Auburn Observer, \"How Auburn basketball's offense zoomed into a new era vs. Baylor\" — named, move-by-move breakdown of a 2024-25 possession (Broome/Johnson/Jones), extended through to the finish the same breakdown describes rather than stopping at the handoff.",
    [
      "Big man: hand it off at the hip with two-side spacing already set.",
      "After the handoff, screen again immediately — don't just hand it off and stand.",
      "Driver: attack downhill hard enough to actually collapse the defense.",
      "Weak-side big: seal and show a target hand the instant help comes.",
    ],
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

  play("auburn-flare", "Flare Counter", "Auburn", "man", "vs Man",
    "The Auburn Observer, \"How Auburn basketball's offense zoomed into a new era vs. Baylor\" — named, move-by-move breakdown (Jasper/Williams/Green), with the alignment, the drive, the flare screen, and the finish each shown as its own beat.",
    [
      "Driver: go all the way to the paint — a half-hearted drive doesn't draw real help.",
      "Flare screener: screen the body, angle it toward the corner, not just a pick-and-pop.",
      "Shooter: wait for the screen before you fade — don't cut early.",
      "Kick-out passer: throw it early, to where the shooter is going, not where he is.",
    ],
    [
      {
        offense: [o("O3", 25, 32), o("O1", 14, 20), o("O4", 36, 18), o("O2", 10, 10), o("O5", 40, 10)],
        defense: [],
        ballHolder: "O3",
        lines: [],
        note: "Alignment before the drive.",
      },
      {
        offense: [o("O3", 25, 30), o("O1", 14, 20), o("O4", 36, 18), o("O2", 10, 10), o("O5", 40, 10)],
        defense: [],
        ballHolder: "O3",
        lines: [ln("dribble", "offense", [{ x: 25, y: 30 }, { x: 18, y: 22 }])],
        note: "O3 drives middle off the dribble, collapsing the defense toward the paint.",
      },
      {
        offense: [o("O3", 18, 22), o("O1", 14, 20), o("O4", 40, 14), o("O2", 10, 10), o("O5", 40, 10)],
        defense: [],
        ballHolder: "O3",
        lines: [ln("screen", "offense", [{ x: 36, y: 18 }, { x: 40, y: 14 }])],
        note: "O4 flares out off a screen as the drive draws help.",
      },
      {
        offense: [o("O3", 18, 22), o("O1", 14, 20), o("O4", 44, 10), o("O2", 10, 10), o("O5", 40, 10)],
        defense: [],
        ballHolder: "O4",
        lines: [ln("pass", "offense", [{ x: 18, y: 22 }, { x: 44, y: 10 }])],
        note: "Kick-out to the corner off the flare.",
      },
      {
        offense: [o("O3", 18, 22), o("O1", 14, 20), o("O4", 44, 10), o("O2", 10, 10), o("O5", 40, 10)],
        defense: [],
        ballHolder: "O4",
        lines: [],
        note: "Open corner three.",
      },
    ]
  ),

  play("auburn-blob-14lob", "1-4 Flat Lob", "Auburn", "blob", "Baseline OB",
    "Successknocks.com coaching breakdown names Auburn's use of \"1-4 flat stacks for lob plays\" on BLOB, without move-by-move detail — the alignment and action below is a standard way to run that call, not a confirmed exact diagram, broken into finer beats than a 2-frame sketch so the cut and the lob read as the continuous action they are.",
    [
      "Screener: set it and hold — a moving screen is a turnover waiting to happen.",
      "Cutter: sprint the whole way, hands ready before the ball is released.",
      "Inbounder: throw it high, to the rim side, on the slap — no hesitation.",
      "No lob? Reset into the half-court offense immediately, don't force it.",
    ],
    [
      {
        offense: [o("O3", 25, 2), o("O1", 14, 9), o("O2", 20, 9), o("O4", 30, 9), o("O5", 36, 9)],
        defense: [],
        ballHolder: "O3",
        lines: [],
        note: "1-4 flat along the foul line.",
      },
      {
        offense: [o("O3", 25, 2), o("O1", 14, 9), o("O2", 24, 9), o("O4", 28, 8), o("O5", 36, 9)],
        defense: [],
        ballHolder: "O3",
        lines: [
          ln("screen", "offense", [{ x: 20, y: 9 }, { x: 24, y: 9 }]),
          ln("cut", "offense", [{ x: 30, y: 9 }, { x: 28, y: 8 }]),
        ],
        note: "O2 screens across for O4, who starts the cut to the rim.",
      },
      {
        offense: [o("O3", 25, 2), o("O1", 14, 9), o("O2", 24, 9), o("O4", 25, 7), o("O5", 36, 9)],
        defense: [],
        ballHolder: "O3",
        lines: [ln("cut", "offense", [{ x: 28, y: 8 }, { x: 25, y: 7 }])],
        note: "O4 continues through the lane toward the rim as the lob is released.",
      },
      {
        offense: [o("O3", 25, 2), o("O1", 14, 9), o("O2", 24, 9), o("O4", 25, 7), o("O5", 36, 9)],
        defense: [],
        ballHolder: "O4",
        lines: [ln("pass", "offense", [{ x: 25, y: 2 }, { x: 25, y: 7 }])],
        note: "Lob caught in the air just short of the rim.",
      },
      {
        offense: [o("O3", 25, 2), o("O1", 14, 9), o("O2", 24, 9), o("O4", 25, 6), o("O5", 36, 9)],
        defense: [],
        ballHolder: "O4",
        lines: [],
        note: "Lob finished at the rim.",
      },
    ]
  ),

  // --------------------------------------------------------- Louisville (Pat Kelsey) — style-based
  play("louisville-5out-flow", "5-Out Flow", "Louisville", "man", "vs Man",
    "Built from Kelsey's publicly stated system (SI/On3/Half Court Hoops reporting on his 5-out, pace-and-space principles at Charleston and Louisville) — a representative possession, not a specific sourced diagram. The linked video is Hoop Vision's general breakdown of 5-out offensive concepts (backdoor cuts, split action, zoom, staggers), not Louisville-specific footage.",
    [
      "Nobody stands after a pass — fill behind every cut.",
      "Hold real spacing: 15-18 feet apart, never two shooters on one spot.",
      "Attack downhill the first live driving lane you see.",
      "Kick out early — the extra pass is almost always the better shot.",
    ],
    [
      {
        offense: [o("O1", 25, 32), o("O2", 10, 20), o("O3", 40, 20), o("O4", 6, 10), o("O5", 44, 10)],
        defense: [],
        ballHolder: "O1",
        lines: [],
        note: "Five-out spacing to start — no post.",
      },
      {
        offense: [o("O1", 25, 20), o("O2", 10, 20), o("O3", 40, 20), o("O4", 6, 10), o("O5", 44, 10)],
        defense: [],
        ballHolder: "O2",
        lines: [
          ln("pass", "offense", [{ x: 25, y: 32 }, { x: 10, y: 20 }]),
          ln("cut", "offense", [{ x: 25, y: 32 }, { x: 25, y: 20 }]),
        ],
        note: "Ball reverses to the wing as O1 cuts through to the opposite corner.",
      },
      {
        offense: [o("O1", 44, 10), o("O2", 10, 20), o("O3", 40, 20), o("O4", 6, 10), o("O5", 44, 10)],
        defense: [],
        ballHolder: "O3",
        lines: [ln("pass", "offense", [{ x: 10, y: 20 }, { x: 40, y: 20 }])],
        note: "Side to side — the ball keeps moving, probing for the gap in the defense's shape.",
      },
      {
        offense: [o("O1", 44, 10), o("O2", 10, 20), o("O3", 32, 14), o("O4", 6, 10), o("O5", 44, 10)],
        defense: [],
        ballHolder: "O3",
        lines: [ln("dribble", "offense", [{ x: 40, y: 20 }, { x: 32, y: 14 }])],
        note: "O3 drives baseline off the catch — downhill, pace-and-space basketball.",
      },
      {
        offense: [o("O1", 44, 10), o("O2", 10, 20), o("O3", 32, 14), o("O4", 6, 10), o("O5", 44, 10)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("pass", "offense", [{ x: 32, y: 14 }, { x: 44, y: 10 }])],
        note: "Kick out to the corner for the catch-and-shoot three — the shot the spacing was built for.",
      },
    ],
    "https://youtu.be/DITiFB5Aft4"
  ),

  play("louisville-5out-ballscreen", "5-Out Ball-Screen Attack", "Louisville", "man", "vs Man",
    "Built from Kelsey's publicly stated system (pace, spacing, high three-point volume) — a representative possession, not a specific sourced diagram. The linked video is Hoop Vision's general breakdown of 5-out offensive concepts, not Louisville-specific footage.",
    [
      "Screener: relocate to set the ball screen — don't wait for the defense to set up first.",
      "Ball handler: use the screen shoulder-to-shoulder, get all the way downhill.",
      "If the big's man helps, find him rolling — that's the first read, not the last.",
      "Corner shooters stay spaced and ready the entire possession.",
    ],
    [
      {
        offense: [o("O1", 25, 32), o("O2", 10, 20), o("O3", 40, 20), o("O4", 6, 10), o("O5", 44, 10)],
        defense: [],
        ballHolder: "O1",
        lines: [],
        note: "Five-out spacing — everyone stays off the post.",
      },
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
        lines: [],
        note: "Downhill off the screen — the defense has to collapse or give up the rim.",
      },
      {
        offense: [o("O1", 32, 20), o("O2", 10, 20), o("O3", 36, 24), o("O4", 6, 10), o("O5", 44, 10)],
        defense: [],
        ballHolder: "O5",
        lines: [ln("pass", "offense", [{ x: 32, y: 20 }, { x: 44, y: 10 }])],
        note: "Kick to the corner off the help.",
      },
      {
        offense: [o("O1", 32, 20), o("O2", 10, 20), o("O3", 36, 24), o("O4", 6, 10), o("O5", 44, 10)],
        defense: [],
        ballHolder: "O5",
        lines: [],
        note: "Catch-and-shoot three in the corner.",
      },
    ],
    "https://youtu.be/DITiFB5Aft4"
  ),

  // ------------------------------------------------------------- Generic category fillers
  play("generic-zone-131", "1-3-1 vs 2-3: Pin and Skip", "Generic", "zone", "vs 2-3 Zone",
    "Standard zone-offense action (coachesclipboard.net, basketballforcoaches.com) — not attributed to UConn, Auburn, or Louisville specifically; included to cover the zone-offense category with a legitimate, well-documented action, with the entry, the post holding, and the skip each shown as its own beat.",
    [
      "Hold the post in the middle as a decoy — his job is to occupy two defenders.",
      "Reverse the ball with purpose — a zone shifts on the pass, not the catch.",
      "Skip passes beat a zone's rotation; dribbling into it just invites a trap.",
      "Shoot with confidence once you're inside the zone's recovery — hesitation kills the possession.",
    ],
    [
      {
        offense: [o("O1", 25, 32), o("O2", 10, 20), o("O3", 40, 20), o("O4", 25, 12), o("O5", 40, 10)],
        defense: [],
        ballHolder: "O1",
        lines: [],
        note: "1-3-1 alignment against a 2-3 zone.",
      },
      {
        offense: [o("O1", 25, 28), o("O2", 10, 20), o("O3", 40, 20), o("O4", 25, 12), o("O5", 40, 10)],
        defense: [],
        ballHolder: "O2",
        lines: [ln("pass", "offense", [{ x: 25, y: 32 }, { x: 10, y: 20 }])],
        note: "Ball goes to the wing. The weak-side post stays put and reads the zone's shift.",
      },
      {
        offense: [o("O1", 25, 28), o("O2", 10, 20), o("O3", 40, 20), o("O4", 25, 12), o("O5", 40, 10)],
        defense: [],
        ballHolder: "O2",
        lines: [ln("cut", "offense", [{ x: 25, y: 12 }, { x: 25, y: 12 }])],
        note: "O4 holds the middle, back-screening the low defender as the zone commits to the ball side.",
      },
      {
        offense: [o("O1", 25, 28), o("O2", 10, 20), o("O3", 40, 20), o("O4", 25, 12), o("O5", 6, 9)],
        defense: [],
        ballHolder: "O5",
        lines: [ln("pass", "offense", [{ x: 10, y: 20 }, { x: 6, y: 9 }])],
        note: "Skip pass beats the zone's rotation to the weak corner.",
      },
      {
        offense: [o("O1", 25, 28), o("O2", 10, 20), o("O3", 40, 20), o("O4", 25, 12), o("O5", 6, 9)],
        defense: [],
        ballHolder: "O5",
        lines: [],
        note: "Open three in the corner before the zone can recover.",
      },
    ]
  ),

  play("generic-slob-box", "Box Set", "Generic", "slob", "Sideline OB",
    "Standard SLOB alignment (coachesclipboard.net, teachhoops.com) — a widely-used quick-hitter, not attributed to any of the three programs specifically.",
    [
      "Screener: set it before the cutter moves, not during.",
      "Inbounder: count the five seconds out loud — know exactly how much time is left.",
      "Cutter: pop to where you're open, not to a pre-set spot if the defense denies it.",
      "Safe catch? Get into offense immediately — don't stand and admire it.",
    ],
    [
      {
        offense: [o("O1", 2, 42), o("O2", 20, 9), o("O3", 30, 9), o("O4", 20, 19), o("O5", 30, 19)],
        defense: [],
        ballHolder: "O1",
        lines: [],
        note: "Box alignment at the inbound.",
      },
      {
        offense: [o("O1", 2, 42), o("O2", 20, 9), o("O3", 30, 9), o("O4", 20, 19), o("O5", 30, 19)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("screen", "offense", [{ x: 20, y: 19 }, { x: 20, y: 24 }])],
        note: "O4 steps up to screen for O2.",
      },
      {
        offense: [o("O1", 2, 42), o("O2", 14, 22), o("O3", 30, 9), o("O4", 20, 19), o("O5", 30, 19)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("cut", "offense", [{ x: 20, y: 9 }, { x: 14, y: 22 }])],
        note: "O2 pops off the screen to the sideline for the inbound.",
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

  play("generic-pressbreak-4across", "4-Across vs 2-2-1", "Generic", "fullCourt", "vs 2-2-1 Press",
    "Standard press-break structure (coachesclipboard.net) — a widely-used press break, not attributed to any of the three programs specifically.",
    [
      "Meet every pass — catch on the move, pivot, face up immediately.",
      "The middle of the floor beats every press; never force it to the sideline.",
      "Inbounder steps in right after the pass as the safety outlet.",
      "Once you've beaten the first line, push — numbers are now in your favor.",
    ],
    [
      {
        offense: [o("O1", 25, 80), o("O2", 6, 60), o("O3", 44, 60), o("O4", 15, 45), o("O5", 35, 45)],
        defense: [],
        ballHolder: "O1",
        lines: [],
        note: "Four across against the 2-2-1.",
      },
      {
        offense: [o("O1", 25, 70), o("O2", 6, 60), o("O3", 44, 60), o("O4", 15, 45), o("O5", 35, 45)],
        defense: [],
        ballHolder: "O2",
        lines: [ln("pass", "offense", [{ x: 25, y: 80 }, { x: 6, y: 60 }])],
        note: "Inbound to the side, away from the middle trap.",
      },
      {
        offense: [o("O1", 25, 70), o("O2", 6, 60), o("O3", 44, 60), o("O4", 25, 42), o("O5", 35, 45)],
        defense: [],
        ballHolder: "O4",
        lines: [ln("pass", "offense", [{ x: 6, y: 60 }, { x: 25, y: 42 }])],
        note: "O4 flashes to the middle for the quick pass up the gut, splitting the trap.",
      },
      {
        offense: [o("O1", 25, 70), o("O2", 6, 60), o("O3", 44, 60), o("O4", 25, 25), o("O5", 35, 45)],
        defense: [],
        ballHolder: "O4",
        lines: [ln("dribble", "offense", [{ x: 25, y: 42 }, { x: 25, y: 25 }])],
        note: "Numbers advantage — O4 pushes it up the floor before the press can reset.",
      },
      {
        offense: [o("O1", 25, 70), o("O2", 6, 60), o("O3", 44, 60), o("O4", 25, 10), o("O5", 35, 45)],
        defense: [],
        ballHolder: "O4",
        lines: [],
        note: "Layup off the numbers advantage.",
      },
    ]
  ),
];
