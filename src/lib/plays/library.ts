import type { DefenseId, DrawnLine, Frame, OffenseId, OffensePlayer, DefensePlayer } from "./types";
import type { Point } from "./geometry";

export { type PlayCategory, PLAY_CATEGORY_LABEL } from "./category";
import type { PlayCategory } from "./category";

export type LibraryPlay = {
  id: string;
  name: string;
  category: PlayCategory;
  /** Short situation tag shown as the card subtitle — "vs Man", "vs 2-3 Zone", "Baseline OB". */
  vs: string;
  /** What the play is for and the core read — the first thing a player or coach should know, shown on the card and above the step list. */
  about: string;
  /** Scannable coaching cues for this specific action. */
  keys: string[];
  frames: Frame[];
  /** Only set when there's something true and specific worth saying about where this came from (e.g. it matches the team's own defensive system). Left out for standard, widely-taught actions rather than inventing a citation for them. */
  source?: string;
  /** A real, verified YouTube video that shows or teaches this exact action. Never a guess. */
  videoUrl?: string;
};

function o(id: OffenseId, x: number, y: number): OffensePlayer {
  return { id, pos: { x, y } };
}

/** A defender placed by hand rather than resolved from a coverage rule — right for a diagram of a specific, named action instead of a live man-to-man read. `man` only matters if the coverage is ever switched off "manual"; it is not used to position this defender. */
function d(id: DefenseId, man: OffenseId, manualPos: Point): DefensePlayer {
  return { id, man, coverage: "manual", manualPos };
}

let seq = 0;
function ln(type: DrawnLine["type"], color: DrawnLine["color"], points: { x: number; y: number }[], beat?: number): DrawnLine {
  seq += 1;
  return { id: `lib${seq}`, type, color, points, beat };
}

function play(
  id: string,
  name: string,
  category: PlayCategory,
  vs: string,
  about: string,
  keys: string[],
  frames: Frame[],
  source?: string,
  videoUrl?: string
): LibraryPlay {
  return { id, name, category, vs, about, keys, frames, source, videoUrl };
}

/**
 * The Lightning playbook: standard, widely-taught actions (Flex, Horns, UCLA Cut, Floppy, Spain
 * pick-and-roll, standard zone reads, standard press breaks, standard BLOB/SLOB shapes, and the
 * team's own Run & Jump defense) rather than possessions reconstructed from specific game film.
 * Earlier versions of this library tried to stay faithful to real, partially-documented college
 * possessions and the geometry suffered for it — a real possession isn't drawn to teach cleanly.
 * These are. `source` is left out for exactly that reason on most plays: there is nothing false to
 * say by omitting it, but attaching a specific team or clip to a standard action would be.
 */
export const LIBRARY_PLAYS: LibraryPlay[] = [
  play(
    "five-out",
    "5-Out Motion",
    "man",
    "vs Man",
    "Base pass-and-cut offense. Five spots on the perimeter, nobody stands, and every pass is followed by a cut.",
    [
      "Pass, cut, fill. Never stand after a pass.",
      "If you are not open in the lane after one count, clear out.",
      "Hold 15–18 ft spacing. Two players on one spot is a mistake.",
      "Wing overplayed? Go backdoor.",
    ],
    [
      {
        offense: [o("O1", 25, 32), o("O2", 44.5, 21), o("O3", 5.5, 21), o("O4", 47, 3.5), o("O5", 3, 3.5)],
        defense: [],
        ballHolder: "O1",
        lines: [],
        note: "Base pass-and-cut offense. Five spots on the perimeter, nobody stands, and every pass is followed by a cut.",
      },
      {
        offense: [o("O1", 25, 32), o("O2", 44.5, 21), o("O3", 5.5, 21), o("O4", 47, 3.5), o("O5", 3, 3.5)],
        defense: [],
        ballHolder: "O2",
        lines: [ln("pass", "offense", [{ x: 25, y: 32 }, { x: 44.5, y: 21 }])],
        note: "1 passes to 2 on the wing.",
        ballArrival: [{ x: 25, y: 32 }, { x: 44.5, y: 21 }],
      },
      {
        offense: [o("O1", 26, 7), o("O2", 44.5, 21), o("O3", 5.5, 21), o("O4", 47, 3.5), o("O5", 3, 3.5)],
        defense: [],
        ballHolder: "O2",
        lines: [ln("cut", "offense", [{ x: 25, y: 32 }, { x: 26, y: 7 }])],
        note: "1 face-cuts to the rim looking for the give-and-go.",
      },
      {
        offense: [o("O1", 3, 3.5), o("O2", 44.5, 21), o("O3", 25, 32), o("O4", 47, 3.5), o("O5", 5.5, 21)],
        defense: [],
        ballHolder: "O2",
        lines: [ln("cut", "offense", [{ x: 5.5, y: 21 }, { x: 8.4, y: 23.8 }, { x: 11.4, y: 26.2 }, { x: 14.6, y: 28.3 }, { x: 17.9, y: 29.9 }, { x: 21.4, y: 31.1 }, { x: 25, y: 32 }]), ln("cut", "offense", [{ x: 3, y: 3.5 }, { x: 5.5, y: 21 }]), ln("cut", "offense", [{ x: 26, y: 7 }, { x: 22.3, y: 5.8 }, { x: 18.6, y: 4.8 }, { x: 14.8, y: 4.1 }, { x: 10.9, y: 3.7 }, { x: 7, y: 3.5 }, { x: 3, y: 3.5 }])],
        note: "Fill toward the ball: 3 fills the top, 5 lifts to the wing, 1 clears to the open corner.",
      },
      {
        offense: [o("O1", 3, 3.5), o("O2", 44.5, 21), o("O3", 25, 32), o("O4", 47, 3.5), o("O5", 5.5, 21)],
        defense: [],
        ballHolder: "O3",
        lines: [ln("pass", "offense", [{ x: 44.5, y: 21 }, { x: 25, y: 32 }])],
        note: "2 reverses the ball to 3 at the top.",
        ballArrival: [{ x: 44.5, y: 21 }, { x: 25, y: 32 }],
      },
      {
        offense: [o("O1", 3, 3.5), o("O2", 25, 7.5), o("O3", 25, 32), o("O4", 44.5, 21), o("O5", 5.5, 21)],
        defense: [],
        ballHolder: "O3",
        lines: [ln("cut", "offense", [{ x: 44.5, y: 21 }, { x: 25, y: 7.5 }]), ln("cut", "offense", [{ x: 47, y: 3.5 }, { x: 44.5, y: 21 }])],
        note: "2 basket cuts; 4 lifts to the wing behind him.",
      },
      {
        offense: [o("O1", 3, 3.5), o("O2", 47, 3.5), o("O3", 25, 32), o("O4", 44.5, 21), o("O5", 5.5, 21)],
        defense: [],
        ballHolder: "O3",
        lines: [ln("cut", "offense", [{ x: 25, y: 7.5 }, { x: 28.7, y: 6.4 }, { x: 32.3, y: 5.5 }, { x: 36, y: 4.8 }, { x: 39.7, y: 4.2 }, { x: 43.3, y: 3.8 }, { x: 47, y: 3.5 }])],
        note: "2 clears to the empty corner. Back in the 5-out shape — keep it moving.",
      },
    ]
  ),

  play(
    "four-out",
    "4-Out 1-In Motion",
    "man",
    "vs Man",
    "Four perimeter spots with one post. Same pass-and-cut rules, plus a post who seals and plays out of the block.",
    [
      "Post: seal with your hips, show a target hand away from the defender.",
      "Wing looks inside first on every catch.",
      "When the post catches, cutters cut — the post is a passer too.",
      "Re-post when the ball reverses.",
    ],
    [
      {
        offense: [o("O1", 16.5, 30), o("O2", 33.5, 30), o("O3", 4, 15), o("O4", 46, 15), o("O5", 18.5, 8.5)],
        defense: [],
        ballHolder: "O1",
        lines: [],
        note: "Four perimeter spots with one post. Same pass-and-cut rules, plus a post who seals and plays out of the block.",
      },
      {
        offense: [o("O1", 16.5, 30), o("O2", 33.5, 30), o("O3", 4, 15), o("O4", 46, 15), o("O5", 17, 9.5)],
        defense: [],
        ballHolder: "O3",
        lines: [ln("cut", "offense", [{ x: 18.5, y: 8.5 }, { x: 17, y: 9.5 }]), ln("pass", "offense", [{ x: 16.5, y: 30 }, { x: 4, y: 15 }])],
        note: "1 enters to 3 on the wing. 5 seals ball-side.",
        ballArrival: [{ x: 16.5, y: 30 }, { x: 4, y: 15 }],
      },
      {
        offense: [o("O1", 23.5, 6.5), o("O2", 16.5, 30), o("O3", 4, 15), o("O4", 46, 15), o("O5", 17, 9.5)],
        defense: [],
        ballHolder: "O3",
        lines: [ln("cut", "offense", [{ x: 16.5, y: 30 }, { x: 23.5, y: 6.5 }]), ln("cut", "offense", [{ x: 33.5, y: 30 }, { x: 16.5, y: 30 }])],
        note: "1 basket cuts; 2 slides over to fill the ball-side slot.",
      },
      {
        offense: [o("O1", 46, 15), o("O2", 16.5, 30), o("O3", 4, 15), o("O4", 33.5, 30), o("O5", 17, 9.5)],
        defense: [],
        ballHolder: "O3",
        lines: [ln("cut", "offense", [{ x: 23.5, y: 6.5 }, { x: 28.2, y: 6.3 }, { x: 32.4, y: 6.8 }, { x: 36.4, y: 7.9 }, { x: 39.9, y: 9.6 }, { x: 43.2, y: 12 }, { x: 46, y: 15 }]), ln("cut", "offense", [{ x: 46, y: 15 }, { x: 33.5, y: 30 }])],
        note: "1 exits to the weak-side wing; 4 lifts to the open slot.",
      },
      {
        offense: [o("O1", 46, 15), o("O2", 16.5, 30), o("O3", 4, 15), o("O4", 33.5, 30), o("O5", 17, 9.5)],
        defense: [],
        ballHolder: "O5",
        lines: [ln("pass", "offense", [{ x: 4, y: 15 }, { x: 17, y: 9.5 }])],
        note: "3 feeds the post: 5 catches on the block.",
        ballArrival: [{ x: 4, y: 15 }, { x: 17, y: 9.5 }],
      },
      {
        offense: [o("O1", 46, 15), o("O2", 16.5, 30), o("O3", 4, 15), o("O4", 33.5, 30), o("O5", 17, 9.5)],
        defense: [],
        ballHolder: "O2",
        lines: [ln("pass", "offense", [{ x: 17, y: 9.5 }, { x: 16.5, y: 30 }])],
        note: "Help comes — 5 kicks it out to 2 for the shot or a re-post.",
        ballArrival: [{ x: 17, y: 9.5 }, { x: 16.5, y: 30 }],
      },
    ]
  ),

  play(
    "dribble-drive",
    "Dribble Drive",
    "man",
    "vs Man",
    "Drive the gap and everyone moves on a rule: drift, rotate, post opposite. Turns help into open kick-outs.",
    [
      "Attack gaps, not defenders.",
      "Every drive moves everyone: drift, rotate, post opposite.",
      "Two feet in the paint: finish or kick.",
      "A closeout is a drive — catch it ready to go.",
    ],
    [
      {
        offense: [o("O1", 25, 32), o("O2", 44, 18), o("O3", 6, 18), o("O4", 3, 3.5), o("O5", 33, 4.5)],
        defense: [],
        ballHolder: "O1",
        lines: [],
        note: "Drive the gap and everyone moves on a rule: drift, rotate, post opposite. Turns help into open kick-outs.",
      },
      {
        offense: [o("O1", 33, 14), o("O2", 47, 5.5), o("O3", 20, 33), o("O4", 3, 3.5), o("O5", 16.5, 4)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("dribble", "offense", [{ x: 25, y: 32 }, { x: 26.9, y: 29.6 }, { x: 28.6, y: 26.9 }, { x: 30, y: 24 }, { x: 31.2, y: 20.9 }, { x: 32.2, y: 17.6 }, { x: 33, y: 14 }]), ln("cut", "offense", [{ x: 44, y: 18 }, { x: 47, y: 5.5 }]), ln("cut", "offense", [{ x: 6, y: 18 }, { x: 20, y: 33 }]), ln("cut", "offense", [{ x: 33, y: 4.5 }, { x: 16.5, y: 4 }])],
        note: "1 drives the right gap. 2 drifts to the corner, 3 rotates to the top, 5 slides opposite to the dunker.",
      },
      {
        offense: [o("O1", 33, 14), o("O2", 47, 5.5), o("O3", 20, 33), o("O4", 3, 3.5), o("O5", 16.5, 4)],
        defense: [],
        ballHolder: "O2",
        lines: [ln("pass", "offense", [{ x: 33, y: 14 }, { x: 47, y: 5.5 }])],
        note: "The wing defender helps — 1 kicks to 2 in the corner.",
        ballArrival: [{ x: 33, y: 14 }, { x: 47, y: 5.5 }],
      },
      {
        offense: [o("O1", 25, 25), o("O2", 37.5, 4.5), o("O3", 20, 33), o("O4", 3, 3.5), o("O5", 16.5, 4)],
        defense: [],
        ballHolder: "O2",
        lines: [ln("dribble", "offense", [{ x: 47, y: 5.5 }, { x: 37.5, y: 4.5 }]), ln("cut", "offense", [{ x: 33, y: 14 }, { x: 25, y: 25 }])],
        note: "2 attacks the closeout baseline.",
      },
      {
        offense: [o("O1", 25, 25), o("O2", 37.5, 4.5), o("O3", 20, 33), o("O4", 3, 3.5), o("O5", 16.5, 4)],
        defense: [],
        ballHolder: "O5",
        lines: [ln("pass", "offense", [{ x: 37.5, y: 4.5 }, { x: 16.5, y: 4 }])],
        note: "Big man steps up — 2 dumps it to 5 at the dunker spot.",
        ballArrival: [{ x: 37.5, y: 4.5 }, { x: 16.5, y: 4 }],
      },
    ]
  ),

  play(
    "fist",
    "Fist",
    "zone",
    "vs 3-2 Zone",
    "1 enters to 3 on the left slot. 4 then comes from the right block to screen the top defender who shifted out to cover him, while 2 drops to the right corner and 1 slides into 2's old spot on the wing. 3 drives the gap to suck in the right-side defender and kicks to 1 — while he's driving, 5 comes from the left block to seal the other low defender. 1 attacks downhill himself, reading the right-block defender the whole way: score it, or kick to 2 in the corner if he helps off.",
    [
      "3: catch and read — the defender chasing you into the screen is the whole point of this.",
      "4: time the screen to when the defender's already shifted onto 3, not before.",
      "2 and 1: the corner-drop and the wing-fill happen together — don't wait on each other.",
      "3 on the drive: go hard enough to actually pull the right-side defender, then find 1 immediately.",
      "5: seal him the instant 3 starts driving — the defense can't help twice.",
      "1 on the catch: read the right-block defender all the way — score if he stays home on 2, kick to the corner if he helps.",
    ],
    [
      {
        offense: [o("O1", 25, 29), o("O2", 38, 20), o("O3", 16, 22), o("O4", 31.5, 7), o("O5", 18.5, 7)],
        defense: [d("X1", "O1", { x: 25, y: 24 }), d("X2", "O1", { x: 13, y: 19 }), d("X3", "O1", { x: 37, y: 19 }), d("X4", "O1", { x: 16, y: 9 }), d("X5", "O1", { x: 34, y: 9 })],
        ballHolder: "O1",
        lines: [],
        note: "1 at the top with the ball vs a 3-2 zone. 2 right wing, 3 left slot, 4 right block, 5 left block.",
      },
      {
        offense: [o("O1", 25, 29), o("O2", 38, 20), o("O3", 16, 22), o("O4", 31.5, 7), o("O5", 18.5, 7)],
        defense: [d("X1", "O3", { x: 25, y: 24 }), d("X2", "O3", { x: 20, y: 19 }), d("X3", "O3", { x: 37, y: 19 }), d("X4", "O3", { x: 16, y: 9 }), d("X5", "O3", { x: 34, y: 9 })],
        ballHolder: "O3",
        lines: [ln("pass", "offense", [{ x: 25, y: 29 }, { x: 16, y: 22 }]), ln("cut", "defense", [{ x: 13, y: 19 }, { x: 20, y: 19 }])],
        note: "1 enters it to 3 on the left slot. The zone's top-left defender shifts out to cover him.",
        ballArrival: [{ x: 25, y: 29 }, { x: 16, y: 22 }],
      },
      {
        offense: [o("O1", 38, 20), o("O2", 44, 4), o("O3", 16, 22), o("O4", 23, 18), o("O5", 18.5, 7)],
        defense: [d("X1", "O3", { x: 22, y: 21 }), d("X2", "O3", { x: 20, y: 19 }), d("X3", "O3", { x: 37, y: 19 }), d("X4", "O3", { x: 16, y: 9 }), d("X5", "O3", { x: 34, y: 9 })],
        ballHolder: "O3",
        lines: [
          ln("cut", "offense", [{ x: 25, y: 29 }, { x: 38, y: 20 }]),
          ln("cut", "offense", [{ x: 38, y: 20 }, { x: 44, y: 4 }]),
          ln("screen", "offense", [{ x: 31.5, y: 7 }, { x: 23, y: 18 }]),
          ln("cut", "defense", [{ x: 25, y: 24 }, { x: 22, y: 21 }]),
        ],
        note: "4 comes from the right block to screen the defender who shifted onto 3. 2 drops to the right corner as 1 slides over to take his old spot on the wing.",
      },
      {
        offense: [o("O1", 38, 20), o("O2", 44, 4), o("O3", 22, 14), o("O4", 23, 18), o("O5", 16, 8)],
        defense: [d("X1", "O1", { x: 22, y: 21 }), d("X2", "O1", { x: 20, y: 19 }), d("X3", "O1", { x: 37, y: 19 }), d("X4", "O1", { x: 16, y: 9 }), d("X5", "O1", { x: 26, y: 11 })],
        ballHolder: "O1",
        lines: [
          ln("cut", "offense", [{ x: 16, y: 22 }, { x: 22, y: 14 }]),
          ln("cut", "offense", [{ x: 18.5, y: 7 }, { x: 16, y: 8 }]),
          ln("cut", "defense", [{ x: 34, y: 9 }, { x: 26, y: 11 }]),
          ln("pass", "offense", [{ x: 22, y: 14 }, { x: 38, y: 20 }]),
        ],
        note: "3 drives middle to suck in the right-side defender, then kicks out to 1. While he's driving, 5 comes over from the left block and seals x4.",
        ballArrival: [{ x: 22, y: 14 }, { x: 38, y: 20 }],
      },
      {
        offense: [o("O1", 28, 7), o("O2", 44, 4), o("O3", 22, 14), o("O4", 23, 18), o("O5", 16, 8)],
        defense: [d("X1", "O1", { x: 22, y: 21 }), d("X2", "O1", { x: 20, y: 19 }), d("X3", "O1", { x: 37, y: 19 }), d("X4", "O1", { x: 16, y: 9 }), d("X5", "O1", { x: 29, y: 8 })],
        ballHolder: "O1",
        lines: [ln("dribble", "offense", [{ x: 38, y: 20 }, { x: 28, y: 7 }]), ln("cut", "defense", [{ x: 26, y: 11 }, { x: 29, y: 8 }])],
        note: "1 drives it himself, reading the right-block defender the whole way — if he helps off 2, the corner's open instead.",
      },
    ]
  ),

  play(
    "horns-pnr",
    "Horns Pick & Roll",
    "man",
    "vs Man",
    "Two bigs at the elbows, shooters in the corners. 1 picks a side and plays the two-on-two with a roller and a popper.",
    [
      "Screener: sprint, wide base, hold until contact.",
      "Ball handler: use the screen shoulder-to-shoulder, get downhill.",
      "If the corner helps on the roll, kick to 3.",
      "If both defenders go to the ball, 4 is open at the top.",
    ],
    [
      {
        offense: [o("O1", 25, 33.5), o("O2", 3, 3.5), o("O3", 47, 3.5), o("O4", 19.5, 19), o("O5", 30.5, 19)],
        defense: [],
        ballHolder: "O1",
        lines: [],
        note: "Two bigs at the elbows, shooters in the corners. 1 picks a side and plays the two-on-two with a roller and a popper.",
      },
      {
        offense: [o("O1", 25, 33.5), o("O2", 3, 3.5), o("O3", 47, 3.5), o("O4", 19.5, 19), o("O5", 27.2, 30.5)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("screen", "offense", [{ x: 30.5, y: 19 }, { x: 27.2, y: 30.5 }])],
        note: "5 steps up and sets the ball screen on 1’s right hip.",
      },
      {
        offense: [o("O1", 35.5, 17.5), o("O2", 3, 3.5), o("O3", 47, 3.5), o("O4", 23, 32), o("O5", 25.5, 7)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("dribble", "offense", [{ x: 25, y: 33.5 }, { x: 28.2, y: 31.8 }, { x: 30.8, y: 29.7 }, { x: 32.9, y: 27.3 }, { x: 34.3, y: 24.4 }, { x: 35.2, y: 21.1 }, { x: 35.5, y: 17.5 }]), ln("cut", "offense", [{ x: 27.2, y: 30.5 }, { x: 27, y: 26.9 }, { x: 26.7, y: 23.2 }, { x: 26.4, y: 19.4 }, { x: 26.1, y: 15.4 }, { x: 25.8, y: 11.3 }, { x: 25.5, y: 7 }]), ln("cut", "offense", [{ x: 19.5, y: 19 }, { x: 23, y: 32 }])],
        note: "1 attacks downhill. 5 rolls to the rim, 4 pops to the top.",
      },
      {
        offense: [o("O1", 35.5, 17.5), o("O2", 3, 3.5), o("O3", 47, 3.5), o("O4", 23, 32), o("O5", 25.5, 7)],
        defense: [],
        ballHolder: "O5",
        lines: [ln("pass", "offense", [{ x: 35.5, y: 17.5 }, { x: 25.5, y: 7 }])],
        note: "Big’s defender steps up to 1 — hit 5 on the roll.",
        ballArrival: [{ x: 35.5, y: 17.5 }, { x: 25.5, y: 7 }],
      },
    ]
  ),

  play(
    "flex",
    "Flex",
    "man",
    "vs Man",
    "Continuity offense built on two actions — the baseline flex screen and the down screen. Runs forever and teaches screening.",
    [
      "Cutter: set your man up — walk him in, then run him off the screen.",
      "Down screener: screen low, then pop to the slot.",
      "Look at the cutter first, the screener second.",
      "Keep the floor balanced: always two up, three in the flex positions.",
    ],
    [
      {
        offense: [o("O1", 34, 30), o("O2", 5.5, 17), o("O3", 45, 12), o("O4", 16, 30), o("O5", 31.5, 8.5)],
        defense: [],
        ballHolder: "O1",
        lines: [],
        note: "Continuity offense built on two actions — the baseline flex screen and the down screen. Runs forever and teaches screening.",
      },
      {
        offense: [o("O1", 34, 30), o("O2", 5.5, 17), o("O3", 45, 12), o("O4", 16, 30), o("O5", 31.5, 8.5)],
        defense: [],
        ballHolder: "O4",
        lines: [ln("pass", "offense", [{ x: 34, y: 30 }, { x: 16, y: 30 }])],
        note: "1 reverses the ball to 4.",
        ballArrival: [{ x: 34, y: 30 }, { x: 16, y: 30 }],
      },
      {
        offense: [o("O1", 34, 30), o("O2", 5.5, 17), o("O3", 18.5, 7), o("O4", 16, 30), o("O5", 30, 7.5)],
        defense: [],
        ballHolder: "O4",
        lines: [ln("screen", "offense", [{ x: 31.5, y: 8.5 }, { x: 30, y: 7.5 }]), ln("cut", "offense", [{ x: 45, y: 12 }, { x: 40.1, y: 9.2 }, { x: 35.4, y: 7.2 }, { x: 30.9, y: 6 }, { x: 26.6, y: 5.6 }, { x: 22.4, y: 5.9 }, { x: 18.5, y: 7 }])],
        note: "Flex cut: 5 screens on the block, 3 runs his man off it to the opposite block.",
      },
      {
        offense: [o("O1", 31.5, 13), o("O2", 5.5, 17), o("O3", 18.5, 7), o("O4", 16, 30), o("O5", 34, 30)],
        defense: [],
        ballHolder: "O4",
        lines: [ln("screen", "offense", [{ x: 34, y: 30 }, { x: 31.5, y: 13 }]), ln("cut", "offense", [{ x: 30, y: 7.5 }, { x: 32.1, y: 11.6 }, { x: 33.6, y: 15.6 }, { x: 34.5, y: 19.4 }, { x: 34.9, y: 23.1 }, { x: 34.7, y: 26.6 }, { x: 34, y: 30 }])],
        note: "Screen the screener: 1 sets a down screen for 5.",
      },
      {
        offense: [o("O1", 31.5, 13), o("O2", 5.5, 17), o("O3", 18.5, 7), o("O4", 16, 30), o("O5", 34, 30)],
        defense: [],
        ballHolder: "O5",
        lines: [ln("pass", "offense", [{ x: 16, y: 30 }, { x: 34, y: 30 }])],
        note: "4 hits 5 at the top — or 3 posting on the block.",
        ballArrival: [{ x: 16, y: 30 }, { x: 34, y: 30 }],
      },
      {
        offense: [o("O1", 31.5, 13), o("O2", 31.5, 7), o("O3", 18, 8), o("O4", 16, 30), o("O5", 34, 30)],
        defense: [],
        ballHolder: "O5",
        lines: [ln("screen", "offense", [{ x: 18.5, y: 7 }, { x: 18, y: 8 }]), ln("cut", "offense", [{ x: 5.5, y: 17 }, { x: 10, y: 12.7 }, { x: 14.4, y: 9.4 }, { x: 18.8, y: 7.3 }, { x: 23.1, y: 6.1 }, { x: 27.3, y: 6 }, { x: 31.5, y: 7 }])],
        note: "Repeat on the other side: 3 screens on the block for 2’s flex cut.",
      },
    ]
  ),

  play(
    "floppy",
    "Floppy",
    "man",
    "vs Man",
    "Shooter starts under the rim with a single screen on one side and a double stagger on the other. He picks the side.",
    [
      "Shooter: shoulder to the screener’s hip, square up on the catch.",
      "Defender trails? Curl to the paint.",
      "Defender cheats under? Fade to the corner.",
      "4 on the single side posts up if his man sags to help.",
    ],
    [
      {
        offense: [o("O1", 25, 33), o("O2", 25, 4), o("O3", 39.5, 12), o("O4", 18, 8), o("O5", 32, 9)],
        defense: [],
        ballHolder: "O1",
        lines: [],
        note: "Shooter starts under the rim with a single screen on one side and a double stagger on the other. He picks the side.",
      },
      {
        offense: [o("O1", 25, 33), o("O2", 44, 21.5), o("O3", 40, 15), o("O4", 18, 8), o("O5", 33, 9.5)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("screen", "offense", [{ x: 32, y: 9 }, { x: 33, y: 9.5 }]), ln("screen", "offense", [{ x: 39.5, y: 12 }, { x: 40, y: 15 }]), ln("cut", "offense", [{ x: 25, y: 4 }, { x: 28.6, y: 4.5 }, { x: 32, y: 5.9 }, { x: 35.3, y: 8.4 }, { x: 38.3, y: 11.8 }, { x: 41.3, y: 16.2 }, { x: 44, y: 21.5 }])],
        note: "2 reads his man and goes right — 5 then 3 set the staggered screens.",
      },
      {
        offense: [o("O1", 25, 33), o("O2", 44, 21.5), o("O3", 40, 15), o("O4", 18, 8), o("O5", 33, 9.5)],
        defense: [],
        ballHolder: "O2",
        lines: [ln("pass", "offense", [{ x: 25, y: 33 }, { x: 44, y: 21.5 }])],
        note: "1 hits 2 coming off for the catch-and-shoot.",
        ballArrival: [{ x: 25, y: 33 }, { x: 44, y: 21.5 }],
      },
      {
        offense: [o("O1", 25, 33), o("O2", 44, 21.5), o("O3", 29, 6), o("O4", 18, 8), o("O5", 33, 9.5)],
        defense: [],
        ballHolder: "O2",
        lines: [ln("cut", "offense", [{ x: 40, y: 15 }, { x: 29, y: 6 }])],
        note: "Second option: 3 slips to the rim when his man helps on 2.",
      },
    ]
  ),

  play(
    "spain",
    "Spain Pick & Roll",
    "man",
    "vs Man",
    "A ball screen with a back screen on the roller’s defender. Hard to guard — someone has to choose who is open.",
    [
      "2: screen the big’s defender in the back, then sprint out to the arc.",
      "Roller: run straight to the rim, hands up.",
      "Corner shooters stay wide and stay ready.",
      "Works best against teams that hedge or show on ball screens.",
    ],
    [
      {
        offense: [o("O1", 25, 34.5), o("O2", 25, 16.5), o("O3", 3, 3.5), o("O4", 47, 3.5), o("O5", 21.5, 25)],
        defense: [],
        ballHolder: "O1",
        lines: [],
        note: "A ball screen with a back screen on the roller’s defender. Hard to guard — someone has to choose who is open.",
      },
      {
        offense: [o("O1", 25, 34.5), o("O2", 25, 16.5), o("O3", 3, 3.5), o("O4", 47, 3.5), o("O5", 27.2, 31.2)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("screen", "offense", [{ x: 21.5, y: 25 }, { x: 27.2, y: 31.2 }])],
        note: "5 sprints up and screens for 1. 2 lurks at the free-throw line.",
      },
      {
        offense: [o("O1", 35, 19), o("O2", 25.5, 19.5), o("O3", 3, 3.5), o("O4", 47, 3.5), o("O5", 25, 7)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("dribble", "offense", [{ x: 25, y: 34.5 }, { x: 28.1, y: 32.7 }, { x: 30.6, y: 30.6 }, { x: 32.5, y: 28.1 }, { x: 33.9, y: 25.4 }, { x: 34.7, y: 22.3 }, { x: 35, y: 19 }]), ln("cut", "offense", [{ x: 27.2, y: 31.2 }, { x: 25, y: 7 }]), ln("screen", "offense", [{ x: 25, y: 16.5 }, { x: 25.5, y: 19.5 }])],
        note: "1 attacks; 5 rolls; 2 back screens 5’s defender on the way.",
      },
      {
        offense: [o("O1", 35, 19), o("O2", 25, 32), o("O3", 3, 3.5), o("O4", 47, 3.5), o("O5", 25, 7)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("cut", "offense", [{ x: 25.5, y: 19.5 }, { x: 25, y: 32 }])],
        note: "2 pops to the arc after the screen.",
      },
      {
        offense: [o("O1", 35, 19), o("O2", 25, 32), o("O3", 3, 3.5), o("O4", 47, 3.5), o("O5", 25, 7)],
        defense: [],
        ballHolder: "O2",
        lines: [ln("pass", "offense", [{ x: 35, y: 19 }, { x: 25, y: 32 }])],
        note: "Read: lob to 5 on the roll — or kick to 2 for three if his man helps.",
        ballArrival: [{ x: 35, y: 19 }, { x: 25, y: 32 }],
      },
    ]
  ),

  play(
    "pistol",
    "Pistol (21)",
    "man",
    "vs Man",
    "Early offense out of transition: point guard and wing play a quick handoff on the side, then the trailer flows into a ball screen.",
    [
      "Run it before the defense is set.",
      "Handoff: hand the ball off at the hip, then screen the defender.",
      "Trailer: sprint into the screen — no slow trails.",
      "Weak side stays spaced for the kick.",
    ],
    [
      {
        offense: [o("O1", 34, 33.5), o("O2", 45, 23), o("O3", 4, 17), o("O4", 6, 5), o("O5", 25, 42)],
        defense: [],
        ballHolder: "O1",
        lines: [],
        note: "Early offense out of transition: point guard and wing play a quick handoff on the side, then the trailer flows into a ball screen.",
      },
      {
        offense: [o("O1", 34, 33.5), o("O2", 45, 23), o("O3", 4, 17), o("O4", 6, 5), o("O5", 25, 42)],
        defense: [],
        ballHolder: "O2",
        lines: [ln("pass", "offense", [{ x: 34, y: 33.5 }, { x: 45, y: 23 }])],
        note: "1 pushes the ball and hits 2 on the wing.",
        ballArrival: [{ x: 34, y: 33.5 }, { x: 45, y: 23 }],
      },
      {
        offense: [o("O1", 42, 30), o("O2", 39.5, 26.5), o("O3", 4, 17), o("O4", 6, 5), o("O5", 25, 42)],
        defense: [],
        ballHolder: "O2",
        lines: [ln("dribble", "offense", [{ x: 45, y: 23 }, { x: 39.5, y: 26.5 }]), ln("cut", "offense", [{ x: 34, y: 33.5 }, { x: 42, y: 30 }])],
        note: "1 runs behind 2; 2 dribbles toward him for the handoff.",
      },
      {
        offense: [o("O1", 36, 26.5), o("O2", 39.5, 26.5), o("O3", 4, 17), o("O4", 6, 5), o("O5", 25, 42)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("cut", "offense", [{ x: 42, y: 30 }, { x: 36, y: 26.5 }]), ln("pass", "offense", [{ x: 39.5, y: 26.5 }, { x: 42, y: 30 }])],
        note: "Handoff: 1 takes it back going toward the middle.",
        ballArrival: [{ x: 39.5, y: 26.5 }, { x: 36, y: 26.5 }],
      },
      {
        offense: [o("O1", 36, 26.5), o("O2", 39.5, 26.5), o("O3", 4, 17), o("O4", 6, 5), o("O5", 30, 28.5)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("screen", "offense", [{ x: 25, y: 42 }, { x: 30, y: 28.5 }])],
        note: "5 trails into a ball screen.",
      },
      {
        offense: [o("O1", 25, 12.5), o("O2", 39.5, 26.5), o("O3", 4, 17), o("O4", 6, 5), o("O5", 33, 9)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("dribble", "offense", [{ x: 36, y: 26.5 }, { x: 32.4, y: 25.7 }, { x: 29.4, y: 24.3 }, { x: 27.3, y: 22.3 }, { x: 25.8, y: 19.6 }, { x: 25, y: 16.4 }, { x: 25, y: 12.5 }]), ln("cut", "offense", [{ x: 30, y: 28.5 }, { x: 33, y: 9 }])],
        note: "1 turns the corner and attacks the paint; 5 rolls.",
      },
    ]
  ),

  play(
    "elevator",
    "Elevator",
    "man",
    "vs Man",
    "Shooter runs through two bigs standing side by side; the doors close behind him. A go-to set for a three.",
    [
      "Bigs: stand a step apart, close on 2’s heels, no moving screens.",
      "2: run hard, catch on the move, feet set on the catch.",
      "If the defense switches, 4 or 5 seals the smaller man.",
    ],
    [
      {
        offense: [o("O1", 6, 22), o("O2", 25, 4.5), o("O3", 47, 3.5), o("O4", 22, 20.5), o("O5", 28, 20.5)],
        defense: [],
        ballHolder: "O1",
        lines: [],
        note: "Shooter runs through two bigs standing side by side; the doors close behind him. A go-to set for a three.",
      },
      {
        offense: [o("O1", 6, 22), o("O2", 25, 29), o("O3", 47, 3.5), o("O4", 22, 20.5), o("O5", 28, 20.5)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("cut", "offense", [{ x: 25, y: 4.5 }, { x: 25, y: 29 }])],
        note: "2 sprints from under the rim up through the gap between 4 and 5.",
      },
      {
        offense: [o("O1", 6, 22), o("O2", 25, 29), o("O3", 47, 3.5), o("O4", 23.8, 21.5), o("O5", 26.2, 21.5)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("screen", "offense", [{ x: 22, y: 20.5 }, { x: 23.8, y: 21.5 }]), ln("screen", "offense", [{ x: 28, y: 20.5 }, { x: 26.2, y: 21.5 }])],
        note: "The doors close: 4 and 5 step together right behind 2.",
      },
      {
        offense: [o("O1", 6, 22), o("O2", 25, 29), o("O3", 47, 3.5), o("O4", 23.8, 21.5), o("O5", 26.2, 21.5)],
        defense: [],
        ballHolder: "O2",
        lines: [ln("pass", "offense", [{ x: 6, y: 22 }, { x: 25, y: 29 }])],
        note: "1 hits 2 at the top for the three.",
        ballArrival: [{ x: 6, y: 22 }, { x: 25, y: 29 }],
      },
    ]
  ),

  play(
    "ucla",
    "UCLA Cut",
    "man",
    "vs Man",
    "Point guard passes to the wing and cuts off a high-post back screen. Flows into a ball screen for the wing.",
    [
      "1: set up the cut by stepping away, then cut off the screener’s shoulder.",
      "2: look for the lob or post-up first.",
      "5: after the back screen, turn and find the ball.",
    ],
    [
      {
        offense: [o("O1", 25, 33), o("O2", 44.5, 22), o("O3", 5.5, 22), o("O4", 3, 3.5), o("O5", 30, 20)],
        defense: [],
        ballHolder: "O1",
        lines: [],
        note: "Point guard passes to the wing and cuts off a high-post back screen. Flows into a ball screen for the wing.",
      },
      {
        offense: [o("O1", 25, 33), o("O2", 44.5, 22), o("O3", 5.5, 22), o("O4", 3, 3.5), o("O5", 30, 20)],
        defense: [],
        ballHolder: "O2",
        lines: [ln("pass", "offense", [{ x: 25, y: 33 }, { x: 44.5, y: 22 }])],
        note: "1 passes to 2 on the wing.",
        ballArrival: [{ x: 25, y: 33 }, { x: 44.5, y: 22 }],
      },
      {
        offense: [o("O1", 30, 6), o("O2", 44.5, 22), o("O3", 5.5, 22), o("O4", 3, 3.5), o("O5", 29, 22)],
        defense: [],
        ballHolder: "O2",
        lines: [ln("screen", "offense", [{ x: 30, y: 20 }, { x: 29, y: 22 }]), ln("cut", "offense", [{ x: 25, y: 33 }, { x: 27.5, y: 28.6 }, { x: 29.3, y: 24.2 }, { x: 30.5, y: 19.8 }, { x: 31, y: 15.2 }, { x: 30.8, y: 10.6 }, { x: 30, y: 6 }])],
        note: "5 back screens; 1 cuts hard to the rim.",
      },
      {
        offense: [o("O1", 47, 3.5), o("O2", 44.5, 22), o("O3", 5.5, 22), o("O4", 3, 3.5), o("O5", 40.5, 24)],
        defense: [],
        ballHolder: "O2",
        lines: [ln("cut", "offense", [{ x: 30, y: 6 }, { x: 47, y: 3.5 }]), ln("screen", "offense", [{ x: 29, y: 22 }, { x: 40.5, y: 24 }])],
        note: "1 clears to the corner. 5 steps out to ball screen for 2.",
      },
      {
        offense: [o("O1", 47, 3.5), o("O2", 28.5, 14), o("O3", 5.5, 22), o("O4", 3, 3.5), o("O5", 38, 8)],
        defense: [],
        ballHolder: "O2",
        lines: [ln("dribble", "offense", [{ x: 44.5, y: 22 }, { x: 41.4, y: 20.5 }, { x: 38.5, y: 19.1 }, { x: 35.8, y: 17.8 }, { x: 33.2, y: 16.4 }, { x: 30.8, y: 15.2 }, { x: 28.5, y: 14 }]), ln("cut", "offense", [{ x: 40.5, y: 24 }, { x: 38, y: 8 }])],
        note: "2 attacks the middle; 5 rolls.",
      },
    ]
  ),

  play(
    "cross",
    "Cross",
    "man",
    "vs Man",
    "Two wings cross to drag the defense out of the post, and the two bigs flash into the high post they just vacated. Whoever catches the entry pass has a live read, not one fixed action — the backdoor cut shown here is the first of three progressive options (a dribble handoff, then a ball screen, come next if the defense takes the backdoor away).",
    [
      "4 and 5: time the cut to the high post with the wings crossing below you — too early and the defense sees it coming.",
      "Cutting wing: take a couple of steps up before going backdoor — that sells the cut and opens the passing angle for the lob.",
      "If the backdoor isn't there, don't force it: the next read is the point guard cutting to the free-throw line for a dribble handoff with whoever caught the entry pass.",
      "If that's not open either, a ball screen between the post and the wing on that side is the third option.",
    ],
    [
      {
        offense: [o("O1", 25, 32), o("O2", 40, 22), o("O3", 10, 22), o("O4", 18, 10), o("O5", 32, 10)],
        defense: [],
        ballHolder: "O1",
        lines: [],
        note: "1 at the top with the ball, 2 and 3 on the wings, 4 and 5 on the blocks.",
      },
      {
        offense: [o("O1", 25, 32), o("O2", 14, 20), o("O3", 36, 20), o("O4", 18, 10), o("O5", 32, 10)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("cut", "offense", [{ x: 40, y: 22 }, { x: 14, y: 20 }]), ln("cut", "offense", [{ x: 10, y: 22 }, { x: 36, y: 20 }])],
        note: "2 and 3 cross to the opposite wings.",
      },
      {
        offense: [o("O1", 25, 32), o("O2", 14, 20), o("O3", 36, 20), o("O4", 20, 18), o("O5", 30, 18)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("cut", "offense", [{ x: 18, y: 10 }, { x: 20, y: 18 }]), ln("cut", "offense", [{ x: 32, y: 10 }, { x: 30, y: 18 }])],
        note: "As soon as they cross, 4 and 5 flash into the high post.",
      },
      {
        offense: [o("O1", 25, 32), o("O2", 14, 20), o("O3", 36, 20), o("O4", 20, 18), o("O5", 30, 18)],
        defense: [],
        ballHolder: "O5",
        lines: [ln("pass", "offense", [{ x: 25, y: 32 }, { x: 30, y: 18 }])],
        note: "1 enters the ball to 5 in the high post.",
        ballArrival: [{ x: 25, y: 32 }, { x: 30, y: 18 }],
      },
      {
        offense: [o("O1", 25, 32), o("O2", 14, 20), o("O3", 34, 8), o("O4", 20, 18), o("O5", 30, 18)],
        defense: [],
        ballHolder: "O3",
        lines: [ln("cut", "offense", [{ x: 36, y: 20 }, { x: 34, y: 8 }]), ln("pass", "offense", [{ x: 30, y: 18 }, { x: 34, y: 8 }])],
        note: "First option: 3 cuts backdoor and 5 finds him for the layup.",
        ballArrival: [{ x: 30, y: 18 }, { x: 34, y: 8 }],
      },
      {
        offense: [o("O1", 25, 32), o("O2", 14, 20), o("O3", 32, 6), o("O4", 20, 18), o("O5", 30, 18)],
        defense: [],
        ballHolder: "O3",
        lines: [],
        note: "Finish at the rim.",
      },
    ],
    "breakthroughbasketball.com, \"Man to Man Basketball Play - Cross\" — a named, move-by-move written breakdown of the entry and its first read; the 2nd, 3rd, and 4th options the article also describes (a dribble handoff, a ball screen, and an alternate wing-entry version) are noted above rather than drawn, since only one read can be diagrammed at a time."
  ),

  play(
    "zoom",
    "Zoom",
    "man",
    "vs Man",
    "An entry pass to 5 at the elbow starts a double zoom action: 1 screens down for 2 on the strong side while 3 screens down for 4 on the weak side, both at the exact same time. Whoever curls open takes a dribble handoff from 5 and attacks downhill. If neither has a driving lane, the handoff keeps moving to the next player at the top — continuous dribble-handoff action until someone gets a crack at the rim.",
    [
      "Screeners (1 and 3): go together, not one after the other — make the defense deal with both actions at the same time.",
      "Cutters (2 and 4): curl tight off the screen, right into 5's hip — a lazy, wide path gives the defense time to recover.",
      "5: catch and read immediately. Go to whichever side is actually open, not whichever side you planned on.",
      "No drive on the catch? Don't force it — hand off again to the next man coming through the top and keep the zoom going.",
    ],
    [
      {
        offense: [o("O1", 25, 32), o("O2", 43, 18), o("O3", 15, 27), o("O4", 7, 18), o("O5", 25, 22)],
        defense: [],
        ballHolder: "O1",
        lines: [],
        note: "1 at the top with the ball. 5 sets up at the elbow, just a step higher than usual. 4 is weak side, beyond the three. 3 is above 4, closer to the top. 2 is on the strong-side wing.",
      },
      {
        offense: [o("O1", 25, 32), o("O2", 43, 18), o("O3", 15, 27), o("O4", 7, 18), o("O5", 25, 22)],
        defense: [],
        ballHolder: "O5",
        lines: [ln("pass", "offense", [{ x: 25, y: 32 }, { x: 25, y: 22 }])],
        note: "1 enters the ball to 5 at the elbow.",
        ballArrival: [{ x: 25, y: 32 }, { x: 25, y: 22 }],
      },
      {
        offense: [o("O1", 36, 24), o("O2", 43, 18), o("O3", 13, 20), o("O4", 7, 18), o("O5", 25, 22)],
        defense: [],
        ballHolder: "O5",
        lines: [ln("screen", "offense", [{ x: 25, y: 32 }, { x: 36, y: 24 }]), ln("screen", "offense", [{ x: 15, y: 27 }, { x: 13, y: 20 }])],
        note: "1 cuts down to screen for 2 on the strong side. 3 screens for 4 on the weak side — both at the same time.",
      },
      {
        offense: [o("O1", 36, 24), o("O2", 30, 23), o("O3", 13, 20), o("O4", 19, 23), o("O5", 25, 22)],
        defense: [],
        ballHolder: "O5",
        lines: [
          ln("cut", "offense", [{ x: 43, y: 18 }, { x: 38, y: 22 }, { x: 33, y: 25 }, { x: 30, y: 23 }]),
          ln("cut", "offense", [{ x: 7, y: 18 }, { x: 12, y: 22 }, { x: 17, y: 25 }, { x: 19, y: 23 }]),
        ],
        note: "Both cut hard off the screens at the same time, right to 5's hip. 5 reads the defense for which side is actually open.",
      },
      {
        offense: [o("O1", 36, 24), o("O2", 29, 20), o("O3", 13, 20), o("O4", 19, 23), o("O5", 28, 21)],
        defense: [],
        ballHolder: "O2",
        lines: [ln("dribble", "offense", [{ x: 25, y: 22 }, { x: 28, y: 21 }]), ln("cut", "offense", [{ x: 30, y: 23 }, { x: 29, y: 20 }])],
        note: "5 dribbles at 2 and hands it off — 2 takes it off 5's hip while 5 peels away. (Same read, mirrored, if 4's side is the one that's open.)",
      },
      {
        offense: [o("O1", 36, 24), o("O2", 22, 8), o("O3", 13, 20), o("O4", 19, 23), o("O5", 25, 15)],
        defense: [],
        ballHolder: "O2",
        lines: [ln("dribble", "offense", [{ x: 29, y: 20 }, { x: 26, y: 14 }, { x: 23, y: 10 }, { x: 22, y: 8 }])],
        note: "2 drives downhill for the score. No drive? Keep it alive — hand off again to the next man at the top rather than forcing a bad shot.",
      },
    ]
  ),

  play(
    "zone-highlow",
    "High-Low vs 2-3",
    "zone",
    "vs 2-3 Zone",
    "Put a player at the free-throw line and one at the short corner. The middle of the zone can’t guard both.",
    [
      "High post: catch, face the rim, look low first.",
      "Short corner forces the bottom three to choose.",
      "Skip to the weak side when the zone over-shifts.",
      "Attack gaps, not zone players.",
    ],
    [
      {
        offense: [o("O1", 25, 32), o("O2", 44, 20), o("O3", 6, 20), o("O4", 25, 28), o("O5", 32, 8)],
        defense: [d("X1", "O1", { x: 19.5, y: 22.5 }), d("X2", "O1", { x: 30.5, y: 22.5 }), d("X3", "O1", { x: 12, y: 9.5 }), d("X4", "O1", { x: 38, y: 9.5 }), d("X5", "O1", { x: 25, y: 7 })],
        ballHolder: "O1",
        lines: [],
        note: "Put a player at the free-throw line and one at the short corner. The middle of the zone can’t guard both.",
      },
      {
        offense: [o("O1", 25, 32), o("O2", 44, 20), o("O3", 6, 20), o("O4", 25, 19.5), o("O5", 39.5, 6.5)],
        defense: [d("X1", "O2", { x: 28.5, y: 22.5 }), d("X2", "O2", { x: 40, y: 20.5 }), d("X3", "O2", { x: 12, y: 9.5 }), d("X4", "O2", { x: 39.5, y: 11 }), d("X5", "O2", { x: 25, y: 7 })],
        ballHolder: "O2",
        lines: [ln("cut", "offense", [{ x: 25, y: 28 }, { x: 25, y: 19.5 }]), ln("cut", "offense", [{ x: 32, y: 8 }, { x: 39.5, y: 6.5 }]), ln("cut", "defense", [{ x: 30.5, y: 22.5 }, { x: 40, y: 20.5 }]), ln("cut", "defense", [{ x: 19.5, y: 22.5 }, { x: 28.5, y: 22.5 }]), ln("cut", "defense", [{ x: 38, y: 9.5 }, { x: 39.5, y: 11 }]), ln("pass", "offense", [{ x: 25, y: 32 }, { x: 44, y: 20 }])],
        note: "1 enters to 2. 4 flashes to the free-throw line, 5 slides to the short corner. Zone shifts.",
        ballArrival: [{ x: 25, y: 32 }, { x: 44, y: 20 }],
      },
      {
        offense: [o("O1", 25, 32), o("O2", 44, 20), o("O3", 6, 20), o("O4", 25, 19.5), o("O5", 39.5, 6.5)],
        defense: [d("X1", "O4", { x: 26.5, y: 24.5 }), d("X2", "O4", { x: 40, y: 20.5 }), d("X3", "O4", { x: 12, y: 9.5 }), d("X4", "O4", { x: 39.5, y: 11 }), d("X5", "O4", { x: 25.5, y: 13.5 })],
        ballHolder: "O4",
        lines: [ln("cut", "defense", [{ x: 25, y: 7 }, { x: 25.5, y: 13.5 }]), ln("cut", "defense", [{ x: 28.5, y: 22.5 }, { x: 26.5, y: 24.5 }]), ln("pass", "offense", [{ x: 44, y: 20 }, { x: 25, y: 19.5 }])],
        note: "2 hits 4 at the high post. The middle collapses on him.",
        ballArrival: [{ x: 44, y: 20 }, { x: 25, y: 19.5 }],
      },
      {
        offense: [o("O1", 25, 32), o("O2", 44, 20), o("O3", 6, 20), o("O4", 25, 19.5), o("O5", 32.5, 4.5)],
        defense: [d("X1", "O5", { x: 26.5, y: 24.5 }), d("X2", "O5", { x: 40, y: 20.5 }), d("X3", "O5", { x: 12, y: 9.5 }), d("X4", "O5", { x: 39.5, y: 11 }), d("X5", "O5", { x: 25.5, y: 13.5 })],
        ballHolder: "O5",
        lines: [ln("cut", "offense", [{ x: 39.5, y: 6.5 }, { x: 32.5, y: 4.5 }]), ln("pass", "offense", [{ x: 25, y: 19.5 }, { x: 39.5, y: 6.5 }])],
        note: "5 steps in behind the center — 4 drops it down.",
        ballArrival: [{ x: 25, y: 19.5 }, { x: 32.5, y: 4.5 }],
      },
    ]
  ),

  play(
    "zone-overload",
    "Overload vs 2-3",
    "zone",
    "vs 2-3 Zone",
    "Put three players on one side of a 2-3 and make the bottom defender guard two people.",
    [
      "Overload side: corner, wing, elbow.",
      "Make the bottom defender guard two people.",
      "Weak-side block: stay ready — you’re the easiest basket.",
    ],
    [
      {
        offense: [o("O1", 32, 31), o("O2", 45, 21), o("O3", 47, 3.5), o("O4", 19, 8), o("O5", 30.5, 19)],
        defense: [d("X1", "O1", { x: 19.5, y: 22.5 }), d("X2", "O1", { x: 30.5, y: 22.5 }), d("X3", "O1", { x: 12, y: 9.5 }), d("X4", "O1", { x: 38, y: 9.5 }), d("X5", "O1", { x: 25, y: 7 })],
        ballHolder: "O1",
        lines: [],
        note: "Put three players on one side of a 2-3 and make the bottom defender guard two people.",
      },
      {
        offense: [o("O1", 32, 31), o("O2", 45, 21), o("O3", 47, 3.5), o("O4", 19, 8), o("O5", 30.5, 19)],
        defense: [d("X1", "O2", { x: 30, y: 23 }), d("X2", "O2", { x: 41.5, y: 21 }), d("X3", "O2", { x: 12, y: 9.5 }), d("X4", "O2", { x: 41, y: 11 }), d("X5", "O2", { x: 25, y: 7 })],
        ballHolder: "O2",
        lines: [ln("cut", "defense", [{ x: 30.5, y: 22.5 }, { x: 41.5, y: 21 }]), ln("cut", "defense", [{ x: 19.5, y: 22.5 }, { x: 30, y: 23 }]), ln("cut", "defense", [{ x: 38, y: 9.5 }, { x: 41, y: 11 }]), ln("pass", "offense", [{ x: 32, y: 31 }, { x: 45, y: 21 }])],
        note: "1 passes to 2. Three offensive players are now on one side.",
        ballArrival: [{ x: 32, y: 31 }, { x: 45, y: 21 }],
      },
      {
        offense: [o("O1", 32, 31), o("O2", 45, 21), o("O3", 47, 3.5), o("O4", 19, 8), o("O5", 30.5, 19)],
        defense: [d("X1", "O3", { x: 30, y: 23 }), d("X2", "O3", { x: 41.5, y: 21 }), d("X3", "O3", { x: 20, y: 9 }), d("X4", "O3", { x: 44.5, y: 6 }), d("X5", "O3", { x: 33, y: 8 })],
        ballHolder: "O3",
        lines: [ln("cut", "defense", [{ x: 41, y: 11 }, { x: 44.5, y: 6 }]), ln("cut", "defense", [{ x: 25, y: 7 }, { x: 33, y: 8 }]), ln("cut", "defense", [{ x: 12, y: 9.5 }, { x: 20, y: 9 }]), ln("pass", "offense", [{ x: 45, y: 21 }, { x: 47, y: 3.5 }])],
        note: "2 swings to 3 in the corner; x4 has to close out.",
        ballArrival: [{ x: 45, y: 21 }, { x: 47, y: 3.5 }],
      },
      {
        offense: [o("O1", 32, 31), o("O2", 45, 21), o("O3", 47, 3.5), o("O4", 19, 8), o("O5", 35, 7)],
        defense: [d("X1", "O5", { x: 30, y: 23 }), d("X2", "O5", { x: 41.5, y: 21 }), d("X3", "O5", { x: 20, y: 9 }), d("X4", "O5", { x: 44.5, y: 6 }), d("X5", "O5", { x: 33, y: 8 })],
        ballHolder: "O5",
        lines: [ln("cut", "offense", [{ x: 30.5, y: 19 }, { x: 35, y: 7 }]), ln("pass", "offense", [{ x: 47, y: 3.5 }, { x: 30.5, y: 19 }])],
        note: "5 dives from the elbow into the gap behind x4.",
        ballArrival: [{ x: 47, y: 3.5 }, { x: 35, y: 7 }],
      },
      {
        offense: [o("O1", 32, 31), o("O2", 45, 21), o("O3", 47, 3.5), o("O4", 19, 8), o("O5", 35, 7)],
        defense: [d("X1", "O4", { x: 30, y: 23 }), d("X2", "O4", { x: 41.5, y: 21 }), d("X3", "O4", { x: 20, y: 9 }), d("X4", "O4", { x: 44.5, y: 6 }), d("X5", "O4", { x: 33, y: 8 })],
        ballHolder: "O4",
        lines: [ln("pass", "offense", [{ x: 35, y: 7 }, { x: 19, y: 8 }])],
        note: "If x5 steps over, 4 is open on the weak block.",
        ballArrival: [{ x: 35, y: 7 }, { x: 19, y: 8 }],
      },
    ]
  ),

  play(
    "zone-step-up",
    "Step Up",
    "zone",
    "vs 2-3 Zone",
    "1 dribbles at 2, who steps up above the top of the zone to catch it right in the gap between the top two defenders. 2 drives that gap, collapsing the back of the zone onto the ball side — now overloaded — and skips cross-court to 3 for the open jumper the defense can't rotate to in time.",
    [
      "2: meet the dribble — step up into the gap the instant 1 comes at you, don't wait on the wing for a pass that splits the top two.",
      "2 on the catch: drive the gap hard. The whole point is making x4 and x5 both commit to you.",
      "3: stay spaced on the weak wing, hands ready — you're one pass from the easiest shot on the floor.",
      "The skip has to go the moment x4 and x5 both bite — a beat late and x3 recovers.",
    ],
    [
      {
        offense: [o("O1", 25, 31), o("O2", 44, 20), o("O3", 6, 20), o("O4", 6, 5), o("O5", 44, 5)],
        defense: [d("X1", "O1", { x: 19.5, y: 22.5 }), d("X2", "O1", { x: 30.5, y: 22.5 }), d("X3", "O1", { x: 12, y: 9.5 }), d("X4", "O1", { x: 38, y: 9.5 }), d("X5", "O1", { x: 25, y: 7 })],
        ballHolder: "O1",
        lines: [],
        note: "1-4 high vs a 2-3. 1 dribbles right at 2, looking to get him to step up and meet it above the zone.",
      },
      {
        offense: [o("O1", 30, 29), o("O2", 34, 25), o("O3", 6, 20), o("O4", 6, 5), o("O5", 44, 5)],
        defense: [d("X1", "O2", { x: 25, y: 23 }), d("X2", "O2", { x: 34.5, y: 23 }), d("X3", "O2", { x: 12, y: 9.5 }), d("X4", "O2", { x: 38, y: 9.5 }), d("X5", "O2", { x: 25, y: 7 })],
        ballHolder: "O2",
        lines: [
          ln("dribble", "offense", [{ x: 25, y: 31 }, { x: 30, y: 29 }]),
          ln("cut", "offense", [{ x: 44, y: 20 }, { x: 34, y: 25 }]),
          ln("cut", "defense", [{ x: 19.5, y: 22.5 }, { x: 25, y: 23 }]),
          ln("cut", "defense", [{ x: 30.5, y: 22.5 }, { x: 34.5, y: 23 }]),
          ln("pass", "offense", [{ x: 30, y: 29 }, { x: 34, y: 25 }]),
        ],
        note: "2 steps up above the zone to catch it right in the gap between x1 and x2.",
        ballArrival: [{ x: 30, y: 29 }, { x: 34, y: 25 }],
      },
      {
        offense: [o("O1", 25, 29), o("O2", 38, 14), o("O3", 6, 20), o("O4", 6, 5), o("O5", 41, 11)],
        defense: [d("X1", "O2", { x: 25, y: 23 }), d("X2", "O2", { x: 34.5, y: 23 }), d("X3", "O2", { x: 12, y: 9.5 }), d("X4", "O2", { x: 38, y: 13 }), d("X5", "O2", { x: 30, y: 9 })],
        ballHolder: "O2",
        lines: [
          ln("cut", "offense", [{ x: 30, y: 29 }, { x: 25, y: 29 }]),
          ln("dribble", "offense", [{ x: 34, y: 25 }, { x: 38, y: 14 }]),
          ln("cut", "offense", [{ x: 44, y: 5 }, { x: 41, y: 11 }]),
          ln("cut", "defense", [{ x: 38, y: 9.5 }, { x: 38, y: 13 }]),
          ln("cut", "defense", [{ x: 25, y: 7 }, { x: 30, y: 9 }]),
        ],
        note: "2 drives the gap. x4 and x5 both collapse to help — the defense is now overloaded to the ball side, and x3 is alone against both 3 and 4 on the weak side.",
      },
      {
        offense: [o("O1", 25, 29), o("O2", 38, 14), o("O3", 6, 20), o("O4", 6, 5), o("O5", 41, 11)],
        defense: [d("X1", "O3", { x: 25, y: 23 }), d("X2", "O3", { x: 34.5, y: 23 }), d("X3", "O3", { x: 12, y: 9.5 }), d("X4", "O3", { x: 38, y: 13 }), d("X5", "O3", { x: 30, y: 9 })],
        ballHolder: "O3",
        lines: [ln("pass", "offense", [{ x: 38, y: 14 }, { x: 6, y: 20 }])],
        note: "2 skips it cross-court to 3 — x3 can't get there in time. Open jumper.",
        ballArrival: [{ x: 38, y: 14 }, { x: 6, y: 20 }],
      },
    ]
  ),

  play(
    "zone-point",
    "Point",
    "zone",
    "vs 2-3 Zone",
    "2 runs the baseline from the right corner all the way to the opposite corner while 1 enters it to 3 on the left wing. Once the catch happens, 5 seals the middle of the zone and 4 loops under the rim to the left block 5 just vacated — 3 hits him there for the finish.",
    [
      "2: sell the full baseline run — the zone's bottom defender has to respect you the whole way across, not just at the start.",
      "1: the entry to 3 goes the moment 2 clears — same read either way, but the timing sells the shift.",
      "5: seal the middle defender hard — the whole point is opening the exact spot 4 is about to run into.",
      "4: stay under the rim on the loop, low and late — come too early and your own man beats you to the block.",
      "3: the pass to 4 has to go the instant he clears the block — a beat late and the seal doesn't matter.",
    ],
    [
      {
        offense: [o("O1", 33, 29), o("O2", 44, 3), o("O3", 8, 20), o("O4", 31.5, 7), o("O5", 18.5, 7)],
        defense: [d("X1", "O1", { x: 19.5, y: 22.5 }), d("X2", "O1", { x: 30.5, y: 22.5 }), d("X3", "O1", { x: 12, y: 9.5 }), d("X4", "O1", { x: 38, y: 9.5 }), d("X5", "O1", { x: 25, y: 7 })],
        ballHolder: "O1",
        lines: [],
        note: "1 up top on the right with the ball. 2 in the right corner, 4 on the right block, 5 on the left block, 3 on the left wing.",
      },
      {
        offense: [o("O1", 33, 29), o("O2", 6, 3), o("O3", 8, 20), o("O4", 31.5, 7), o("O5", 18.5, 7)],
        defense: [d("X1", "O3", { x: 14, y: 21 }), d("X2", "O3", { x: 24, y: 22 }), d("X3", "O3", { x: 9, y: 6 }), d("X4", "O3", { x: 28, y: 10 }), d("X5", "O3", { x: 20, y: 8 })],
        ballHolder: "O3",
        lines: [
          ln("cut", "offense", [{ x: 44, y: 3 }, { x: 6, y: 3 }]),
          ln("pass", "offense", [{ x: 33, y: 29 }, { x: 8, y: 20 }]),
          ln("cut", "defense", [{ x: 19.5, y: 22.5 }, { x: 14, y: 21 }]),
          ln("cut", "defense", [{ x: 30.5, y: 22.5 }, { x: 24, y: 22 }]),
          ln("cut", "defense", [{ x: 12, y: 9.5 }, { x: 9, y: 6 }]),
          ln("cut", "defense", [{ x: 38, y: 9.5 }, { x: 28, y: 10 }]),
          ln("cut", "defense", [{ x: 25, y: 7 }, { x: 20, y: 8 }]),
        ],
        note: "1 enters it to 3 on the left wing while 2 runs the baseline all the way to the opposite corner — the zone has to shift with both.",
        ballArrival: [{ x: 33, y: 29 }, { x: 8, y: 20 }],
      },
      {
        offense: [o("O1", 33, 29), o("O2", 6, 3), o("O3", 8, 20), o("O4", 18.5, 7), o("O5", 23, 6)],
        defense: [d("X1", "O3", { x: 14, y: 21 }), d("X2", "O3", { x: 24, y: 22 }), d("X3", "O3", { x: 9, y: 6 }), d("X4", "O3", { x: 28, y: 10 }), d("X5", "O3", { x: 24, y: 7 })],
        ballHolder: "O3",
        lines: [
          ln("cut", "offense", [{ x: 31.5, y: 7 }, { x: 25, y: 3 }, { x: 18.5, y: 7 }]),
          ln("cut", "offense", [{ x: 18.5, y: 7 }, { x: 23, y: 6 }]),
          ln("cut", "defense", [{ x: 20, y: 8 }, { x: 24, y: 7 }]),
        ],
        note: "5 seals the middle of the zone, opening the left block. 4 loops under the rim to the spot 5 just vacated.",
      },
      {
        offense: [o("O1", 33, 29), o("O2", 6, 3), o("O3", 8, 20), o("O4", 18.5, 7), o("O5", 23, 6)],
        defense: [d("X1", "O4", { x: 14, y: 21 }), d("X2", "O4", { x: 24, y: 22 }), d("X3", "O4", { x: 9, y: 6 }), d("X4", "O4", { x: 28, y: 10 }), d("X5", "O4", { x: 24, y: 7 })],
        ballHolder: "O4",
        lines: [ln("pass", "offense", [{ x: 8, y: 20 }, { x: 18.5, y: 7 }])],
        note: "3 delivers the pass to 4 on the left block for the finish — the seal and the loop both beat the zone.",
        ballArrival: [{ x: 8, y: 20 }, { x: 18.5, y: 7 }],
      },
    ]
  ),

  play(
    "zone-131",
    "Corners vs 1-3-1",
    "zone",
    "vs 1-3-1 Zone",
    "The 1-3-1 is weakest in the corners and behind the baseline runner. Even front at the top, fill both corners.",
    [
      "Even front (two guards) splits the top defender.",
      "The corners are open — the baseline runner can’t be in both.",
      "Don’t dribble into the wing traps; pass out of them.",
      "Skip to the opposite corner when x5 overplays.",
    ],
    [
      {
        offense: [o("O1", 16.5, 31), o("O2", 33.5, 31), o("O3", 3, 3.5), o("O4", 47, 3.5), o("O5", 39, 7.5)],
        defense: [d("X1", "O1", { x: 25, y: 30 }), d("X2", "O1", { x: 9, y: 20.5 }), d("X3", "O1", { x: 25, y: 20 }), d("X4", "O1", { x: 41, y: 20.5 }), d("X5", "O1", { x: 25, y: 6 })],
        ballHolder: "O1",
        lines: [],
        note: "The 1-3-1 is weakest in the corners and behind the baseline runner. Even front at the top, fill both corners.",
      },
      {
        offense: [o("O1", 16.5, 31), o("O2", 33.5, 31), o("O3", 3, 3.5), o("O4", 47, 3.5), o("O5", 39, 7.5)],
        defense: [d("X1", "O2", { x: 30, y: 29 }), d("X2", "O2", { x: 9, y: 20.5 }), d("X3", "O2", { x: 25, y: 20 }), d("X4", "O2", { x: 38, y: 25 }), d("X5", "O2", { x: 33, y: 6.5 })],
        ballHolder: "O2",
        lines: [ln("cut", "defense", [{ x: 25, y: 30 }, { x: 30, y: 29 }]), ln("cut", "defense", [{ x: 41, y: 20.5 }, { x: 38, y: 25 }]), ln("cut", "defense", [{ x: 25, y: 6 }, { x: 33, y: 6.5 }]), ln("pass", "offense", [{ x: 16.5, y: 31 }, { x: 33.5, y: 31 }])],
        note: "1 passes to 2. The top and wing defenders jump out.",
        ballArrival: [{ x: 16.5, y: 31 }, { x: 33.5, y: 31 }],
      },
      {
        offense: [o("O1", 16.5, 31), o("O2", 33.5, 31), o("O3", 3, 3.5), o("O4", 47, 3.5), o("O5", 39, 7.5)],
        defense: [d("X1", "O4", { x: 30, y: 29 }), d("X2", "O4", { x: 9, y: 20.5 }), d("X3", "O4", { x: 25, y: 20 }), d("X4", "O4", { x: 38, y: 25 }), d("X5", "O4", { x: 44, y: 5.5 })],
        ballHolder: "O4",
        lines: [ln("cut", "defense", [{ x: 33, y: 6.5 }, { x: 44, y: 5.5 }]), ln("pass", "offense", [{ x: 33.5, y: 31 }, { x: 47, y: 3.5 }])],
        note: "2 hits 4 in the corner. The baseline runner x5 has to race out.",
        ballArrival: [{ x: 33.5, y: 31 }, { x: 47, y: 3.5 }],
      },
      {
        offense: [o("O1", 16.5, 31), o("O2", 33.5, 31), o("O3", 3, 3.5), o("O4", 47, 3.5), o("O5", 29, 4.5)],
        defense: [d("X1", "O5", { x: 30, y: 29 }), d("X2", "O5", { x: 9, y: 20.5 }), d("X3", "O5", { x: 25, y: 20 }), d("X4", "O5", { x: 38, y: 25 }), d("X5", "O5", { x: 44, y: 5.5 })],
        ballHolder: "O5",
        lines: [ln("cut", "offense", [{ x: 39, y: 7.5 }, { x: 29, y: 4.5 }]), ln("pass", "offense", [{ x: 47, y: 3.5 }, { x: 39, y: 7.5 }])],
        note: "5 ducks in behind x5 for a lay-up.",
        ballArrival: [{ x: 47, y: 3.5 }, { x: 29, y: 4.5 }],
      },
    ]
  ),

  play(
    "zone-gap",
    "Gap Attack vs 1-2-2",
    "zone",
    "vs 1-2-2 / 3-2",
    "Against an odd front, attack the gaps on the dribble. Two defenders come to the ball and someone is left open.",
    [
      "Dribble into a gap, pass out of it.",
      "Even front beats an odd zone.",
      "Post slides to the spot the zone just left.",
    ],
    [
      {
        offense: [o("O1", 16.5, 32), o("O2", 33.5, 32), o("O3", 4, 18), o("O4", 46, 18), o("O5", 25, 13)],
        defense: [d("X1", "O1", { x: 25, y: 30 }), d("X2", "O1", { x: 16, y: 23.5 }), d("X3", "O1", { x: 34, y: 23.5 }), d("X4", "O1", { x: 13, y: 8.5 }), d("X5", "O1", { x: 37, y: 8.5 })],
        ballHolder: "O1",
        lines: [],
        note: "Against an odd front, attack the gaps on the dribble. Two defenders come to the ball and someone is left open.",
      },
      {
        offense: [o("O1", 21, 25.5), o("O2", 33.5, 32), o("O3", 4, 18), o("O4", 46, 18), o("O5", 25, 13)],
        defense: [d("X1", "O1", { x: 22.5, y: 27 }), d("X2", "O1", { x: 19, y: 24.5 }), d("X3", "O1", { x: 34, y: 23.5 }), d("X4", "O1", { x: 13, y: 8.5 }), d("X5", "O1", { x: 37, y: 8.5 })],
        ballHolder: "O1",
        lines: [ln("dribble", "offense", [{ x: 16.5, y: 32 }, { x: 21, y: 25.5 }]), ln("cut", "defense", [{ x: 25, y: 30 }, { x: 22.5, y: 27 }]), ln("cut", "defense", [{ x: 16, y: 23.5 }, { x: 19, y: 24.5 }])],
        note: "1 dribbles into the gap between x1 and x2.",
      },
      {
        offense: [o("O1", 21, 25.5), o("O2", 33.5, 32), o("O3", 4, 18), o("O4", 46, 18), o("O5", 25, 13)],
        defense: [d("X1", "O3", { x: 22.5, y: 27 }), d("X2", "O3", { x: 19, y: 24.5 }), d("X3", "O3", { x: 34, y: 23.5 }), d("X4", "O3", { x: 8.5, y: 16 }), d("X5", "O3", { x: 37, y: 8.5 })],
        ballHolder: "O3",
        lines: [ln("cut", "defense", [{ x: 13, y: 8.5 }, { x: 8.5, y: 16 }]), ln("pass", "offense", [{ x: 21, y: 25.5 }, { x: 4, y: 18 }])],
        note: "Two defenders on the ball — 1 hits 3 on the wing. x4 has to come up.",
        ballArrival: [{ x: 21, y: 25.5 }, { x: 4, y: 18 }],
      },
      {
        offense: [o("O1", 21, 25.5), o("O2", 33.5, 32), o("O3", 4, 18), o("O4", 46, 18), o("O5", 17, 7.5)],
        defense: [d("X1", "O5", { x: 22.5, y: 27 }), d("X2", "O5", { x: 19, y: 24.5 }), d("X3", "O5", { x: 34, y: 23.5 }), d("X4", "O5", { x: 8.5, y: 16 }), d("X5", "O5", { x: 37, y: 8.5 })],
        ballHolder: "O5",
        lines: [ln("cut", "offense", [{ x: 25, y: 13 }, { x: 17, y: 7.5 }]), ln("pass", "offense", [{ x: 4, y: 18 }, { x: 25, y: 13 }])],
        note: "5 slides to the open block behind x4.",
        ballArrival: [{ x: 4, y: 18 }, { x: 17, y: 7.5 }],
      },
    ]
  ),

  // --------------------- Coach Ryan Schultz's 2-3 zone plays (breakthroughbasketball.com)
  play(
    "schultz-stack",
    "Stack",
    "zone",
    "vs 2-3 Zone",
    "A quick ball reversal off a free-throw-line stack. The reversal pulls the zone's back-line defender out to the wing, and the ball-side post screens the player he left behind the instant the pass goes — opening a flash to the rim for the finish.",
    [
      "Screener (5): hold the screen until the pass actually arrives — too early and the defense has time to recover.",
      "2 and 3: reverse the ball with one hard pass, not two slow ones — a slow reversal lets the zone's rotation catch up.",
      "4: time the flash across the lane to the moment the screen lands, not before it.",
      "Whoever has the ball at the top: the reversal and the flash are the same read — the defense cannot cover both.",
    ],
    [
      {
        offense: [o("O1", 25, 32), o("O2", 24, 23), o("O3", 26, 20), o("O4", 8, 9), o("O5", 42, 9)],
        defense: [d("X1", "O2", { x: 19.5, y: 22.5 }), d("X2", "O3", { x: 30.5, y: 22.5 }), d("X3", "O4", { x: 12, y: 9.5 }), d("X4", "O5", { x: 38, y: 9.5 }), d("X5", "O1", { x: 25, y: 7 })],
        ballHolder: "O1",
        lines: [],
        note: "2-3 zone look: 1 at the top, 2 and 3 stacked at the free-throw line, 4 and 5 in the short corners.",
      },
      {
        offense: [o("O1", 10, 23), o("O2", 24, 23), o("O3", 26, 20), o("O4", 8, 9), o("O5", 42, 9)],
        defense: [d("X1", "O2", { x: 14, y: 23 }), d("X2", "O3", { x: 30.5, y: 22.5 }), d("X3", "O4", { x: 12, y: 9.5 }), d("X4", "O5", { x: 38, y: 9.5 }), d("X5", "O1", { x: 25, y: 7 })],
        ballHolder: "O1",
        lines: [ln("dribble", "offense", [{ x: 25, y: 32 }, { x: 10, y: 23 }])],
        note: "1 dribbles to the wing, pulling x1 out with him.",
      },
      {
        offense: [o("O1", 10, 23), o("O2", 25, 32), o("O3", 40, 23), o("O4", 8, 9), o("O5", 42, 9)],
        defense: [d("X1", "O2", { x: 14, y: 23 }), d("X2", "O3", { x: 30.5, y: 22.5 }), d("X3", "O4", { x: 12, y: 9.5 }), d("X4", "O5", { x: 38, y: 9.5 }), d("X5", "O1", { x: 25, y: 7 })],
        ballHolder: "O2",
        lines: [
          ln("cut", "offense", [{ x: 24, y: 23 }, { x: 25, y: 32 }]),
          ln("pass", "offense", [{ x: 10, y: 23 }, { x: 25, y: 32 }]),
          ln("cut", "offense", [{ x: 26, y: 20 }, { x: 40, y: 23 }]),
        ],
        note: "2 pops to the top and catches the pass from 1, while 3 pops out to the opposite wing at the same time.",
        ballArrival: [{ x: 10, y: 23 }, { x: 25, y: 32 }],
      },
      {
        offense: [o("O1", 10, 23), o("O2", 25, 32), o("O3", 40, 23), o("O4", 8, 9), o("O5", 27, 8)],
        defense: [d("X1", "O2", { x: 14, y: 23 }), d("X2", "O3", { x: 30.5, y: 22.5 }), d("X3", "O4", { x: 12, y: 9.5 }), d("X4", "O5", { x: 37, y: 20 }), d("X5", "O1", { x: 25, y: 7 })],
        ballHolder: "O3",
        lines: [
          ln("pass", "offense", [{ x: 25, y: 32 }, { x: 40, y: 23 }], 1),
          ln("screen", "offense", [{ x: 42, y: 9 }, { x: 27, y: 8 }], 2),
        ],
        note: "2 reverses to 3 with one quick pass — the swing forces x4 to come out and guard him. 5 screens x5 right as the ball leaves 2's hand.",
        ballArrival: [{ x: 25, y: 32 }, { x: 40, y: 23 }],
      },
      {
        offense: [o("O1", 10, 23), o("O2", 25, 32), o("O3", 40, 23), o("O4", 23, 8), o("O5", 27, 8)],
        defense: [d("X1", "O2", { x: 14, y: 23 }), d("X2", "O3", { x: 30.5, y: 22.5 }), d("X3", "O4", { x: 12, y: 9.5 }), d("X4", "O5", { x: 37, y: 20 }), d("X5", "O1", { x: 25, y: 7 })],
        ballHolder: "O4",
        lines: [ln("cut", "offense", [{ x: 8, y: 9 }, { x: 23, y: 8 }]), ln("pass", "offense", [{ x: 40, y: 23 }, { x: 23, y: 8 }])],
        note: "4 flashes across the lane behind the screen and catches the pass for the layup.",
        ballArrival: [{ x: 40, y: 23 }, { x: 23, y: 8 }],
      },
      {
        offense: [o("O1", 10, 23), o("O2", 25, 32), o("O3", 40, 23), o("O4", 25, 6), o("O5", 27, 8)],
        defense: [d("X1", "O2", { x: 14, y: 23 }), d("X2", "O3", { x: 30.5, y: 22.5 }), d("X3", "O4", { x: 12, y: 9.5 }), d("X4", "O5", { x: 37, y: 20 }), d("X5", "O1", { x: 25, y: 7 })],
        ballHolder: "O4",
        lines: [],
        note: "Finish at the rim.",
      },
    ],
    "breakthroughbasketball.com, \"How State Champion Coach Ryan Schultz Busts the 2-3 Zone: 3 Go-To Plays\" — a named, move-by-move written breakdown; the video Matt pointed at (same creator, same play, same name) is linked below.",
    "https://youtu.be/TYSBWUAR0qE"
  ),

  play(
    "schultz-shallow",
    "Shallow",
    "zone",
    "vs 2-3 Zone",
    "A dribble-at that drags the zone's attention toward the ball while 3 loops through the middle of the paint and pops out at the top, between the two guards. Whoever has to scramble back to pick him up gets screened on the catch, opening a drive down the middle with three live reads at the rim.",
    [
      "1: dribble right at 3 — the point is to pull the defense toward the ball before 3 even starts his cut.",
      "3: the cut is rounded, not straight — duck into the middle of the paint first, then come up between the two guards, not around the outside of either one.",
      "4: screen the side of the recovering defender nearest 2 — that's the side the drive is supposed to go.",
      "3 off the drive: read it as you go — shoot if nobody steps up, hit 2 in the corner if the defense collapses, or feed 5 at the rim if the middle opens.",
    ],
    [
      {
        offense: [o("O1", 25, 32), o("O2", 10, 22), o("O3", 40, 22), o("O4", 8, 9), o("O5", 42, 9)],
        defense: [d("X1", "O2", { x: 19.5, y: 22.5 }), d("X2", "O3", { x: 30.5, y: 22.5 }), d("X3", "O4", { x: 12, y: 9.5 }), d("X4", "O5", { x: 38, y: 9.5 }), d("X5", "O1", { x: 25, y: 7 })],
        ballHolder: "O1",
        lines: [],
        note: "2-3 zone look: 1 at the top, 2 and 3 on the wings, 4 and 5 in the short corners.",
      },
      {
        offense: [o("O1", 33, 26), o("O2", 10, 22), o("O3", 25, 29), o("O4", 8, 9), o("O5", 42, 9)],
        defense: [d("X1", "O2", { x: 20, y: 23 }), d("X2", "O3", { x: 32, y: 25 }), d("X3", "O4", { x: 12, y: 9.5 }), d("X4", "O5", { x: 38, y: 9.5 }), d("X5", "O1", { x: 25, y: 7 })],
        ballHolder: "O1",
        lines: [
          ln("dribble", "offense", [{ x: 25, y: 32 }, { x: 33, y: 26 }]),
          ln("cut", "offense", [{ x: 40, y: 22 }, { x: 29, y: 15 }, { x: 25, y: 29 }]),
        ],
        note: "1 dribbles right at 3, pulling the defense toward the ball, while 3 loops through the middle of the paint and pops up between the two guards.",
      },
      {
        offense: [o("O1", 33, 26), o("O2", 10, 22), o("O3", 25, 29), o("O4", 8, 9), o("O5", 42, 9)],
        defense: [d("X1", "O2", { x: 26, y: 28 }), d("X2", "O3", { x: 32, y: 25 }), d("X3", "O4", { x: 12, y: 9.5 }), d("X4", "O5", { x: 38, y: 9.5 }), d("X5", "O1", { x: 25, y: 7 })],
        ballHolder: "O3",
        lines: [ln("pass", "offense", [{ x: 33, y: 26 }, { x: 25, y: 29 }])],
        note: "1 passes to 3 at the top — x1 has to scramble back to pick him up.",
        ballArrival: [{ x: 33, y: 26 }, { x: 25, y: 29 }],
      },
      {
        offense: [o("O1", 33, 26), o("O2", 10, 22), o("O3", 25, 29), o("O4", 21, 27), o("O5", 42, 9)],
        defense: [d("X1", "O2", { x: 26, y: 28 }), d("X2", "O3", { x: 32, y: 25 }), d("X3", "O4", { x: 12, y: 9.5 }), d("X4", "O5", { x: 38, y: 9.5 }), d("X5", "O1", { x: 25, y: 7 })],
        ballHolder: "O3",
        lines: [ln("screen", "offense", [{ x: 8, y: 9 }, { x: 21, y: 27 }])],
        note: "As 3 catches it, 4 comes up and screens the recovering defender on the side where 2 is.",
      },
      {
        offense: [o("O1", 33, 26), o("O2", 6, 9), o("O3", 25, 15), o("O4", 21, 27), o("O5", 28, 7)],
        defense: [d("X1", "O2", { x: 26, y: 28 }), d("X2", "O3", { x: 32, y: 25 }), d("X3", "O4", { x: 12, y: 9.5 }), d("X4", "O5", { x: 38, y: 9.5 }), d("X5", "O1", { x: 25, y: 7 })],
        ballHolder: "O3",
        lines: [
          ln("dribble", "offense", [{ x: 25, y: 29 }, { x: 25, y: 15 }]),
          ln("cut", "offense", [{ x: 10, y: 22 }, { x: 6, y: 9 }]),
          ln("cut", "offense", [{ x: 42, y: 9 }, { x: 28, y: 7 }]),
        ],
        note: "3 drives to the middle of the lane off the screen. 2 moves to the corner, 5 moves to ball side by the hoop — 3 can shoot, hit 2, or hit 5 depending on the defense.",
      },
      {
        offense: [o("O1", 33, 26), o("O2", 6, 9), o("O3", 25, 15), o("O4", 21, 27), o("O5", 28, 7)],
        defense: [d("X1", "O2", { x: 26, y: 28 }), d("X2", "O3", { x: 32, y: 25 }), d("X3", "O4", { x: 12, y: 9.5 }), d("X4", "O5", { x: 38, y: 9.5 }), d("X5", "O1", { x: 25, y: 7 })],
        ballHolder: "O5",
        lines: [ln("pass", "offense", [{ x: 25, y: 15 }, { x: 28, y: 7 }])],
        note: "Here, the middle opens — 3 feeds 5 at the rim.",
        ballArrival: [{ x: 25, y: 15 }, { x: 28, y: 7 }],
      },
      {
        offense: [o("O1", 33, 26), o("O2", 6, 9), o("O3", 25, 15), o("O4", 21, 27), o("O5", 25, 6)],
        defense: [d("X1", "O2", { x: 26, y: 28 }), d("X2", "O3", { x: 32, y: 25 }), d("X3", "O4", { x: 12, y: 9.5 }), d("X4", "O5", { x: 38, y: 9.5 }), d("X5", "O1", { x: 25, y: 7 })],
        ballHolder: "O5",
        lines: [],
        note: "Finish at the rim.",
      },
    ],
    "Adapted from Coach Ryan Schultz's \"Shallow\" concept (breakthroughbasketball.com / the video Matt linked) — the rounded cut through the middle, the screen landing on the side nearest 2, and this specific finish are Matt's own version of the read, not the general branching description in the original breakdown.",
    "https://youtu.be/TYSBWUAR0qE"
  ),

  play(
    "schultz-xcounter",
    "X Counter",
    "zone",
    "vs 2-3 Zone",
    "A swing pass out and back that baits the zone into shifting, then the two wings cross and each screens the OPPOSITE top guard from the inside — not the one nearest to them — opening a driving lane straight through the middle of the zone.",
    [
      "2 and 3: cross all the way to the far guard, not just the nearest one — that's what actually opens the middle instead of just congesting your own side.",
      "1: the pass out and back is a fake, not a real reset — attack the gap the instant it opens, don't stop to survey it.",
      "4: read x5 the moment he commits to the drive and slip behind him right away — don't wait to see if the pass is actually coming.",
      "If x5 holds the rim instead of stepping up, pull up from the floor just inside the free-throw line — don't force a pass into a crowd.",
    ],
    [
      {
        offense: [o("O1", 25, 32), o("O2", 10, 22), o("O3", 40, 22), o("O4", 8, 9), o("O5", 42, 9)],
        defense: [d("X1", "O2", { x: 19.5, y: 22.5 }), d("X2", "O3", { x: 30.5, y: 22.5 }), d("X3", "O4", { x: 12, y: 9.5 }), d("X4", "O5", { x: 38, y: 9.5 }), d("X5", "O1", { x: 25, y: 7 })],
        ballHolder: "O1",
        lines: [],
        note: "2-3 zone look: 1 at the top, 2 and 3 on the wings, 4 and 5 in the short corners.",
      },
      {
        offense: [o("O1", 25, 32), o("O2", 10, 22), o("O3", 40, 22), o("O4", 8, 9), o("O5", 42, 9)],
        defense: [d("X1", "O2", { x: 19.5, y: 22.5 }), d("X2", "O3", { x: 30.5, y: 22.5 }), d("X3", "O4", { x: 12, y: 9.5 }), d("X4", "O5", { x: 38, y: 9.5 }), d("X5", "O1", { x: 25, y: 7 })],
        ballHolder: "O3",
        lines: [ln("pass", "offense", [{ x: 25, y: 32 }, { x: 40, y: 22 }])],
        note: "1 passes to 3.",
        ballArrival: [{ x: 25, y: 32 }, { x: 40, y: 22 }],
      },
      {
        offense: [o("O1", 25, 32), o("O2", 10, 22), o("O3", 40, 22), o("O4", 8, 9), o("O5", 42, 9)],
        defense: [d("X1", "O2", { x: 19.5, y: 22.5 }), d("X2", "O3", { x: 35, y: 23 }), d("X3", "O4", { x: 12, y: 9.5 }), d("X4", "O5", { x: 40, y: 12 }), d("X5", "O1", { x: 25, y: 7 })],
        ballHolder: "O1",
        lines: [ln("pass", "offense", [{ x: 40, y: 22 }, { x: 25, y: 32 }])],
        note: "3 immediately passes back to 1 — the quick swing makes the defense shift right before it has to recover.",
        ballArrival: [{ x: 40, y: 22 }, { x: 25, y: 32 }],
      },
      {
        offense: [o("O1", 25, 32), o("O2", 33, 20), o("O3", 20, 20), o("O4", 8, 9), o("O5", 42, 9)],
        defense: [d("X1", "O2", { x: 19.5, y: 22.5 }), d("X2", "O3", { x: 35, y: 23 }), d("X3", "O4", { x: 12, y: 9.5 }), d("X4", "O5", { x: 40, y: 12 }), d("X5", "O1", { x: 25, y: 7 })],
        ballHolder: "O1",
        lines: [ln("cut", "offense", [{ x: 10, y: 22 }, { x: 33, y: 20 }]), ln("cut", "offense", [{ x: 40, y: 22 }, { x: 20, y: 20 }])],
        note: "2 and 3 sprint across the lane and cross — each screens the OPPOSITE guard from the inside, not the one closest to where they started — opening a path down the middle.",
      },
      {
        offense: [o("O1", 25, 16), o("O2", 33, 20), o("O3", 20, 20), o("O4", 8, 9), o("O5", 42, 9)],
        defense: [d("X1", "O2", { x: 19.5, y: 22.5 }), d("X2", "O3", { x: 35, y: 23 }), d("X3", "O4", { x: 12, y: 9.5 }), d("X4", "O5", { x: 40, y: 12 }), d("X5", "O1", { x: 25, y: 13 })],
        ballHolder: "O1",
        lines: [ln("dribble", "offense", [{ x: 25, y: 32 }, { x: 25, y: 16 }])],
        note: "1 attacks the gap the screens just opened — x5 steps up to stop the drive.",
      },
      {
        offense: [o("O1", 25, 16), o("O2", 33, 20), o("O3", 20, 20), o("O4", 27, 6), o("O5", 42, 9)],
        defense: [d("X1", "O2", { x: 19.5, y: 22.5 }), d("X2", "O3", { x: 35, y: 23 }), d("X3", "O4", { x: 12, y: 9.5 }), d("X4", "O5", { x: 40, y: 12 }), d("X5", "O1", { x: 25, y: 13 })],
        ballHolder: "O4",
        lines: [ln("cut", "offense", [{ x: 8, y: 9 }, { x: 27, y: 6 }]), ln("pass", "offense", [{ x: 25, y: 16 }, { x: 27, y: 6 }])],
        note: "With x5 committed to the drive, 4 slips behind him to the rim for the pass — a lob or a bounce pass depending on the distance.",
        ballArrival: [{ x: 25, y: 16 }, { x: 27, y: 6 }],
      },
      {
        offense: [o("O1", 25, 16), o("O2", 33, 20), o("O3", 20, 20), o("O4", 25, 5.5), o("O5", 42, 9)],
        defense: [d("X1", "O2", { x: 19.5, y: 22.5 }), d("X2", "O3", { x: 35, y: 23 }), d("X3", "O4", { x: 12, y: 9.5 }), d("X4", "O5", { x: 40, y: 12 }), d("X5", "O1", { x: 25, y: 13 })],
        ballHolder: "O4",
        lines: [],
        note: "Finish at the rim.",
      },
    ],
    "breakthroughbasketball.com, \"How State Champion Coach Ryan Schultz Busts the 2-3 Zone: 3 Go-To Plays\" — a named, move-by-move written breakdown; the video Matt pointed at (same creator, same play, same name) is linked below. The alternate finish the article describes (1 pulling up just inside the free-throw line if x5 stays home) is noted above rather than drawn. The two screens crossing to the opposite guard (rather than each to the nearest one) is Matt's own adjustment to the read.",
    "https://youtu.be/TYSBWUAR0qE"
  ),

  play(
    "zone-x",
    "X",
    "zone",
    "vs 2-1-2 Zone",
    "Same 1-up/2-wing/2-corner shape as X Counter, but vs a 2-1-2: a quick swing from 1 to 2 and back, then to 3, makes the zone shift twice before 2 and 4 set backside screens on their OWN defenders so 1 can cut to the opposite wing for a skip-pass catch-and-shoot — with a built-in dump-down to a sealing 4 if the defense recovers.",
    [
      "1: the pass to 2 and back needs to be live and quick — that's what actually gets the zone shifting side to side, not just resetting it in place.",
      "2 and 4: screen the BACKSIDE of your own defender, not just near him — he's shifted toward the ball and won't see you coming if you get on his blind side.",
      "1: cut hard off both screens all the way to the opposite wing — the skip pass is coming the instant you get there, not a beat later.",
      "If 4's defender (x3) fights through the screen and gets back to guard 1 on the catch, 4 should seal the middle defender (x5) inside instead — 1 dumps it down to 4 for the layup rather than forcing a contested shot.",
    ],
    [
      {
        offense: [o("O1", 25, 32), o("O2", 10, 22), o("O3", 40, 22), o("O4", 8, 9), o("O5", 42, 9)],
        defense: [d("X1", "O2", { x: 19.5, y: 24 }), d("X2", "O3", { x: 30.5, y: 24 }), d("X3", "O4", { x: 12, y: 9 }), d("X4", "O5", { x: 38, y: 9 }), d("X5", "O1", { x: 25, y: 18 })],
        ballHolder: "O1",
        lines: [],
        note: "2-1-2 zone look: 1 at the top, 2 and 3 on the wings, 4 and 5 in the corners. 5 sits high at the free-throw line as the zone's lone middle defender; 3 and 4 cover the two corners; 1 and 2 are the two guards up top.",
      },
      {
        offense: [o("O1", 25, 32), o("O2", 10, 22), o("O3", 40, 22), o("O4", 8, 9), o("O5", 42, 9)],
        defense: [d("X1", "O2", { x: 14, y: 22 }), d("X2", "O3", { x: 26, y: 21 }), d("X3", "O4", { x: 10, y: 10 }), d("X4", "O5", { x: 33, y: 11 }), d("X5", "O1", { x: 19, y: 17 })],
        ballHolder: "O2",
        lines: [
          ln("pass", "offense", [{ x: 25, y: 32 }, { x: 10, y: 22 }]),
          ln("cut", "defense", [{ x: 19.5, y: 24 }, { x: 14, y: 22 }]),
          ln("cut", "defense", [{ x: 30.5, y: 24 }, { x: 26, y: 21 }]),
          ln("cut", "defense", [{ x: 12, y: 9 }, { x: 10, y: 10 }]),
          ln("cut", "defense", [{ x: 38, y: 9 }, { x: 33, y: 11 }]),
          ln("cut", "defense", [{ x: 25, y: 18 }, { x: 19, y: 17 }]),
        ],
        note: "1 passes to 2 on the wing — the zone shifts hard to the ball side.",
        ballArrival: [{ x: 25, y: 32 }, { x: 10, y: 22 }],
      },
      {
        offense: [o("O1", 25, 32), o("O2", 10, 22), o("O3", 40, 22), o("O4", 8, 9), o("O5", 42, 9)],
        defense: [d("X1", "O2", { x: 19.5, y: 24 }), d("X2", "O3", { x: 30.5, y: 24 }), d("X3", "O4", { x: 12, y: 9 }), d("X4", "O5", { x: 38, y: 9 }), d("X5", "O1", { x: 25, y: 18 })],
        ballHolder: "O1",
        lines: [
          ln("pass", "offense", [{ x: 10, y: 22 }, { x: 25, y: 32 }]),
          ln("cut", "defense", [{ x: 14, y: 22 }, { x: 19.5, y: 24 }]),
          ln("cut", "defense", [{ x: 26, y: 21 }, { x: 30.5, y: 24 }]),
          ln("cut", "defense", [{ x: 10, y: 10 }, { x: 12, y: 9 }]),
          ln("cut", "defense", [{ x: 33, y: 11 }, { x: 38, y: 9 }]),
          ln("cut", "defense", [{ x: 19, y: 17 }, { x: 25, y: 18 }]),
        ],
        note: "2 swings it right back to 1 at the top — the zone has to recover just as fast as it shifted.",
        ballArrival: [{ x: 10, y: 22 }, { x: 25, y: 32 }],
      },
      {
        offense: [o("O1", 25, 32), o("O2", 10, 22), o("O3", 40, 22), o("O4", 8, 9), o("O5", 42, 9)],
        defense: [d("X1", "O2", { x: 24, y: 21 }), d("X2", "O3", { x: 36, y: 22 }), d("X3", "O4", { x: 17, y: 11 }), d("X4", "O5", { x: 40, y: 10 }), d("X5", "O1", { x: 31, y: 17 })],
        ballHolder: "O3",
        lines: [
          ln("pass", "offense", [{ x: 25, y: 32 }, { x: 40, y: 22 }]),
          ln("cut", "defense", [{ x: 19.5, y: 24 }, { x: 24, y: 21 }]),
          ln("cut", "defense", [{ x: 30.5, y: 24 }, { x: 36, y: 22 }]),
          ln("cut", "defense", [{ x: 12, y: 9 }, { x: 17, y: 11 }]),
          ln("cut", "defense", [{ x: 38, y: 9 }, { x: 40, y: 10 }]),
          ln("cut", "defense", [{ x: 25, y: 18 }, { x: 31, y: 17 }]),
        ],
        note: "1 reverses it to 3 on the other wing — now the zone shifts hard the other way, toward the ball.",
        ballArrival: [{ x: 25, y: 32 }, { x: 40, y: 22 }],
      },
      {
        offense: [o("O1", 10, 22), o("O2", 22.5, 19), o("O3", 40, 22), o("O4", 15, 10), o("O5", 42, 9)],
        defense: [d("X1", "O2", { x: 24, y: 21 }), d("X2", "O3", { x: 36, y: 22 }), d("X3", "O4", { x: 17, y: 11 }), d("X4", "O5", { x: 40, y: 10 }), d("X5", "O1", { x: 31, y: 17 })],
        ballHolder: "O3",
        lines: [
          ln("screen", "offense", [{ x: 10, y: 22 }, { x: 22.5, y: 19 }]),
          ln("screen", "offense", [{ x: 8, y: 9 }, { x: 15, y: 10 }]),
          ln("cut", "offense", [{ x: 25, y: 32 }, { x: 20, y: 25 }, { x: 10, y: 22 }]),
        ],
        note: "2 and 4 both come across and set a backside screen on the defender nearest them — catching x1 and x3 blind while they're still shifted toward the ball. 1 cuts off both screens all the way to the opposite wing, away from the ball.",
      },
      {
        offense: [o("O1", 10, 22), o("O2", 22.5, 19), o("O3", 40, 22), o("O4", 15, 10), o("O5", 42, 9)],
        defense: [d("X1", "O2", { x: 24, y: 21 }), d("X2", "O3", { x: 30, y: 22 }), d("X3", "O4", { x: 17, y: 11 }), d("X4", "O5", { x: 40, y: 10 }), d("X5", "O1", { x: 31, y: 17 })],
        ballHolder: "O1",
        lines: [
          ln("pass", "offense", [{ x: 40, y: 22 }, { x: 10, y: 22 }]),
          ln("cut", "defense", [{ x: 36, y: 22 }, { x: 30, y: 22 }]),
        ],
        note: "3 skips it cross-court to 1, wide open on the wing — x1 is still fighting through 2's screen and can't closeout in time.",
        ballArrival: [{ x: 40, y: 22 }, { x: 10, y: 22 }],
      },
    ]
  ),

  play(
    "zone-short-flash",
    "Short Flash",
    "zone",
    "vs 2-1-2 Zone",
    "Work the ball down into the short corner, and the instant that catch happens the slot man flashes hard through the gap to the rim for a direct score. Not open? He clears through and the perimeter fills behind him — this is a continuity, not a one-time set, so every time the ball reverses, 5 slides to the new ball-side short corner and whoever's in the slot flashes the same way again.",
    [
      "5: get all the way into the short corner early and stay a target there — the catch is what triggers everything else.",
      "Slot man: time the flash to the instant 5 catches it, not before — cutting early just gets you covered before the ball's even there.",
      "Not open on the flash? Clear all the way through to the far side — standing in the lane only takes away the next cutter's driving room.",
      "Every time the ball swings to the other side, 5 relocates to the new short corner and the new slot man gets the same read — keep running it until it's there.",
    ],
    [
      {
        offense: [o("O4", 9, 29), o("O3", 7, 20), o("O1", 31, 26), o("O2", 44, 20), o("O5", 39, 10)],
        defense: [],
        ballHolder: "O1",
        lines: [],
        note: "2-1-2 look: 4 and 3 stacked on the left side of the perimeter (not down in the corner), 1 in the slot right of center, 2 at free-throw-line-extended on the right, 5 working the short corner on 2's side.",
      },
      {
        offense: [o("O4", 9, 29), o("O3", 7, 20), o("O1", 31, 26), o("O2", 44, 20), o("O5", 39, 10)],
        defense: [],
        ballHolder: "O2",
        lines: [ln("pass", "offense", [{ x: 31, y: 26 }, { x: 44, y: 20 }])],
        note: "1 swings it to 2 on the side where 5 is working the short corner.",
        ballArrival: [{ x: 31, y: 26 }, { x: 44, y: 20 }],
      },
      {
        offense: [o("O4", 9, 29), o("O3", 7, 20), o("O1", 31, 26), o("O2", 44, 20), o("O5", 39, 10)],
        defense: [],
        ballHolder: "O5",
        lines: [ln("pass", "offense", [{ x: 44, y: 20 }, { x: 39, y: 10 }])],
        note: "2 feeds it down into the short corner.",
        ballArrival: [{ x: 44, y: 20 }, { x: 39, y: 10 }],
      },
      {
        offense: [o("O4", 9, 29), o("O3", 7, 20), o("O1", 29, 8), o("O2", 44, 20), o("O5", 39, 10)],
        defense: [],
        ballHolder: "O5",
        lines: [ln("cut", "offense", [{ x: 31, y: 26 }, { x: 29, y: 8 }])],
        note: "Only once 5 has the ball does 1 flash — hard, through the gap from the slot, calling for it right at the rim.",
      },
      {
        offense: [o("O4", 9, 29), o("O3", 7, 20), o("O1", 29, 8), o("O2", 44, 20), o("O5", 39, 10)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("pass", "offense", [{ x: 39, y: 10 }, { x: 29, y: 8 }])],
        note: "5 hits 1 cutting through the gap for the layup.",
        ballArrival: [{ x: 39, y: 10 }, { x: 29, y: 8 }],
      },
    ]
  ),

  play(
    "zone-drop",
    "Drop",
    "zone",
    "vs 2-1-2 Zone",
    "Work it in to 5 at the free-throw line. The instant that catch happens, both wings drop from free-throw-line-extended down to the corners and 4 posts up on the block — 5 now has three live reads at once: either corner shooter or 4 down low.",
    [
      "5: catch facing the rim at the free-throw line — you need all three targets in view the moment you catch it.",
      "Both wings: drop to the corner together, right as 5 catches it — don't wait to see where the ball goes first.",
      "4: post up hard on the catch and seal for it — you're a live scoring option, not a decoy.",
      "If the zone collapses to take away a corner, the other corner or 4 underneath is the read — if it collapses on 4 instead, one of the corners is open.",
    ],
    [
      {
        offense: [o("O1", 25, 30), o("O3", 6, 20), o("O2", 44, 20), o("O5", 25, 19), o("O4", 19, 8)],
        defense: [],
        ballHolder: "O1",
        lines: [],
        note: "1 at the top, 2 and 3 on opposite wings at free-throw-line-extended, 5 at the free-throw line, 4 on the block.",
      },
      {
        offense: [o("O1", 25, 30), o("O3", 6, 20), o("O2", 44, 20), o("O5", 25, 19), o("O4", 19, 8)],
        defense: [],
        ballHolder: "O5",
        lines: [ln("pass", "offense", [{ x: 25, y: 30 }, { x: 25, y: 19 }])],
        note: "1 feeds it in to 5 at the free-throw line.",
        ballArrival: [{ x: 25, y: 30 }, { x: 25, y: 19 }],
      },
      {
        offense: [o("O1", 25, 30), o("O3", 6, 9), o("O2", 44, 9), o("O5", 25, 19), o("O4", 21, 6)],
        defense: [],
        ballHolder: "O5",
        lines: [
          ln("cut", "offense", [{ x: 6, y: 20 }, { x: 6, y: 9 }]),
          ln("cut", "offense", [{ x: 44, y: 20 }, { x: 44, y: 9 }]),
          ln("cut", "offense", [{ x: 19, y: 8 }, { x: 21, y: 6 }]),
        ],
        note: "On the catch, 2 and 3 both drop straight down to the corners and 4 posts up tight on the block — 5 now has three live reads.",
      },
      {
        offense: [o("O1", 25, 30), o("O3", 6, 9), o("O2", 44, 9), o("O5", 25, 19), o("O4", 21, 6)],
        defense: [],
        ballHolder: "O2",
        lines: [ln("pass", "offense", [{ x: 25, y: 19 }, { x: 44, y: 9 }])],
        note: "5 reads the zone and kicks out to 2 in the corner for the catch-and-shoot.",
        ballArrival: [{ x: 25, y: 19 }, { x: 44, y: 9 }],
      },
    ]
  ),

  play(
    "box-break",
    "Box Press Break",
    "fullCourt",
    "vs Man / Run & Jump",
    "Four players in a box in the backcourt. Down screens free your guards, the screeners roll to the middle.",
    [
      "Meet every pass. Catch, pivot, face up.",
      "The middle beats every press.",
      "Inbounder steps in right away as the reversal.",
      "Don’t dribble into a trap — pass over it.",
    ],
    [
      {
        offense: [o("O1", 18, 78.2), o("O2", 32, 78.2), o("O3", 18, 65.7), o("O4", 25, 85.6), o("O5", 32, 65.7)],
        defense: [d("X4", "O4", { x: 25, y: 82.7 }), d("X1", "O4", { x: 19.5, y: 76.9 }), d("X2", "O4", { x: 30.5, y: 76.9 }), d("X3", "O4", { x: 19.5, y: 64.3 }), d("X5", "O4", { x: 30.5, y: 64.3 })],
        ballHolder: "O4",
        lines: [],
        note: "Four players in a box in the backcourt. Down screens free your guards, the screeners roll to the middle.",
      },
      {
        offense: [o("O1", 18, 78.2), o("O2", 32, 78.2), o("O3", 18.5, 75.5), o("O4", 25, 85.6), o("O5", 31.5, 75.5)],
        defense: [d("X4", "O4", { x: 25, y: 82.7 }), d("X1", "O4", { x: 19.5, y: 76.9 }), d("X2", "O4", { x: 30.5, y: 76.9 }), d("X3", "O4", { x: 19.5, y: 64.3 }), d("X5", "O4", { x: 30.5, y: 64.3 })],
        ballHolder: "O4",
        lines: [ln("screen", "offense", [{ x: 18, y: 65.7 }, { x: 18.5, y: 75.5 }]), ln("screen", "offense", [{ x: 32, y: 65.7 }, { x: 31.5, y: 75.5 }])],
        note: "On the slap: 3 screens down for 1, 5 screens down for 2.",
      },
      {
        offense: [o("O1", 6.5, 78.6), o("O2", 43.5, 78.6), o("O3", 22.5, 65.7), o("O4", 25, 85.6), o("O5", 32, 50)],
        defense: [d("X4", "O4", { x: 25, y: 82.7 }), d("X1", "O4", { x: 9, y: 76.4 }), d("X2", "O4", { x: 41, y: 76.4 }), d("X3", "O4", { x: 23, y: 67.9 }), d("X5", "O4", { x: 32, y: 53.6 })],
        ballHolder: "O4",
        lines: [ln("cut", "offense", [{ x: 18, y: 78.2 }, { x: 15.5, y: 76.1 }, { x: 13.2, y: 74.9 }, { x: 11.1, y: 74.5 }, { x: 9.3, y: 75 }, { x: 7.8, y: 76.4 }, { x: 6.5, y: 78.6 }]), ln("cut", "offense", [{ x: 32, y: 78.2 }, { x: 34.5, y: 76.1 }, { x: 36.8, y: 74.9 }, { x: 38.9, y: 74.5 }, { x: 40.7, y: 75 }, { x: 42.2, y: 76.4 }, { x: 43.5, y: 78.6 }]), ln("cut", "offense", [{ x: 18.5, y: 75.5 }, { x: 22.5, y: 65.7 }]), ln("cut", "offense", [{ x: 31.5, y: 75.5 }, { x: 32, y: 50 }]), ln("cut", "defense", [{ x: 19.5, y: 76.9 }, { x: 9, y: 76.4 }]), ln("cut", "defense", [{ x: 30.5, y: 76.9 }, { x: 41, y: 76.4 }]), ln("cut", "defense", [{ x: 19.5, y: 64.3 }, { x: 23, y: 67.9 }]), ln("cut", "defense", [{ x: 30.5, y: 64.3 }, { x: 32, y: 53.6 }])],
        note: "1 and 2 pop to the corners; 3 holds the middle, 5 runs ahead.",
      },
      {
        offense: [o("O1", 6.5, 78.6), o("O2", 43.5, 78.6), o("O3", 22.5, 65.7), o("O4", 21, 80.9), o("O5", 32, 50)],
        defense: [d("X4", "O1", { x: 25, y: 82.7 }), d("X1", "O1", { x: 9, y: 76.4 }), d("X2", "O1", { x: 41, y: 76.4 }), d("X3", "O1", { x: 23, y: 67.9 }), d("X5", "O1", { x: 32, y: 53.6 })],
        ballHolder: "O1",
        lines: [ln("cut", "offense", [{ x: 25, y: 85.6 }, { x: 21, y: 80.9 }]), ln("pass", "offense", [{ x: 25, y: 85.6 }, { x: 6.5, y: 78.6 }])],
        note: "4 inbounds to 1 and steps in as the safety.",
        ballArrival: [{ x: 25, y: 85.6 }, { x: 6.5, y: 78.6 }],
      },
      {
        offense: [o("O1", 6.5, 78.6), o("O2", 44, 46.5), o("O3", 23, 62.6), o("O4", 21, 80.9), o("O5", 33, 32.2)],
        defense: [d("X4", "O3", { x: 25, y: 82.7 }), d("X1", "O3", { x: 9, y: 76.4 }), d("X2", "O3", { x: 41, y: 76.4 }), d("X3", "O3", { x: 23, y: 67.9 }), d("X5", "O3", { x: 32, y: 53.6 })],
        ballHolder: "O3",
        lines: [ln("cut", "offense", [{ x: 22.5, y: 65.7 }, { x: 23, y: 62.6 }]), ln("cut", "offense", [{ x: 43.5, y: 78.6 }, { x: 44, y: 46.5 }]), ln("cut", "offense", [{ x: 32, y: 50 }, { x: 33, y: 32.2 }]), ln("pass", "offense", [{ x: 6.5, y: 78.6 }, { x: 22.5, y: 65.7 }])],
        note: "Ball to the middle: 1 hits 3 flashing up. 2 and 5 run the lanes.",
        ballArrival: [{ x: 6.5, y: 78.6 }, { x: 23, y: 62.6 }],
      },
      {
        offense: [o("O1", 6.5, 78.6), o("O2", 44, 46.5), o("O3", 23, 62.6), o("O4", 21, 80.9), o("O5", 33, 32.2)],
        defense: [d("X4", "O2", { x: 25, y: 82.7 }), d("X1", "O2", { x: 9, y: 76.4 }), d("X2", "O2", { x: 41, y: 76.4 }), d("X3", "O2", { x: 23, y: 67.9 }), d("X5", "O2", { x: 32, y: 53.6 })],
        ballHolder: "O2",
        lines: [ln("pass", "offense", [{ x: 23, y: 62.6 }, { x: 44, y: 46.5 }])],
        note: "3 turns and pushes ahead to 2 on the sideline.",
        ballArrival: [{ x: 23, y: 62.6 }, { x: 44, y: 46.5 }],
      },
    ]
  ),

  play(
    "one-four-break",
    "1-4 Press Break",
    "fullCourt",
    "vs Zone Press (2-2-1)",
    "Line up four across. Guards go back to the corners, the others push up the floor so there is always a middle and a sideline.",
    [
      "Get the ball in before the trap sets.",
      "Middle player: face the ball, show two hands.",
      "Pass out of the trap with a pivot and a fake.",
      "Attack the rim after you beat it — numbers are on your side.",
    ],
    [
      {
        offense: [o("O1", 8, 73.3), o("O2", 42, 73.3), o("O3", 19, 73.3), o("O4", 25, 85.6), o("O5", 31, 73.3)],
        defense: [d("X1", "O4", { x: 17.5, y: 77.7 }), d("X2", "O4", { x: 32.5, y: 77.7 }), d("X3", "O4", { x: 15, y: 57.2 }), d("X4", "O4", { x: 35, y: 57.2 }), d("X5", "O4", { x: 25, y: 31.3 })],
        ballHolder: "O4",
        lines: [],
        note: "Line up four across. Guards go back to the corners, the others push up the floor so there is always a middle and a sideline.",
      },
      {
        offense: [o("O1", 7, 80.4), o("O2", 43, 80.4), o("O3", 19, 73.3), o("O4", 25, 85.6), o("O5", 31, 73.3)],
        defense: [d("X1", "O4", { x: 17.5, y: 77.7 }), d("X2", "O4", { x: 32.5, y: 77.7 }), d("X3", "O4", { x: 15, y: 57.2 }), d("X4", "O4", { x: 35, y: 57.2 }), d("X5", "O4", { x: 25, y: 31.3 })],
        ballHolder: "O4",
        lines: [ln("cut", "offense", [{ x: 8, y: 73.3 }, { x: 7, y: 80.4 }]), ln("cut", "offense", [{ x: 42, y: 73.3 }, { x: 43, y: 80.4 }])],
        note: "On the slap, 1 and 2 break back toward the corners.",
      },
      {
        offense: [o("O1", 7, 80.4), o("O2", 43, 80.4), o("O3", 12, 55.4), o("O4", 25, 85.6), o("O5", 25.5, 61.7)],
        defense: [d("X1", "O4", { x: 17.5, y: 77.7 }), d("X2", "O4", { x: 32.5, y: 77.7 }), d("X3", "O4", { x: 15, y: 57.2 }), d("X4", "O4", { x: 35, y: 57.2 }), d("X5", "O4", { x: 25, y: 31.3 })],
        ballHolder: "O4",
        lines: [ln("cut", "offense", [{ x: 19, y: 73.3 }, { x: 12, y: 55.4 }]), ln("cut", "offense", [{ x: 31, y: 73.3 }, { x: 25.5, y: 61.7 }])],
        note: "3 runs to the sideline, 5 flashes to the middle.",
      },
      {
        offense: [o("O1", 7, 80.4), o("O2", 43, 80.4), o("O3", 12, 55.4), o("O4", 26, 80.4), o("O5", 25.5, 61.7)],
        defense: [d("X1", "O1", { x: 10.5, y: 78.2 }), d("X2", "O1", { x: 32.5, y: 77.7 }), d("X3", "O1", { x: 11, y: 70.6 }), d("X4", "O1", { x: 35, y: 57.2 }), d("X5", "O1", { x: 25, y: 31.3 })],
        ballHolder: "O1",
        lines: [ln("cut", "offense", [{ x: 25, y: 85.6 }, { x: 26, y: 80.4 }]), ln("cut", "defense", [{ x: 17.5, y: 77.7 }, { x: 10.5, y: 78.2 }]), ln("cut", "defense", [{ x: 15, y: 57.2 }, { x: 11, y: 70.6 }]), ln("pass", "offense", [{ x: 25, y: 85.6 }, { x: 7, y: 80.4 }])],
        note: "Inbound to 1; 4 steps in for reversal. Trap comes.",
        ballArrival: [{ x: 25, y: 85.6 }, { x: 7, y: 80.4 }],
      },
      {
        offense: [o("O1", 7, 80.4), o("O2", 43, 80.4), o("O3", 12, 55.4), o("O4", 26, 80.4), o("O5", 25.5, 61.7)],
        defense: [d("X1", "O5", { x: 10.5, y: 78.2 }), d("X2", "O5", { x: 32.5, y: 77.7 }), d("X3", "O5", { x: 11, y: 70.6 }), d("X4", "O5", { x: 35, y: 57.2 }), d("X5", "O5", { x: 25, y: 31.3 })],
        ballHolder: "O5",
        lines: [ln("pass", "offense", [{ x: 7, y: 80.4 }, { x: 25.5, y: 61.7 }])],
        note: "Beat the trap: 1 throws to 5 in the middle, behind the first line.",
        ballArrival: [{ x: 7, y: 80.4 }, { x: 25.5, y: 61.7 }],
      },
      {
        offense: [o("O1", 7, 80.4), o("O2", 42, 46.5), o("O3", 10, 35.7), o("O4", 26, 80.4), o("O5", 25.5, 61.7)],
        defense: [d("X1", "O3", { x: 10.5, y: 78.2 }), d("X2", "O3", { x: 32.5, y: 77.7 }), d("X3", "O3", { x: 11, y: 70.6 }), d("X4", "O3", { x: 35, y: 57.2 }), d("X5", "O3", { x: 25, y: 31.3 })],
        ballHolder: "O3",
        lines: [ln("cut", "offense", [{ x: 12, y: 55.4 }, { x: 10, y: 35.7 }]), ln("cut", "offense", [{ x: 43, y: 80.4 }, { x: 42, y: 46.5 }]), ln("pass", "offense", [{ x: 25.5, y: 61.7 }, { x: 12, y: 55.4 }])],
        note: "5 turns and finds 3 streaking down the sideline.",
        ballArrival: [{ x: 25.5, y: 61.7 }, { x: 10, y: 35.7 }],
      },
    ]
  ),

  play(
    "blob-tango",
    "Tango",
    "blob",
    "Baseline OB",
    "Elevator-doors action out of a split stack: 5 cuts from the free-throw line through 2 and 4 closing together near the block, catching the direct entry in the corner. 1 swings through as the safety, then comes back to the wing for 5's pass and lobs it to 5 cutting to the rim off 2's ball screen and 4's back screen.",
    [
      "2 and 4: hold your spots on either side of the door, then step together the instant 5 clears between you — too early and there's no trap to spring.",
      "5: sell the cut hard through the door — the catch in the corner only works if the door actually closes on your man.",
      "1: you're doing two jobs — clear out first, then come back to the wing ready to catch and immediately read the lob.",
      "1 on the catch: the lob to 5 has to go up the instant he clears 4's back screen — a beat late and the helper's there.",
    ],
    [
      {
        offense: [o("O1", 19.5, 19), o("O5", 19.5, 15), o("O4", 31.5, 11), o("O2", 31.5, 7), o("O3", 33, -1.4)],
        defense: [],
        ballHolder: "O3",
        lines: [],
        note: "1 and 5 stacked at the free-throw line on the weak side, 2 and 4 stacked on the ball-side block, 3 inbounding.",
      },
      {
        offense: [o("O1", 41, 27), o("O2", 26, 9), o("O4", 35, 9), o("O5", 42, 9), o("O3", 33, -1.4)],
        defense: [],
        ballHolder: "O5",
        lines: [
          ln("cut", "offense", [{ x: 19.5, y: 19 }, { x: 41, y: 27 }], 1),
          ln("cut", "offense", [{ x: 31.5, y: 11 }, { x: 35, y: 9 }], 2),
          ln("cut", "offense", [{ x: 31.5, y: 7 }, { x: 26, y: 9 }], 2),
          ln("cut", "offense", [{ x: 19.5, y: 15 }, { x: 30, y: 8 }, { x: 42, y: 9 }], 1),
          ln("pass", "offense", [{ x: 33, y: -1.4 }, { x: 42, y: 9 }]),
        ],
        note: "1 clears out and 5 starts his cut right away; 2 and 4 don't close the door until he's already on his way through — elevator doors. 5 catches the direct entry from 3 in the corner once he clears.",
        ballArrival: [{ x: 33, y: -1.4 }, { x: 42, y: 9 }],
      },
      {
        offense: [o("O1", 40, 17), o("O2", 26, 9), o("O4", 35, 9), o("O5", 42, 9), o("O3", 22, 28)],
        defense: [],
        ballHolder: "O1",
        lines: [
          ln("cut", "offense", [{ x: 41, y: 27 }, { x: 40, y: 17 }]),
          ln("cut", "offense", [{ x: 33, y: -1.4 }, { x: 27, y: 15 }, { x: 22, y: 28 }]),
          ln("pass", "offense", [{ x: 42, y: 9 }, { x: 40, y: 17 }]),
        ],
        note: "3 follows his own pass in and swings up to the top. 1 comes back down to the wing, and 5 swings it to him there.",
        ballArrival: [{ x: 42, y: 9 }, { x: 40, y: 17 }],
      },
      {
        offense: [o("O1", 40, 17), o("O2", 36, 15), o("O4", 36, 8), o("O5", 23, 7), o("O3", 22, 28)],
        defense: [],
        ballHolder: "O5",
        lines: [
          ln("screen", "offense", [{ x: 26, y: 9 }, { x: 36, y: 15 }]),
          ln("screen", "offense", [{ x: 35, y: 9 }, { x: 36, y: 8 }]),
          ln("cut", "offense", [{ x: 42, y: 9 }, { x: 30, y: 8 }, { x: 23, y: 7 }]),
          ln("pass", "offense", [{ x: 40, y: 17 }, { x: 23, y: 7 }]),
        ],
        note: "2 ball-screens for 1 while 4 back-screens for 5 — 1 lobs it over the top to 5 cutting to the rim for the layup.",
        ballArrival: [{ x: 40, y: 17 }, { x: 23, y: 7 }],
      },
    ]
  ),

  play(
    "blob-boom",
    "Boom",
    "blob",
    "Baseline OB",
    "Two stacks up top collapse into a double screen in the middle of the paint: 1 clears out as the decoy, 2 and 4 both converge to screen, and 5 flashes straight down between them for a direct-entry layup.",
    [
      "1: sell the clear-out all the way — the defense needs to believe you're the first option before 2 and 4 even start moving.",
      "2 and 4: meet in the middle of the paint, not just near it — the gap you leave is exactly how wide 5's window is.",
      "5: time the flash to when the screens are actually set — cutting early just runs you into your own teammates.",
      "3 (inbounder): this is a quick-hitter — the pass to 5 has to be ready the instant he clears the screens.",
    ],
    [
      {
        offense: [o("O1", 19, 16), o("O2", 19, 20), o("O4", 31, 16), o("O5", 31, 20), o("O3", 25, -1.4)],
        defense: [],
        ballHolder: "O3",
        lines: [],
        note: "1 and 2 stacked up top on the left (1 in front), 4 and 5 stacked up top on the right (4 in front), 3 inbounding from the middle.",
      },
      {
        offense: [o("O1", 41, 4), o("O2", 28, 11), o("O4", 24, 10), o("O5", 31, 20), o("O3", 25, -1.4)],
        defense: [],
        ballHolder: "O3",
        lines: [
          ln("cut", "offense", [{ x: 19, y: 16 }, { x: 41, y: 4 }]),
          ln("screen", "offense", [{ x: 19, y: 20 }, { x: 28, y: 11 }]),
          ln("screen", "offense", [{ x: 31, y: 16 }, { x: 24, y: 10 }]),
        ],
        note: "1 clears out to the far corner as the decoy. 2 follows his tail partway then peels off, and 4 comes across — both screening in the middle of the paint.",
      },
      {
        offense: [o("O1", 41, 4), o("O2", 28, 11), o("O4", 24, 10), o("O5", 25, 6), o("O3", 25, -1.4)],
        defense: [],
        ballHolder: "O5",
        lines: [
          ln("cut", "offense", [{ x: 31, y: 20 }, { x: 27, y: 10 }, { x: 25, y: 6 }]),
          ln("pass", "offense", [{ x: 25, y: -1.4 }, { x: 25, y: 6 }]),
        ],
        note: "5 flashes straight down between 2 and 4's screens — 3 hits him right at the front of the rim for the layup.",
        ballArrival: [{ x: 25, y: -1.4 }, { x: 25, y: 6 }],
      },
    ]
  ),

  play(
    "blob-slip",
    "Slip",
    "blob",
    "Baseline OB",
    "Mirrors Tango's elevator doors on the other personnel group: 2 cuts through 4 and 5 closing together for the direct entry in the corner. Shoot it there if open — if not, dribble to the wing. 4 and 5 then reset into a tight double screen right where they already are, and 3 curls hard off it back down to the exact corner 2 just cleared out of for the catch-and-shoot three.",
    [
      "4 and 5: same as every elevator door — hold on either side, then close together the instant 2 clears through.",
      "2 on the catch: shot first — only dribble to the wing if the corner look isn't actually there.",
      "3: release the inbound pass, then get moving — you're using 4 and 5's same screen a second time, now as a shooter instead of a passer, right back where the play started.",
      "2: the pass to 3 has to be on time — he's only open for as long as the defense is hung up on the double screen.",
    ],
    [
      {
        offense: [o("O1", 19.5, 19), o("O2", 19.5, 15), o("O4", 31.5, 11), o("O5", 31.5, 7), o("O3", 33, -1.4)],
        defense: [],
        ballHolder: "O3",
        lines: [],
        note: "1 and 2 stacked at the free-throw line on the weak side, 4 and 5 stacked on the ball-side block, 3 inbounding.",
      },
      {
        offense: [o("O1", 41, 27), o("O4", 35, 9), o("O5", 26, 9), o("O2", 42, 9), o("O3", 33, -1.4)],
        defense: [],
        ballHolder: "O2",
        lines: [
          ln("cut", "offense", [{ x: 19.5, y: 19 }, { x: 41, y: 27 }], 1),
          ln("cut", "offense", [{ x: 31.5, y: 11 }, { x: 35, y: 9 }], 2),
          ln("cut", "offense", [{ x: 31.5, y: 7 }, { x: 26, y: 9 }], 2),
          ln("cut", "offense", [{ x: 19.5, y: 15 }, { x: 30, y: 8 }, { x: 42, y: 9 }], 1),
          ln("pass", "offense", [{ x: 33, y: -1.4 }, { x: 42, y: 9 }]),
        ],
        note: "1 clears out and 2 starts his cut right away; 4 and 5 don't close the door until he's already on his way through — elevator doors. 2 catches the direct entry from 3 in the corner once he clears.",
        ballArrival: [{ x: 33, y: -1.4 }, { x: 42, y: 9 }],
      },
      {
        offense: [o("O1", 41, 27), o("O4", 35, 9), o("O5", 26, 9), o("O2", 40, 20), o("O3", 33, -1.4)],
        defense: [],
        ballHolder: "O2",
        lines: [ln("dribble", "offense", [{ x: 42, y: 9 }, { x: 40, y: 20 }])],
        note: "2 reads it — shoot if open right there, else dribble up to the wing.",
      },
      {
        offense: [o("O1", 41, 27), o("O4", 32, 11), o("O5", 29, 9), o("O2", 40, 20), o("O3", 46, 6)],
        defense: [],
        ballHolder: "O3",
        lines: [
          ln("screen", "offense", [{ x: 35, y: 9 }, { x: 32, y: 11 }]),
          ln("screen", "offense", [{ x: 26, y: 9 }, { x: 29, y: 9 }]),
          ln("cut", "offense", [{ x: 33, y: -1.4 }, { x: 31, y: 9 }, { x: 38, y: 8 }, { x: 46, y: 6 }]),
          ln("pass", "offense", [{ x: 40, y: 20 }, { x: 46, y: 6 }]),
        ],
        note: "4 and 5 reset into a tight double screen right where they already are. 3 curls hard off it back down to the same corner 2 cleared out of — 2 swings it to him there for the three.",
        ballArrival: [{ x: 40, y: 20 }, { x: 46, y: 6 }],
      },
    ]
  ),

  play(
    "blob-lift",
    "Lift",
    "blob",
    "Baseline OB",
    "1 and 2 are stacked at the free-throw line away from the ball while 5 and 4 are stacked on the ball-side block. 1 cuts straight through the gap between 4 and 5 first — a decoy, and neither of them moves for it. Then 2 comes down to build a real elevator door with 5 right where he's standing, and 4 runs through it and loops down to the basket for the only pass of the play, straight from the inbounder.",
    [
      "4 and 5: don't move for the first cut — you're just a passing lane for 1, not a door yet. Moving early tips off that something's coming later.",
      "1: sell the cut all the way to the corner even though it's not coming to you — the defense has to actually believe it.",
      "2: come down to build the real door with 5 only once 1 has cleared — too early and you tip off where this is really going.",
      "4: the loop is the whole point — run through 2 and 5's door with purpose, then curl hard back down to the rim.",
      "3: hold it through the entire first action — the only pass of the play is to 4, the instant he clears the door.",
    ],
    [
      {
        offense: [o("O1", 19.5, 15), o("O2", 19.5, 19), o("O5", 31.5, 11), o("O4", 31.5, 7), o("O3", 33, -1.4)],
        defense: [],
        ballHolder: "O3",
        lines: [],
        note: "1 and 2 stacked at the free-throw line on the weak side (1 at the bottom, closer to the door), 5 and 4 stacked on the ball-side block, 3 inbounding.",
      },
      {
        offense: [o("O1", 42, 9), o("O2", 19.5, 19), o("O5", 31.5, 11), o("O4", 31.5, 7), o("O3", 33, -1.4)],
        defense: [],
        ballHolder: "O3",
        lines: [ln("cut", "offense", [{ x: 19.5, y: 15 }, { x: 31.5, y: 9 }, { x: 42, y: 9 }])],
        note: "1 cuts through the gap between 4 and 5 — they don't move at all, it's just a passing lane. He's the decoy; he doesn't get it. 3 just holds the ball.",
      },
      {
        offense: [o("O1", 42, 9), o("O2", 35, 11), o("O5", 31.5, 11), o("O4", 25, 7), o("O3", 33, -1.4)],
        defense: [],
        ballHolder: "O3",
        lines: [
          ln("cut", "offense", [{ x: 19.5, y: 19 }, { x: 35, y: 11 }]),
          ln("cut", "offense", [{ x: 31.5, y: 7 }, { x: 33, y: 11 }, { x: 28, y: 9 }, { x: 25, y: 7 }]),
        ],
        note: "2 comes down to build a door with 5, who never moved. 4 runs through it and loops down to the basket.",
      },
      {
        offense: [o("O1", 42, 9), o("O2", 35, 11), o("O5", 31.5, 11), o("O4", 25, 7), o("O3", 33, -1.4)],
        defense: [],
        ballHolder: "O4",
        lines: [ln("pass", "offense", [{ x: 33, y: -1.4 }, { x: 25, y: 7 }])],
        note: "3 delivers the only pass of the play to 4 for the finish.",
        ballArrival: [{ x: 33, y: -1.4 }, { x: 25, y: 7 }],
      },
    ]
  ),

  play(
    "blob-box",
    "Box BLOB",
    "blob",
    "Baseline OB",
    "Box set under your basket. A cross screen and then a screen-the-screener: two looks at the rim and a safety.",
    [
      "Inbounder slaps the ball to start it.",
      "Read in order: first cutter, second cutter, safety.",
      "Screens must be set — hold until contact.",
      "Safety catch? Reset and get into offense.",
    ],
    [
      {
        offense: [o("O1", 30.5, 19), o("O2", 19.5, 19), o("O3", 33, -1.4), o("O4", 18.5, 8.5), o("O5", 31.5, 8.5)],
        defense: [],
        ballHolder: "O3",
        lines: [],
        note: "Box set under your basket. A cross screen and then a screen-the-screener: two looks at the rim and a safety.",
      },
      {
        offense: [o("O1", 30.5, 19), o("O2", 19.5, 19), o("O3", 33, -1.4), o("O4", 30.5, 4.5), o("O5", 25.5, 8.5)],
        defense: [],
        ballHolder: "O3",
        lines: [ln("screen", "offense", [{ x: 31.5, y: 8.5 }, { x: 25.5, y: 8.5 }]), ln("cut", "offense", [{ x: 18.5, y: 8.5 }, { x: 20.8, y: 9.4 }, { x: 22.9, y: 9.6 }, { x: 25, y: 9.3 }, { x: 26.9, y: 8.3 }, { x: 28.8, y: 6.7 }, { x: 30.5, y: 4.5 }])],
        note: "5 screens across; 4 cuts to the front of the rim.",
      },
      {
        offense: [o("O1", 25, 13.5), o("O2", 19.5, 19), o("O3", 33, -1.4), o("O4", 30.5, 4.5), o("O5", 23, 4.5)],
        defense: [],
        ballHolder: "O3",
        lines: [ln("screen", "offense", [{ x: 30.5, y: 19 }, { x: 25, y: 13.5 }]), ln("cut", "offense", [{ x: 25.5, y: 8.5 }, { x: 24.3, y: 8.7 }, { x: 23.4, y: 8.5 }, { x: 22.9, y: 8 }, { x: 22.6, y: 7.2 }, { x: 22.7, y: 6 }, { x: 23, y: 4.5 }])],
        note: "Screen the screener: 1 screens down for 5, who dives to the rim.",
      },
      {
        offense: [o("O1", 25, 13.5), o("O2", 4, 4.5), o("O3", 33, -1.4), o("O4", 30.5, 4.5), o("O5", 23, 4.5)],
        defense: [],
        ballHolder: "O5",
        lines: [ln("cut", "offense", [{ x: 19.5, y: 19 }, { x: 17, y: 17.5 }, { x: 14.4, y: 15.6 }, { x: 11.9, y: 13.4 }, { x: 9.3, y: 10.8 }, { x: 6.7, y: 7.8 }, { x: 4, y: 4.5 }]), ln("pass", "offense", [{ x: 33, y: -1.4 }, { x: 23, y: 4.5 }])],
        note: "2 pops to the corner as the safety. Read 4, then 5, then 2.",
        ballArrival: [{ x: 33, y: -1.4 }, { x: 23, y: 4.5 }],
      },
    ]
  ),

  play(
    "blob-eagle",
    "Eagle",
    "blob",
    "Baseline OB vs Man",
    "Same box set as Box BLOB, run vs man: 1 and 2 clear out to the wing and the top as safety valves while 5 flashes up into 1's vacated spot. 4 then screens across the lane and 5 loops off it back down to the rim for a direct-entry layup from 3.",
    [
      "5: sell the flash up to 1's spot — your man has to believe you want it right there before you loop off 4's screen.",
      "4: hold the screen until 5 has actually cleared it — a drive-by screen doesn't lose anybody.",
      "3 (inbounder): this has to be a hard, direct pass the instant 5 clears the screen — a beat late and the help defender is there.",
      "1 and 2: once you're at your outlet spot, stay — you're the safety valve if the look at 5 isn't there.",
    ],
    [
      {
        offense: [o("O1", 31.5, 19), o("O2", 19.5, 19), o("O3", 28, -1.4), o("O4", 18.5, 8.5), o("O5", 31.5, 8.5)],
        defense: [d("X1", "O1", { x: 31.5, y: 16 }), d("X2", "O2", { x: 19.5, y: 16 }), d("X3", "O3", { x: 25, y: 6 }), d("X4", "O4", { x: 18.5, y: 11 }), d("X5", "O5", { x: 31.5, y: 11 })],
        ballHolder: "O3",
        lines: [],
        note: "Box set under your basket, same shape as Box BLOB — 1 and 2 at the elbows, 4 and 5 on the blocks, 3 inbounding. This one's run vs man, with each defender tight on his own man.",
      },
      {
        offense: [o("O1", 41, 19), o("O2", 20, 27), o("O3", 28, -1.4), o("O4", 18.5, 8.5), o("O5", 31.5, 16)],
        defense: [d("X1", "O1", { x: 39, y: 17 }), d("X2", "O2", { x: 21, y: 24 }), d("X3", "O3", { x: 25, y: 6 }), d("X4", "O4", { x: 18.5, y: 11 }), d("X5", "O5", { x: 31, y: 14 })],
        ballHolder: "O3",
        lines: [
          ln("cut", "offense", [{ x: 19.5, y: 19 }, { x: 20, y: 27 }]),
          ln("cut", "offense", [{ x: 31.5, y: 19 }, { x: 41, y: 19 }]),
          ln("cut", "offense", [{ x: 31.5, y: 8.5 }, { x: 31.5, y: 16 }]),
        ],
        note: "1 flashes out to the wing and 2 clears to the top as the safety valve, while 5 cuts up into the spot 1 just vacated, calling for the ball.",
      },
      {
        offense: [o("O1", 41, 19), o("O2", 20, 27), o("O3", 28, -1.4), o("O4", 24, 10), o("O5", 22, 7)],
        defense: [d("X1", "O1", { x: 39, y: 17 }), d("X2", "O2", { x: 21, y: 24 }), d("X3", "O3", { x: 24, y: 9 }), d("X4", "O4", { x: 23, y: 12 }), d("X5", "O5", { x: 25, y: 13 })],
        ballHolder: "O3",
        lines: [
          ln("screen", "offense", [{ x: 18.5, y: 8.5 }, { x: 24, y: 10 }]),
          ln("cut", "offense", [{ x: 31.5, y: 16 }, { x: 25, y: 16 }, { x: 22, y: 7 }]),
        ],
        note: "4 screens across the lane for 5, who loops over the top at the free-throw line and cuts down off it to the rim.",
      },
      {
        offense: [o("O1", 41, 19), o("O2", 20, 27), o("O3", 28, -1.4), o("O4", 24, 10), o("O5", 22, 7)],
        defense: [d("X1", "O1", { x: 39, y: 17 }), d("X2", "O2", { x: 21, y: 24 }), d("X3", "O3", { x: 23.5, y: 8.5 }), d("X4", "O4", { x: 23, y: 12 }), d("X5", "O5", { x: 25, y: 13 })],
        ballHolder: "O5",
        lines: [ln("pass", "offense", [{ x: 28, y: -1.4 }, { x: 22, y: 7 }])],
        note: "3 skips the entry pass straight to 5 at the rim for the layup — his own man is still fighting through 4's screen, and the help comes a step too late.",
        ballArrival: [{ x: 28, y: -1.4 }, { x: 22, y: 7 }],
      },
    ]
  ),

  play(
    "blob-tiger",
    "Tiger",
    "blob",
    "Baseline OB vs Man",
    "Same box set as Eagle, usually run first: 1 and 2 clear out the same way, 5 posts up near the elbow for a lob entry, and as that pass goes up, 4 screens down for the inbounder (3), who slips behind the rim for 5's feed and the layup.",
    [
      "5: post up with your hand up right at the catch window — the lob has to arrive as the defense is still sorting out 4's screen.",
      "3 (inbounder): release the lob, then go — the instant it leaves your hand, cut off 4's screen, don't watch the pass.",
      "4: screen down for 3 the moment the lob goes up, not before — too early and his defender just switches onto the lob instead.",
      "5 on the catch: find 3 cutting behind the rim immediately — he's open for exactly as long as his man is stuck on the screen.",
    ],
    [
      {
        offense: [o("O1", 31.5, 19), o("O2", 19.5, 19), o("O3", 28, -1.4), o("O4", 18.5, 8.5), o("O5", 31.5, 8.5)],
        defense: [d("X1", "O1", { x: 31.5, y: 16 }), d("X2", "O2", { x: 19.5, y: 16 }), d("X3", "O3", { x: 25, y: 6 }), d("X4", "O4", { x: 18.5, y: 11 }), d("X5", "O5", { x: 31.5, y: 11 })],
        ballHolder: "O3",
        lines: [],
        note: "Same box set as Eagle, vs man — 1 and 2 at the elbows, 4 and 5 on the blocks, 3 inbounding. Tiger is usually the first call out of this set.",
      },
      {
        offense: [o("O1", 41, 19), o("O2", 20, 27), o("O3", 28, -1.4), o("O4", 18.5, 8.5), o("O5", 29, 13)],
        defense: [d("X1", "O1", { x: 39, y: 17 }), d("X2", "O2", { x: 21, y: 24 }), d("X3", "O3", { x: 25, y: 6 }), d("X4", "O4", { x: 18.5, y: 11 }), d("X5", "O5", { x: 29, y: 10.5 })],
        ballHolder: "O3",
        lines: [
          ln("cut", "offense", [{ x: 19.5, y: 19 }, { x: 20, y: 27 }]),
          ln("cut", "offense", [{ x: 31.5, y: 19 }, { x: 41, y: 19 }]),
          ln("cut", "offense", [{ x: 31.5, y: 8.5 }, { x: 29, y: 13 }]),
        ],
        note: "1 and 2 clear out exactly like Eagle, while 5 posts up on the ball side, about halfway to the elbow.",
      },
      {
        offense: [o("O1", 41, 19), o("O2", 20, 27), o("O3", 28, -1.4), o("O4", 22, 2), o("O5", 29, 13)],
        defense: [d("X1", "O1", { x: 39, y: 17 }), d("X2", "O2", { x: 21, y: 24 }), d("X3", "O3", { x: 24, y: 4 }), d("X4", "O4", { x: 23, y: 5 }), d("X5", "O5", { x: 28, y: 11 })],
        ballHolder: "O5",
        lines: [
          ln("pass", "offense", [{ x: 28, y: -1.4 }, { x: 29, y: 13 }]),
          ln("screen", "offense", [{ x: 18.5, y: 8.5 }, { x: 22, y: 2 }]),
        ],
        note: "3 lobs it up the lane line to 5 posted at the elbow — right as the pass goes up, 4 comes across to screen down for 3.",
        ballArrival: [{ x: 28, y: -1.4 }, { x: 29, y: 13 }],
      },
      {
        offense: [o("O1", 41, 19), o("O2", 20, 27), o("O3", 19, 7), o("O4", 22, 2), o("O5", 29, 13)],
        defense: [d("X1", "O1", { x: 39, y: 17 }), d("X2", "O2", { x: 21, y: 24 }), d("X3", "O3", { x: 22, y: 6 }), d("X4", "O4", { x: 23, y: 5 }), d("X5", "O5", { x: 28, y: 11 })],
        ballHolder: "O5",
        lines: [ln("cut", "offense", [{ x: 28, y: -1.4 }, { x: 23, y: 3 }, { x: 19, y: 7 }])],
        note: "3 curls off 4's screen to the backside of the rim, losing his man in the process.",
      },
      {
        offense: [o("O1", 41, 19), o("O2", 20, 27), o("O3", 19, 7), o("O4", 22, 2), o("O5", 29, 13)],
        defense: [d("X1", "O1", { x: 39, y: 17 }), d("X2", "O2", { x: 21, y: 24 }), d("X3", "O3", { x: 21, y: 6 }), d("X4", "O4", { x: 23, y: 5 }), d("X5", "O5", { x: 28, y: 11 })],
        ballHolder: "O3",
        lines: [ln("pass", "offense", [{ x: 29, y: 13 }, { x: 19, y: 7 }])],
        note: "5 turns and hits 3 cutting behind the goal for the layup — the backside defender is still fighting through 4's screen.",
        ballArrival: [{ x: 29, y: 13 }, { x: 19, y: 7 }],
      },
    ]
  ),

  play(
    "blob-stack",
    "Stack BLOB",
    "blob",
    "Baseline OB vs 2-1-2 Zone",
    "Vs a 2-1-2 zone: 1-4-5-2 stack on the ball-side block, 3 inbounding right in front of it. 1 clears to the corner while 4 screens the zone's middle defender directly, and 5 cuts straight down the lane line for a direct-entry layup, with the middle cleared by 4's screen and 2 retreating up top as the safety valve.",
    [
      "1: clear hard to the corner right away — you're pulling the zone's eyes away from the middle before 4 even sets the screen.",
      "4: screen the zone's middle defender directly, not just the general area — hold it until 5 is completely clear.",
      "5: cut straight down the lane line with purpose — the middle's cleared by 4's screen, so get there before the back-side help can rotate over.",
      "2: get to the outlet quickly and stay there — if the middle look isn't there, 3 needs somewhere safe to reset the ball.",
    ],
    [
      {
        offense: [o("O1", 31.5, 8.5), o("O2", 31.5, 17.5), o("O3", 31.5, -1.4), o("O4", 31.5, 11.5), o("O5", 31.5, 14.5)],
        defense: [d("X1", "O2", { x: 17, y: 20 }), d("X2", "O1", { x: 33, y: 20 }), d("X3", "O4", { x: 18, y: 8 }), d("X4", "O1", { x: 32, y: 10 }), d("X5", "O5", { x: 25, y: 14 })],
        ballHolder: "O3",
        lines: [],
        note: "BLOB vs a 2-1-2 zone: 1-4-5-2 stacked on the ball-side block (1 closest to the rim, 2 at the top), 3 inbounding right in front of the stack. 5 is the zone's middle defender, 4 the ball-side post, 3 the weak-side post.",
      },
      {
        offense: [o("O1", 46, 4), o("O2", 34, 26), o("O3", 31.5, -1.4), o("O4", 25, 13), o("O5", 31.5, 14.5)],
        defense: [d("X1", "O2", { x: 18, y: 20 }), d("X2", "O1", { x: 40, y: 8 }), d("X3", "O4", { x: 19, y: 9 }), d("X4", "O1", { x: 29, y: 11 }), d("X5", "O5", { x: 23.5, y: 14.5 })],
        ballHolder: "O3",
        lines: [
          ln("cut", "offense", [{ x: 31.5, y: 8.5 }, { x: 46, y: 4 }]),
          ln("screen", "offense", [{ x: 31.5, y: 11.5 }, { x: 25, y: 13 }]),
          ln("cut", "offense", [{ x: 31.5, y: 17.5 }, { x: 34, y: 26 }]),
        ],
        note: "1 cuts hard to the ball-side corner. At the same time, 4 slides down and screens the zone's middle defender directly, and 2 retreats up top as the safety valve.",
      },
      {
        offense: [o("O1", 46, 4), o("O2", 34, 26), o("O3", 31.5, -1.4), o("O4", 25, 13), o("O5", 31.5, 6.5)],
        defense: [d("X1", "O2", { x: 18, y: 20 }), d("X2", "O1", { x: 40, y: 8 }), d("X3", "O4", { x: 19, y: 9 }), d("X4", "O1", { x: 29, y: 9 }), d("X5", "O5", { x: 23.5, y: 14.5 })],
        ballHolder: "O3",
        lines: [ln("cut", "offense", [{ x: 31.5, y: 14.5 }, { x: 31.5, y: 6.5 }])],
        note: "5 cuts straight down the lane line to the front of the rim — the middle's clear, 4's screen is still holding the zone's middle defender.",
      },
      {
        offense: [o("O1", 46, 4), o("O2", 34, 26), o("O3", 31.5, -1.4), o("O4", 25, 13), o("O5", 31.5, 6.5)],
        defense: [d("X1", "O2", { x: 18, y: 20 }), d("X2", "O1", { x: 40, y: 8 }), d("X3", "O4", { x: 19, y: 9 }), d("X4", "O1", { x: 29, y: 7 }), d("X5", "O5", { x: 23.5, y: 14.5 })],
        ballHolder: "O5",
        lines: [ln("pass", "offense", [{ x: 31.5, y: -1.4 }, { x: 31.5, y: 6.5 }])],
        note: "3 fires it straight up the lane line to 5 at the rim for the layup — the zone's middle defender is still hung up on 4's screen, and the back-side help rotates a step too late.",
        ballArrival: [{ x: 31.5, y: -1.4 }, { x: 31.5, y: 6.5 }],
      },
    ]
  ),

  play(
    "blob-zone",
    "Seal BLOB vs Zone",
    "blob",
    "Baseline OB vs Zone",
    "Against a 2-3 under your basket: a corner shooter pulls the zone wide and the post seals the middle.",
    [
      "Seal low with your back to the middle defender.",
      "The diver times his cut on the slap.",
      "No look? Inbound to 1 at the top and run zone offense.",
    ],
    [
      {
        offense: [o("O1", 25, 32), o("O2", 38, -1.4), o("O3", 47, 4), o("O4", 25, 19), o("O5", 31.5, 8)],
        defense: [d("X1", "O2", { x: 19.5, y: 22.5 }), d("X2", "O2", { x: 30.5, y: 22.5 }), d("X3", "O2", { x: 12, y: 9.5 }), d("X4", "O2", { x: 38, y: 9.5 }), d("X5", "O2", { x: 25, y: 7 })],
        ballHolder: "O2",
        lines: [],
        note: "Against a 2-3 under your basket: a corner shooter pulls the zone wide and the post seals the middle.",
      },
      {
        offense: [o("O1", 25, 32), o("O2", 38, -1.4), o("O3", 47, 4), o("O4", 25, 19), o("O5", 29, 7.5)],
        defense: [d("X1", "O2", { x: 19.5, y: 22.5 }), d("X2", "O2", { x: 30.5, y: 22.5 }), d("X3", "O2", { x: 12, y: 9.5 }), d("X4", "O2", { x: 43, y: 6.5 }), d("X5", "O2", { x: 25, y: 7 })],
        ballHolder: "O2",
        lines: [ln("cut", "defense", [{ x: 38, y: 9.5 }, { x: 43, y: 6.5 }]), ln("screen", "offense", [{ x: 31.5, y: 8 }, { x: 29, y: 7.5 }])],
        note: "3 in the corner pulls x4 out. 5 seals x5 from the ball-side block.",
      },
      {
        offense: [o("O1", 25, 32), o("O2", 38, -1.4), o("O3", 47, 4), o("O4", 27.5, 4), o("O5", 29, 7.5)],
        defense: [d("X1", "O4", { x: 19.5, y: 22.5 }), d("X2", "O4", { x: 30.5, y: 22.5 }), d("X3", "O4", { x: 12, y: 9.5 }), d("X4", "O4", { x: 43, y: 6.5 }), d("X5", "O4", { x: 25, y: 7 })],
        ballHolder: "O4",
        lines: [ln("cut", "offense", [{ x: 25, y: 19 }, { x: 27.5, y: 4 }]), ln("pass", "offense", [{ x: 38, y: -1.4 }, { x: 25, y: 19 }])],
        note: "4 dives from the free-throw line into the open spot.",
        ballArrival: [{ x: 38, y: -1.4 }, { x: 27.5, y: 4 }],
      },
    ]
  ),

  play(
    "blob-22",
    "22",
    "blob",
    "Baseline OB vs 2-1-2 Zone",
    "1 and 2 split to the corners together to pull the zone's baseline wide, then 5 screens the zone's lone middle defender so 4 can curl over it into the gap right at the rim for the catch and score.",
    [
      "1 and 2: split hard and at the same time — a slow split lets the zone's baseline stay home instead of widening out to the corners.",
      "5: screen the middle defender, not air — hold it long enough for 4 to actually clear it before releasing.",
      "4: read the screen, then get flat to the rim. You want to catch it right at the front of the goal, not drifting out toward the block.",
      "3 (inbounder): this is a quick-hitter — the catch at the rim needs to beat the zone's back line rotating over from the corner.",
    ],
    [
      {
        offense: [o("O1", 25, 16), o("O2", 25, 22), o("O3", 34, -1.4), o("O4", 18.5, 8.5), o("O5", 31.5, 8.5)],
        defense: [d("X1", "O1", { x: 17, y: 20 }), d("X2", "O2", { x: 33, y: 20 }), d("X3", "O1", { x: 16, y: 6.5 }), d("X4", "O1", { x: 34, y: 6.5 }), d("X5", "O1", { x: 25, y: 13 })],
        ballHolder: "O3",
        lines: [],
        note: "BLOB vs a 2-1-2 zone: 1 and 2 stacked on the lane line, splitting the free-throw line. 4 on the opposite block, 5 on the ball-side block, 3 inbounding. 5 is the zone's middle defender, 4 the ball-side post, 3 the weak-side post.",
      },
      {
        offense: [o("O1", 46, 4), o("O2", 4, 4), o("O3", 34, -1.4), o("O4", 18.5, 8.5), o("O5", 31.5, 8.5)],
        defense: [d("X1", "O1", { x: 19, y: 18 }), d("X2", "O2", { x: 31, y: 18 }), d("X3", "O1", { x: 10, y: 6 }), d("X4", "O1", { x: 38, y: 6 }), d("X5", "O1", { x: 21, y: 11 })],
        ballHolder: "O3",
        lines: [ln("cut", "offense", [{ x: 25, y: 16 }, { x: 46, y: 4 }]), ln("cut", "offense", [{ x: 25, y: 22 }, { x: 4, y: 4 }])],
        note: "1 and 2 split to the corners at the same time, pulling the zone's baseline defenders wide and clearing the middle.",
      },
      {
        offense: [o("O1", 46, 4), o("O2", 4, 4), o("O3", 34, -1.4), o("O4", 28, 7), o("O5", 23.5, 12)],
        defense: [d("X1", "O1", { x: 19, y: 18 }), d("X2", "O2", { x: 31, y: 18 }), d("X3", "O1", { x: 11, y: 6 }), d("X4", "O1", { x: 34, y: 7 }), d("X5", "O1", { x: 22, y: 13 })],
        ballHolder: "O3",
        lines: [
          ln("screen", "offense", [{ x: 31.5, y: 8.5 }, { x: 23.5, y: 12 }]),
          ln("cut", "offense", [{ x: 18.5, y: 8.5 }, { x: 24, y: 14.5 }, { x: 28, y: 7 }]),
        ],
        note: "5 slides over and screens the zone's middle defender directly. 4 comes over the top of it to the ball side, right between the block and the rim.",
      },
      {
        offense: [o("O1", 46, 4), o("O2", 4, 4), o("O3", 34, -1.4), o("O4", 28, 7), o("O5", 23.5, 12)],
        defense: [d("X1", "O1", { x: 19, y: 18 }), d("X2", "O2", { x: 31, y: 18 }), d("X3", "O1", { x: 11, y: 6 }), d("X4", "O1", { x: 31, y: 7 }), d("X5", "O1", { x: 22, y: 13 })],
        ballHolder: "O4",
        lines: [ln("pass", "offense", [{ x: 34, y: -1.4 }, { x: 28, y: 7 }])],
        note: "3 fires it in to 4 for the score — the zone's middle defender is still hung up on the screen, and the back line rotates a step too late.",
        ballArrival: [{ x: 34, y: -1.4 }, { x: 28, y: 7 }],
      },
    ]
  ),

  play(
    "blob-22-counter",
    "22 Counter",
    "blob",
    "Baseline OB vs 2-1-2 Zone",
    "Same 22 look and the same first read (1 to the corner, 5 screening the middle), but 4 doesn't curl to the rim — he clears all the way out to the slot above the arc, with 2 faking the opposite corner before mirroring him on the other side. The ball goes through 1 instead of straight to 4, then 1 screens away for the inbounder before running the baseline himself — three catch-and-shoot threes and a sealed post, all live off one entry.",
    [
      "4: sell the cut across the lane like the rim is the target — the defense has seen 22 rolling to the block, and the slot pop only works if they bite on that first.",
      "2: the fake toward the corner needs to look real — a half-hearted one lets the defense sit on the mirror spot before you get there.",
      "1: after the pass to 4, get into the screen for 3 right away — he's standing on the sideline with nowhere to go until you free him.",
      "4 on the catch: 3 for the three, then 5 sealed inside, then swing it to 2 — 1 is trailing the baseline the whole way and is the last read, spotting up in the far corner.",
    ],
    [
      {
        offense: [o("O1", 25, 16), o("O2", 25, 22), o("O3", 34, -1.4), o("O4", 18.5, 8.5), o("O5", 31.5, 8.5)],
        defense: [d("X1", "O1", { x: 17, y: 20 }), d("X2", "O2", { x: 33, y: 20 }), d("X3", "O1", { x: 16, y: 6.5 }), d("X4", "O1", { x: 34, y: 6.5 }), d("X5", "O1", { x: 20, y: 13 })],
        ballHolder: "O3",
        lines: [],
        note: "BLOB vs a 2-1-2 zone — the same 22 look: 1 and 2 stacked on the lane line, 4 on the opposite block, 5 on the ball-side block, 3 inbounding. 5 is the zone's middle defender, 4 the ball-side post, 3 the weak-side post.",
      },
      {
        offense: [o("O1", 46, 4), o("O2", 16, 24), o("O3", 34, -1.4), o("O4", 34, 24), o("O5", 22.5, 13)],
        defense: [d("X1", "O1", { x: 18, y: 22 }), d("X2", "O2", { x: 32, y: 22 }), d("X3", "O1", { x: 18, y: 8 }), d("X4", "O1", { x: 40, y: 6 }), d("X5", "O1", { x: 21, y: 13 })],
        ballHolder: "O3",
        lines: [
          ln("cut", "offense", [{ x: 25, y: 16 }, { x: 46, y: 4 }]),
          ln("screen", "offense", [{ x: 31.5, y: 8.5 }, { x: 22.5, y: 13 }]),
          ln("cut", "offense", [{ x: 18.5, y: 8.5 }, { x: 23, y: 15 }, { x: 34, y: 24 }]),
          ln("cut", "offense", [{ x: 25, y: 22 }, { x: 10, y: 10 }, { x: 16, y: 24 }]),
        ],
        note: "1 cuts to the corner and 5 slides over to screen the zone's middle defender directly — same as 22. 4 curls right over that same screen, then keeps going past the arc to the slot, in line with 3, while 2 fakes toward the opposite corner and mirrors him on the other side.",
      },
      {
        offense: [o("O1", 46, 4), o("O2", 16, 24), o("O3", 34, -1.4), o("O4", 34, 24), o("O5", 22.5, 13)],
        defense: [d("X1", "O1", { x: 18, y: 22 }), d("X2", "O2", { x: 32, y: 22 }), d("X3", "O1", { x: 18, y: 8 }), d("X4", "O1", { x: 43, y: 5 }), d("X5", "O1", { x: 21, y: 13 })],
        ballHolder: "O1",
        lines: [ln("pass", "offense", [{ x: 34, y: -1.4 }, { x: 46, y: 4 }])],
        note: "3 inbounds it to 1 in the corner.",
        ballArrival: [{ x: 34, y: -1.4 }, { x: 46, y: 4 }],
      },
      {
        offense: [o("O1", 46, 4), o("O2", 16, 24), o("O3", 34, -1.4), o("O4", 34, 24), o("O5", 22.5, 13)],
        defense: [d("X1", "O1", { x: 18, y: 22 }), d("X2", "O2", { x: 32, y: 22 }), d("X3", "O1", { x: 18, y: 8 }), d("X4", "O1", { x: 38, y: 7 }), d("X5", "O1", { x: 18, y: 13 })],
        ballHolder: "O4",
        lines: [ln("pass", "offense", [{ x: 46, y: 4 }, { x: 34, y: 24 }])],
        note: "1 reverses it to 4 in the slot.",
        ballArrival: [{ x: 46, y: 4 }, { x: 34, y: 24 }],
      },
      {
        offense: [o("O1", 37.5, 5), o("O2", 16, 24), o("O3", 46, 4), o("O4", 34, 24), o("O5", 23, 8)],
        defense: [d("X1", "O1", { x: 18, y: 22 }), d("X2", "O2", { x: 32, y: 22 }), d("X3", "O1", { x: 16, y: 10 }), d("X4", "O1", { x: 36, y: 6 }), d("X5", "O1", { x: 18, y: 9 })],
        ballHolder: "O4",
        lines: [
          ln("screen", "offense", [{ x: 46, y: 4 }, { x: 37.5, y: 5 }]),
          ln("cut", "offense", [{ x: 34, y: -1.4 }, { x: 46, y: 4 }]),
          ln("cut", "offense", [{ x: 22.5, y: 13 }, { x: 23, y: 8 }]),
        ],
        note: "1 down screens the ball-side post defender directly, and 3 cuts in off the baseline to fill the corner 1 just left. 5 seals inside at the same time.",
      },
      {
        offense: [o("O1", 37.5, 5), o("O2", 16, 24), o("O3", 46, 4), o("O4", 34, 24), o("O5", 23, 8)],
        defense: [d("X1", "O1", { x: 18, y: 22 }), d("X2", "O2", { x: 32, y: 22 }), d("X3", "O1", { x: 16, y: 10 }), d("X4", "O1", { x: 38, y: 5 }), d("X5", "O1", { x: 18, y: 9 })],
        ballHolder: "O3",
        lines: [ln("pass", "offense", [{ x: 34, y: 24 }, { x: 46, y: 4 }])],
        note: "4 reads it — 3's open in the corner for the three, still a step ahead of the post defender, who got hung up on 1's screen. (5 sealed inside, then 2, then 1 trailing the baseline to the far corner, are the reads behind it.)",
        ballArrival: [{ x: 34, y: 24 }, { x: 46, y: 4 }],
      },
    ]
  ),

  play(
    "blob-22-high",
    "22 High",
    "blob",
    "Baseline OB vs 2-1-2 Zone",
    "Same 22 shape with 1 and 5 swapped — 1 flashes to the ball-side corner as 4 settles a step lower to pin the weak-side post, then 2 dives straight down the lane to drag the zone's middle defender all the way to the rim, opening the paint for 5 to slide into for the lob.",
    [
      "1: flash hard and direct to the ball-side corner — the quicker you clear, the sooner 4 can settle underneath and the defense has less time to adjust.",
      "4: just a step lower is enough — you're not clearing out, you're pinning the weak-side post defender off the middle.",
      "2: drive it all the way to the rim — the whole point is dragging the zone's middle defender down and out of the paint with you.",
      "3 (inbounder): this is a lob — give it enough air to clear the lane and land right in 5's hands as he slides down into the middle of the paint.",
    ],
    [
      {
        offense: [o("O1", 31.5, 8.5), o("O2", 25, 14.5), o("O3", 34, -1.4), o("O4", 18.5, 8.5), o("O5", 25, 17.5)],
        defense: [d("X1", "O2", { x: 17, y: 20 }), d("X2", "O1", { x: 33, y: 20 }), d("X3", "O4", { x: 16, y: 6.5 }), d("X4", "O1", { x: 34, y: 6.5 }), d("X5", "O5", { x: 22, y: 12 })],
        ballHolder: "O3",
        lines: [],
        note: "BLOB vs a 2-1-2 zone — the same 22 shape, but 1 and 5 start swapped: 1 on the ball-side block, 2 and 5 stacked closely right at the free-throw line with 5 on top. 4 on the opposite block, 3 inbounding. 5 is the zone's middle defender, 4 the ball-side post, 3 the weak-side post.",
      },
      {
        offense: [o("O1", 46, 4), o("O2", 25, 14.5), o("O3", 34, -1.4), o("O4", 18, 6.5), o("O5", 25, 17.5)],
        defense: [d("X1", "O2", { x: 17, y: 20 }), d("X2", "O1", { x: 33, y: 20 }), d("X3", "O4", { x: 17, y: 6 }), d("X4", "O1", { x: 37, y: 6 }), d("X5", "O5", { x: 22, y: 12 })],
        ballHolder: "O3",
        lines: [
          ln("cut", "offense", [{ x: 31.5, y: 8.5 }, { x: 46, y: 4 }]),
          ln("cut", "offense", [{ x: 18.5, y: 8.5 }, { x: 18, y: 6.5 }]),
        ],
        note: "1 flashes directly to the ball-side corner. At the same time, 4 settles a step lower to occupy the weak-side post defender, pinning him off the middle and keeping the paint clear for what's coming.",
      },
      {
        offense: [o("O1", 46, 4), o("O2", 25, 7), o("O3", 34, -1.4), o("O4", 18, 6.5), o("O5", 28, 11)],
        defense: [d("X1", "O2", { x: 19, y: 15 }), d("X2", "O1", { x: 28, y: 16 }), d("X3", "O4", { x: 17, y: 6 }), d("X4", "O1", { x: 32, y: 8 }), d("X5", "O5", { x: 23, y: 7 })],
        ballHolder: "O3",
        lines: [
          ln("cut", "offense", [{ x: 25, y: 14.5 }, { x: 25, y: 7 }]),
          ln("cut", "offense", [{ x: 25, y: 17.5 }, { x: 26, y: 14 }, { x: 28, y: 11 }]),
        ],
        note: "2 dives straight down the lane, pushing the zone's middle defender all the way down to rim level. 5 slides down behind him into the gap that opens in the middle of the paint, a little toward the ball side.",
        arrivals: { X5: [{ x: 22, y: 12 }, { x: 23, y: 7 }] },
      },
      {
        offense: [o("O1", 46, 4), o("O2", 25, 7), o("O3", 34, -1.4), o("O4", 18, 6.5), o("O5", 28, 11)],
        defense: [d("X1", "O2", { x: 19, y: 15 }), d("X2", "O1", { x: 28, y: 16 }), d("X3", "O4", { x: 17, y: 6 }), d("X4", "O1", { x: 29, y: 10 }), d("X5", "O5", { x: 23, y: 7 })],
        ballHolder: "O5",
        lines: [ln("pass", "offense", [{ x: 34, y: -1.4 }, { x: 28, y: 11 }])],
        note: "3 lobs it over the top to 5 in the middle of the paint for the score — the zone's middle defender got dragged all the way down to the rim by 2's dive, and the backside help rotates a step too late.",
        ballArrival: [{ x: 34, y: -1.4 }, { x: 28, y: 11 }],
      },
    ]
  ),

  play(
    "slob-box",
    "Box SLOB",
    "slob",
    "Sideline OB",
    "Box set off the sideline. Back screen for a cutter at the rim, then screen the screener for a catch at the top.",
    [
      "Safety first — make sure the ball gets in.",
      "Inbounder: count your 5 seconds out loud.",
      "Catch at the top? Swing it and run offense.",
    ],
    [
      {
        offense: [o("O1", 30.5, 19), o("O2", 51.5, 26), o("O3", 19.5, 19), o("O4", 18.5, 8.5), o("O5", 31.5, 8.5)],
        defense: [],
        ballHolder: "O2",
        lines: [],
        note: "Box set off the sideline. Back screen for a cutter at the rim, then screen the screener for a catch at the top.",
      },
      {
        offense: [o("O1", 43, 36), o("O2", 51.5, 26), o("O3", 19.5, 19), o("O4", 18.5, 8.5), o("O5", 31.5, 8.5)],
        defense: [],
        ballHolder: "O2",
        lines: [ln("cut", "offense", [{ x: 30.5, y: 19 }, { x: 43, y: 36 }])],
        note: "1 sprints back toward the ball as the safety.",
      },
      {
        offense: [o("O1", 43, 36), o("O2", 51.5, 26), o("O3", 27.5, 5), o("O4", 18.5, 8.5), o("O5", 22, 17)],
        defense: [],
        ballHolder: "O2",
        lines: [ln("screen", "offense", [{ x: 31.5, y: 8.5 }, { x: 22, y: 17 }]), ln("cut", "offense", [{ x: 19.5, y: 19 }, { x: 21.7, y: 17.5 }, { x: 23.5, y: 15.7 }, { x: 25, y: 13.5 }, { x: 26.2, y: 11 }, { x: 27, y: 8.2 }, { x: 27.5, y: 5 }])],
        note: "5 back screens for 3, who cuts to the rim.",
      },
      {
        offense: [o("O1", 43, 36), o("O2", 51.5, 26), o("O3", 27.5, 5), o("O4", 21.5, 20.5), o("O5", 25, 32)],
        defense: [],
        ballHolder: "O2",
        lines: [ln("screen", "offense", [{ x: 18.5, y: 8.5 }, { x: 21.5, y: 20.5 }]), ln("cut", "offense", [{ x: 22, y: 17 }, { x: 25, y: 32 }])],
        note: "4 screens for 5 (screen the screener); 5 pops to the top.",
      },
      {
        offense: [o("O1", 43, 36), o("O2", 51.5, 26), o("O3", 27.5, 5), o("O4", 21.5, 20.5), o("O5", 25, 32)],
        defense: [],
        ballHolder: "O5",
        lines: [ln("pass", "offense", [{ x: 51.5, y: 26 }, { x: 25, y: 32 }])],
        note: "Read: 3 at the rim, 5 at the top, 1 as the safety.",
        ballArrival: [{ x: 51.5, y: 26 }, { x: 25, y: 32 }],
      },
    ]
  ),

  play(
    "slob-line",
    "Line SLOB",
    "slob",
    "Sideline OB (backcourt pressure)",
    "Get it in safely near half court. A line breaks in four directions so the inbounder always has a target.",
    [
      "Use it when you just need to inbound cleanly.",
      "Deep cutter keeps the defense honest.",
      "No one open by four? Throw it high and deep to 2.",
    ],
    [
      {
        offense: [o("O1", 42, 44), o("O2", 42, 38), o("O3", 51.5, 42), o("O4", 42, 32), o("O5", 42, 26)],
        defense: [],
        ballHolder: "O3",
        lines: [],
        note: "Get it in safely near half court. A line breaks in four directions so the inbounder always has a target.",
      },
      {
        offense: [o("O1", 47.5, 44.5), o("O2", 25.5, 6.5), o("O3", 51.5, 42), o("O4", 47, 4.5), o("O5", 25, 32)],
        defense: [],
        ballHolder: "O3",
        lines: [ln("cut", "offense", [{ x: 42, y: 44 }, { x: 47.5, y: 44.5 }]), ln("cut", "offense", [{ x: 42, y: 38 }, { x: 39, y: 32.1 }, { x: 36.2, y: 26.5 }, { x: 33.4, y: 21.1 }, { x: 30.7, y: 16 }, { x: 28, y: 11.1 }, { x: 25.5, y: 6.5 }]), ln("cut", "offense", [{ x: 42, y: 32 }, { x: 47, y: 4.5 }]), ln("cut", "offense", [{ x: 42, y: 26 }, { x: 25, y: 32 }])],
        note: "The line breaks: 1 comes back to the ball, 2 goes deep to the rim, 4 to the corner, 5 to the top.",
      },
      {
        offense: [o("O1", 47.5, 44.5), o("O2", 25.5, 6.5), o("O3", 51.5, 42), o("O4", 47, 4.5), o("O5", 25, 32)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("pass", "offense", [{ x: 51.5, y: 42 }, { x: 47.5, y: 44.5 }])],
        note: "Take what is open. Here: the safe pass to 1.",
        ballArrival: [{ x: 51.5, y: 42 }, { x: 47.5, y: 44.5 }],
      },
    ]
  ),

  play(
    "home-run",
    "Home Run",
    "late",
    "Full court, under 5 sec",
    "Full length of the floor with seconds left. Long outlet to mid-court, then a quick pass ahead.",
    [
      "Inbounder: strongest arm, can run the baseline after a made basket.",
      "5 catches high with two hands.",
      "If 5 is denied, 1 is the short outlet.",
    ],
    [
      {
        offense: [o("O1", 25, 73.3), o("O2", 15, 62.6), o("O3", 35, 62.6), o("O4", 25, 85.6), o("O5", 25, 48.3)],
        defense: [],
        ballHolder: "O4",
        lines: [],
        note: "Full length of the floor with seconds left. Long outlet to mid-court, then a quick pass ahead.",
      },
      {
        offense: [o("O1", 33, 80.4), o("O2", 9, 15.2), o("O3", 41, 23.2), o("O4", 25, 85.6), o("O5", 25, 42)],
        defense: [],
        ballHolder: "O4",
        lines: [ln("cut", "offense", [{ x: 15, y: 62.6 }, { x: 9, y: 15.2 }]), ln("cut", "offense", [{ x: 35, y: 62.6 }, { x: 41, y: 23.2 }]), ln("cut", "offense", [{ x: 25, y: 48.3 }, { x: 25, y: 42 }]), ln("cut", "offense", [{ x: 25, y: 73.3 }, { x: 33, y: 80.4 }])],
        note: "2 and 3 sprint long, 5 flashes back to half court, 1 comes to the ball.",
      },
      {
        offense: [o("O1", 33, 80.4), o("O2", 9, 15.2), o("O3", 41, 23.2), o("O4", 25, 85.6), o("O5", 25, 42)],
        defense: [],
        ballHolder: "O5",
        lines: [ln("pass", "offense", [{ x: 25, y: 85.6 }, { x: 25, y: 42 }])],
        note: "4 throws the long pass to 5 at mid-court.",
        ballArrival: [{ x: 25, y: 85.6 }, { x: 25, y: 42 }],
      },
      {
        offense: [o("O1", 33, 80.4), o("O2", 9, 15.2), o("O3", 41, 23.2), o("O4", 25, 85.6), o("O5", 25, 42)],
        defense: [],
        ballHolder: "O2",
        lines: [ln("pass", "offense", [{ x: 25, y: 42 }, { x: 9, y: 15.2 }])],
        note: "5 catches and throws ahead to 2 for the lay-up.",
        ballArrival: [{ x: 25, y: 42 }, { x: 9, y: 15.2 }],
      },
    ]
  ),

  play(
    "hammer",
    "Hammer (Need a 3)",
    "late",
    "Half court, need 3",
    "Drive baseline, then a flare screen frees the weak-side corner shooter. The baseline-to-wing skip is hard to guard.",
    [
      "Driver must get deep — make the weak side help.",
      "3: wait for the screen, then fade.",
      "Feet behind the line — check before the shot.",
    ],
    [
      {
        offense: [o("O1", 33, 32), o("O2", 47, 3.5), o("O3", 3, 3.5), o("O4", 18.5, 8.5), o("O5", 30.5, 19)],
        defense: [],
        ballHolder: "O1",
        lines: [],
        note: "Drive baseline, then a flare screen frees the weak-side corner shooter. The baseline-to-wing skip is hard to guard.",
      },
      {
        offense: [o("O1", 42.5, 11), o("O2", 47, 3.5), o("O3", 3, 3.5), o("O4", 18.5, 8.5), o("O5", 35, 29)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("screen", "offense", [{ x: 30.5, y: 19 }, { x: 35, y: 29 }]), ln("dribble", "offense", [{ x: 33, y: 32 }, { x: 35.9, y: 29.3 }, { x: 38.3, y: 26.3 }, { x: 40.1, y: 23 }, { x: 41.4, y: 19.3 }, { x: 42.2, y: 15.3 }, { x: 42.5, y: 11 }])],
        note: "5 ball screens; 1 drives hard right toward the baseline.",
      },
      {
        offense: [o("O1", 42.5, 11), o("O2", 47, 3.5), o("O3", 4.5, 18.5), o("O4", 8.5, 8), o("O5", 35, 29)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("screen", "offense", [{ x: 18.5, y: 8.5 }, { x: 8.5, y: 8 }]), ln("cut", "offense", [{ x: 3, y: 3.5 }, { x: 4.5, y: 18.5 }])],
        note: "Hammer: 4 sets a flare screen on 3’s defender. 3 fades to the left wing.",
      },
      {
        offense: [o("O1", 42.5, 11), o("O2", 47, 3.5), o("O3", 4.5, 18.5), o("O4", 8.5, 8), o("O5", 35, 29)],
        defense: [],
        ballHolder: "O3",
        lines: [ln("pass", "offense", [{ x: 42.5, y: 11 }, { x: 4.5, y: 18.5 }])],
        note: "1 throws the skip pass to 3 for the three.",
        ballArrival: [{ x: 42.5, y: 11 }, { x: 4.5, y: 18.5 }],
      },
    ]
  ),

  play(
    "four-corners",
    "Four Corners",
    "late",
    "Protect a lead",
    "Spread the floor and make them foul. Four players in the corners of the half court, your best ball handler in the middle.",
    [
      "Only lay-ups. No quick shots.",
      "Make your free throws — get the ball to your best shooters.",
      "Meet passes; never catch standing still.",
    ],
    [
      {
        offense: [o("O1", 25, 26), o("O2", 4.5, 42), o("O3", 45.5, 42), o("O4", 4.5, 4.5), o("O5", 45.5, 4.5)],
        defense: [],
        ballHolder: "O1",
        lines: [],
        note: "Spread the floor and make them foul. Four players in the corners of the half court, your best ball handler in the middle.",
      },
      {
        offense: [o("O1", 25, 26), o("O2", 4.5, 42), o("O3", 45.5, 42), o("O4", 4.5, 4.5), o("O5", 45.5, 4.5)],
        defense: [],
        ballHolder: "O1",
        lines: [],
        note: "Spread to the corners. 1 handles in the middle.",
      },
      {
        offense: [o("O1", 29, 24), o("O2", 4.5, 42), o("O3", 45.5, 42), o("O4", 4.5, 4.5), o("O5", 45.5, 4.5)],
        defense: [],
        ballHolder: "O5",
        lines: [ln("dribble", "offense", [{ x: 25, y: 26 }, { x: 29, y: 24 }]), ln("pass", "offense", [{ x: 25, y: 26 }, { x: 45.5, y: 4.5 }])],
        note: "Two defenders jump 1 — he hits the open corner (5).",
        ballArrival: [{ x: 25, y: 26 }, { x: 45.5, y: 4.5 }],
      },
      {
        offense: [o("O1", 26, 7), o("O2", 4.5, 42), o("O3", 45.5, 42), o("O4", 4.5, 4.5), o("O5", 45.5, 4.5)],
        defense: [],
        ballHolder: "O5",
        lines: [ln("cut", "offense", [{ x: 29, y: 24 }, { x: 26, y: 7 }])],
        note: "1 cuts to the rim; 5 hits him or brings it back out.",
      },
    ]
  ),

  play(
    "run-jump",
    "Run & Jump Press",
    "defense",
    "Full court man",
    "Lightning base press. Man-to-man full court, turn the dribbler, and the closest level defender jumps him from the side.",
    [
      "Soft deny inbound to the corner below the FT line.",
      "Inbounder’s defender: free safety on the inbound side until the catch, then full man.",
      "Cut off the dribbler; closest level defender jumps from the side.",
      "Never trap down.",
      "Off the ball: level with or in front of the ball. Pinch if the dribbler goes middle.",
      "Dead ball: on-ball defender runs to the most dangerous open man.",
      "Ball side: loose deny. Help side: split the court.",
    ],
    [
      {
        offense: [o("O1", 18, 76.4), o("O2", 38, 70.6), o("O3", 12, 54.5), o("O4", 25, 85.6), o("O5", 33, 50)],
        defense: [d("X4", "O4", { x: 22.5, y: 81.8 }), d("X1", "O4", { x: 17.5, y: 78.6 }), d("X2", "O4", { x: 36.5, y: 71.5 }), d("X3", "O4", { x: 13.5, y: 56.3 }), d("X5", "O4", { x: 31.5, y: 51.8 })],
        ballHolder: "O4",
        lines: [],
        note: "Lightning base press. Man-to-man full court, turn the dribbler, and the closest level defender jumps him from the side.",
      },
      {
        offense: [o("O1", 18, 76.4), o("O2", 38, 70.6), o("O3", 12, 54.5), o("O4", 25, 85.6), o("O5", 33, 50)],
        defense: [d("X4", "O4", { x: 20.5, y: 80 }), d("X1", "O4", { x: 17.5, y: 78.6 }), d("X2", "O4", { x: 36.5, y: 71.5 }), d("X3", "O4", { x: 13.5, y: 56.3 }), d("X5", "O4", { x: 31.5, y: 51.8 })],
        ballHolder: "O4",
        lines: [ln("cut", "defense", [{ x: 22.5, y: 81.8 }, { x: 20.5, y: 80 }])],
        note: "Soft deny the inbound to the corner below the free-throw line. x4 is the free safety on the inbound side until the catch.",
      },
      {
        offense: [o("O1", 18, 76.4), o("O2", 38, 70.6), o("O3", 12, 54.5), o("O4", 27, 79.5), o("O5", 33, 50)],
        defense: [d("X4", "O1", { x: 25.5, y: 77.7 }), d("X1", "O1", { x: 17.5, y: 78.6 }), d("X2", "O1", { x: 36.5, y: 71.5 }), d("X3", "O1", { x: 13.5, y: 56.3 }), d("X5", "O1", { x: 31.5, y: 51.8 })],
        ballHolder: "O1",
        lines: [ln("cut", "offense", [{ x: 25, y: 85.6 }, { x: 27, y: 79.5 }]), ln("cut", "defense", [{ x: 20.5, y: 80 }, { x: 25.5, y: 77.7 }]), ln("pass", "offense", [{ x: 25, y: 85.6 }, { x: 18, y: 76.4 }])],
        note: "Ball comes in to 1. x4 goes to full man on the inbounder.",
        ballArrival: [{ x: 25, y: 85.6 }, { x: 18, y: 76.4 }],
      },
      {
        offense: [o("O1", 9.5, 64.3), o("O2", 38, 70.6), o("O3", 12, 54.5), o("O4", 27, 79.5), o("O5", 33, 50)],
        defense: [d("X4", "O1", { x: 25.5, y: 77.7 }), d("X1", "O1", { x: 11, y: 66.6 }), d("X2", "O1", { x: 36.5, y: 71.5 }), d("X3", "O1", { x: 13.5, y: 56.3 }), d("X5", "O1", { x: 31.5, y: 51.8 })],
        ballHolder: "O1",
        lines: [ln("dribble", "offense", [{ x: 18, y: 76.4 }, { x: 15.7, y: 75 }, { x: 13.7, y: 73.3 }, { x: 12.1, y: 71.4 }, { x: 10.9, y: 69.2 }, { x: 10, y: 66.9 }, { x: 9.5, y: 64.3 }]), ln("cut", "defense", [{ x: 17.5, y: 78.6 }, { x: 11, y: 66.6 }])],
        note: "x1 cuts off the dribbler and turns him to the sideline.",
      },
      {
        offense: [o("O1", 8.5, 62.6), o("O2", 38, 70.6), o("O3", 12, 54.5), o("O4", 27, 79.5), o("O5", 33, 50)],
        defense: [d("X4", "O1", { x: 25.5, y: 77.7 }), d("X1", "O1", { x: 11, y: 66.6 }), d("X2", "O1", { x: 36.5, y: 71.5 }), d("X3", "O1", { x: 8, y: 60.8 }), d("X5", "O1", { x: 31.5, y: 51.8 })],
        ballHolder: "O1",
        lines: [ln("cut", "defense", [{ x: 13.5, y: 56.3 }, { x: 8, y: 60.8 }]), ln("dribble", "offense", [{ x: 9.5, y: 64.3 }, { x: 8.5, y: 62.6 }])],
        note: "Jump: the closest level defender (x3) leaves his man and jumps the dribbler from the side. Never trap down.",
      },
      {
        offense: [o("O1", 8.5, 62.6), o("O2", 38, 70.6), o("O3", 12, 54.5), o("O4", 27, 79.5), o("O5", 33, 50)],
        defense: [d("X4", "O1", { x: 25.5, y: 77.7 }), d("X1", "O1", { x: 13.5, y: 54.5 }), d("X2", "O1", { x: 30, y: 65.2 }), d("X3", "O1", { x: 8, y: 60.8 }), d("X5", "O1", { x: 30.5, y: 50 })],
        ballHolder: "O1",
        lines: [ln("cut", "defense", [{ x: 11, y: 66.6 }, { x: 13.5, y: 54.5 }]), ln("cut", "defense", [{ x: 36.5, y: 71.5 }, { x: 30, y: 65.2 }]), ln("cut", "defense", [{ x: 31.5, y: 51.8 }, { x: 30.5, y: 50 }])],
        note: "On the jump, x1 runs to the most dangerous open man (3). Everyone rotates up.",
      },
    ],
    "This is the team's own base press, not a standard textbook diagram — it matches the Run & Jump system Hardwood Lab already tracks for this team."
  ),

  play(
    "man-help",
    "Half-Court Man",
    "defense",
    "Help-side principles",
    "Lightning half-court man rules. Pressure the ball, loose deny one pass away, split the court two passes away.",
    [
      "Ball side: loose deny. Help side: split the court.",
      "Jump to the ball on every pass — move while the ball is in the air.",
      "Closeout: short choppy steps, high hand, take away the shot.",
      "Talk: “ball,” “help,” “shot.”",
    ],
    [
      {
        offense: [o("O1", 25, 32), o("O2", 44.5, 21), o("O3", 5.5, 21), o("O4", 3, 3.5), o("O5", 32, 8)],
        defense: [d("X1", "O1", { x: 25, y: 29 }), d("X2", "O1", { x: 41.5, y: 20 }), d("X3", "O1", { x: 11, y: 19.5 }), d("X4", "O1", { x: 9.5, y: 7 }), d("X5", "O1", { x: 31.5, y: 10 })],
        ballHolder: "O1",
        lines: [],
        note: "Lightning half-court man rules. Pressure the ball, loose deny one pass away, split the court two passes away.",
      },
      {
        offense: [o("O1", 25, 32), o("O2", 44.5, 21), o("O3", 5.5, 21), o("O4", 3, 3.5), o("O5", 32, 8)],
        defense: [d("X1", "O1", { x: 25, y: 29 }), d("X2", "O1", { x: 41.5, y: 20 }), d("X3", "O1", { x: 11, y: 19.5 }), d("X4", "O1", { x: 9.5, y: 7 }), d("X5", "O1", { x: 31.5, y: 10 })],
        ballHolder: "O1",
        lines: [],
        note: "Ball at the top: pressure on the ball, one pass away loose deny.",
      },
      {
        offense: [o("O1", 25, 32), o("O2", 44.5, 21), o("O3", 5.5, 21), o("O4", 3, 3.5), o("O5", 32, 8)],
        defense: [d("X1", "O2", { x: 29.5, y: 26.5 }), d("X2", "O2", { x: 42, y: 21.5 }), d("X3", "O2", { x: 20.5, y: 21.5 }), d("X4", "O2", { x: 19.5, y: 9 }), d("X5", "O2", { x: 34.5, y: 10 })],
        ballHolder: "O2",
        lines: [ln("cut", "defense", [{ x: 41.5, y: 20 }, { x: 42, y: 21.5 }]), ln("cut", "defense", [{ x: 25, y: 29 }, { x: 29.5, y: 26.5 }]), ln("cut", "defense", [{ x: 11, y: 19.5 }, { x: 20.5, y: 21.5 }]), ln("cut", "defense", [{ x: 9.5, y: 7 }, { x: 19.5, y: 9 }]), ln("cut", "defense", [{ x: 31.5, y: 10 }, { x: 34.5, y: 10 }]), ln("pass", "offense", [{ x: 25, y: 32 }, { x: 44.5, y: 21 }])],
        note: "Pass to the wing — everyone jumps to the ball. x3 and x4 sink to split the court.",
        ballArrival: [{ x: 25, y: 32 }, { x: 44.5, y: 21 }],
      },
      {
        offense: [o("O1", 25, 32), o("O2", 42, 6.5), o("O3", 5.5, 21), o("O4", 3, 3.5), o("O5", 32, 8)],
        defense: [d("X1", "O2", { x: 29.5, y: 26.5 }), d("X2", "O2", { x: 43, y: 9.5 }), d("X3", "O2", { x: 19.5, y: 8 }), d("X4", "O2", { x: 38.5, y: 5 }), d("X5", "O2", { x: 34.5, y: 10 })],
        ballHolder: "O2",
        lines: [ln("dribble", "offense", [{ x: 44.5, y: 21 }, { x: 42, y: 6.5 }]), ln("cut", "defense", [{ x: 42, y: 21.5 }, { x: 43, y: 9.5 }]), ln("cut", "defense", [{ x: 19.5, y: 9 }, { x: 38.5, y: 5 }]), ln("cut", "defense", [{ x: 20.5, y: 21.5 }, { x: 19.5, y: 8 }])],
        note: "2 drives baseline: x4 rotates over to stop him, x3 drops to the weak block.",
      },
      {
        offense: [o("O1", 25, 32), o("O2", 42, 6.5), o("O3", 5.5, 21), o("O4", 3, 3.5), o("O5", 32, 8)],
        defense: [d("X1", "O4", { x: 22, y: 14 }), d("X2", "O4", { x: 43, y: 9.5 }), d("X3", "O4", { x: 6.5, y: 6 }), d("X4", "O4", { x: 38.5, y: 5 }), d("X5", "O4", { x: 34.5, y: 10 })],
        ballHolder: "O4",
        lines: [ln("cut", "defense", [{ x: 19.5, y: 8 }, { x: 6.5, y: 6 }]), ln("cut", "defense", [{ x: 29.5, y: 26.5 }, { x: 22, y: 14 }]), ln("pass", "offense", [{ x: 42, y: 6.5 }, { x: 3, y: 3.5 }])],
        note: "Kick to 4 in the corner: x3 closes out, x1 sinks to the paint.",
        ballArrival: [{ x: 42, y: 6.5 }, { x: 3, y: 3.5 }],
      },
    ]
  ),

  play(
    "zone-23",
    "2-3 Zone Shifts",
    "defense",
    "Zone defense",
    "Where each defender goes as the ball moves. Use it to protect foul trouble or a slower team.",
    [
      "Hands up and active — take away passing lanes.",
      "Move on the pass, not the catch.",
      "Box out by area: find the nearest body when the shot goes up.",
      "Never let the ball into the high post uncontested.",
    ],
    [
      {
        offense: [o("O1", 25, 32), o("O2", 44.5, 21), o("O3", 5.5, 21), o("O4", 47, 3.5), o("O5", 25, 18)],
        defense: [d("X1", "O1", { x: 19.5, y: 22.5 }), d("X2", "O1", { x: 30.5, y: 22.5 }), d("X3", "O1", { x: 12, y: 9.5 }), d("X4", "O1", { x: 38, y: 9.5 }), d("X5", "O1", { x: 25, y: 7 })],
        ballHolder: "O1",
        lines: [],
        note: "Where each defender goes as the ball moves. Use it to protect foul trouble or a slower team.",
      },
      {
        offense: [o("O1", 25, 32), o("O2", 44.5, 21), o("O3", 5.5, 21), o("O4", 47, 3.5), o("O5", 25, 18)],
        defense: [d("X1", "O1", { x: 19.5, y: 22.5 }), d("X2", "O1", { x: 30.5, y: 22.5 }), d("X3", "O1", { x: 12, y: 9.5 }), d("X4", "O1", { x: 38, y: 9.5 }), d("X5", "O1", { x: 25, y: 7 })],
        ballHolder: "O1",
        lines: [],
        note: "Base: guards at the elbows, forwards at the blocks, center in the middle.",
      },
      {
        offense: [o("O1", 25, 32), o("O2", 44.5, 21), o("O3", 5.5, 21), o("O4", 47, 3.5), o("O5", 25, 18)],
        defense: [d("X1", "O2", { x: 26, y: 20.5 }), d("X2", "O2", { x: 42, y: 21.5 }), d("X3", "O2", { x: 21.5, y: 9 }), d("X4", "O2", { x: 38.5, y: 11 }), d("X5", "O2", { x: 30.5, y: 7.5 })],
        ballHolder: "O2",
        lines: [ln("cut", "defense", [{ x: 30.5, y: 22.5 }, { x: 42, y: 21.5 }]), ln("cut", "defense", [{ x: 19.5, y: 22.5 }, { x: 26, y: 20.5 }]), ln("cut", "defense", [{ x: 38, y: 9.5 }, { x: 38.5, y: 11 }]), ln("cut", "defense", [{ x: 25, y: 7 }, { x: 30.5, y: 7.5 }]), ln("cut", "defense", [{ x: 12, y: 9.5 }, { x: 21.5, y: 9 }]), ln("pass", "offense", [{ x: 25, y: 32 }, { x: 44.5, y: 21 }])],
        note: "Ball to the wing: x2 takes the ball, x1 covers the high post, x4 drops, x5 slides ball side, x3 to the middle.",
        ballArrival: [{ x: 25, y: 32 }, { x: 44.5, y: 21 }],
      },
      {
        offense: [o("O1", 25, 32), o("O2", 44.5, 21), o("O3", 5.5, 21), o("O4", 47, 3.5), o("O5", 25, 18)],
        defense: [d("X1", "O4", { x: 26.5, y: 19 }), d("X2", "O4", { x: 37.5, y: 16 }), d("X3", "O4", { x: 21.5, y: 9 }), d("X4", "O4", { x: 44.5, y: 5.5 }), d("X5", "O4", { x: 33, y: 7 })],
        ballHolder: "O4",
        lines: [ln("cut", "defense", [{ x: 38.5, y: 11 }, { x: 44.5, y: 5.5 }]), ln("cut", "defense", [{ x: 42, y: 21.5 }, { x: 37.5, y: 16 }]), ln("cut", "defense", [{ x: 30.5, y: 7.5 }, { x: 33, y: 7 }]), ln("cut", "defense", [{ x: 26, y: 20.5 }, { x: 26.5, y: 19 }]), ln("pass", "offense", [{ x: 44.5, y: 21 }, { x: 47, y: 3.5 }])],
        note: "Ball to the corner: x4 closes out, x5 fronts the low block, x2 drops to the wing-elbow gap.",
        ballArrival: [{ x: 44.5, y: 21 }, { x: 47, y: 3.5 }],
      },
    ]
  ),

  play(
    "trap-131",
    "1-3-1 Trap",
    "defense",
    "Zone defense",
    "Aggressive half-court zone. Trap the wings, cut off the high post, and send the baseline runner to the corner.",
    [
      "Trap with your knees and hands; no reaching.",
      "Wing defender stops the ball from getting to the corner.",
      "Baseline runner: you own the corner and the block.",
      "Gamble only when the passer’s eyes give it away.",
    ],
    [
      {
        offense: [o("O1", 25, 33), o("O2", 45, 22), o("O3", 5, 22), o("O4", 47, 3.5), o("O5", 11, 7)],
        defense: [d("X1", "O1", { x: 25, y: 30 }), d("X2", "O1", { x: 9, y: 20.5 }), d("X3", "O1", { x: 25, y: 20 }), d("X4", "O1", { x: 41, y: 20.5 }), d("X5", "O1", { x: 25, y: 6 })],
        ballHolder: "O1",
        lines: [],
        note: "Aggressive half-court zone. Trap the wings, cut off the high post, and send the baseline runner to the corner.",
      },
      {
        offense: [o("O1", 25, 33), o("O2", 45, 22), o("O3", 5, 22), o("O4", 47, 3.5), o("O5", 11, 7)],
        defense: [d("X1", "O1", { x: 26.5, y: 30 }), d("X2", "O1", { x: 9, y: 20.5 }), d("X3", "O1", { x: 25, y: 20 }), d("X4", "O1", { x: 41, y: 20.5 }), d("X5", "O1", { x: 25, y: 6 })],
        ballHolder: "O1",
        lines: [ln("cut", "defense", [{ x: 25, y: 30 }, { x: 26.5, y: 30 }])],
        note: "x1 pressures the ball at the top and points it to one side.",
      },
      {
        offense: [o("O1", 25, 33), o("O2", 45, 22), o("O3", 5, 22), o("O4", 47, 3.5), o("O5", 11, 7)],
        defense: [d("X1", "O2", { x: 40.5, y: 24.5 }), d("X2", "O2", { x: 21, y: 15 }), d("X3", "O2", { x: 33, y: 17.5 }), d("X4", "O2", { x: 43, y: 18.5 }), d("X5", "O2", { x: 42.5, y: 6 })],
        ballHolder: "O2",
        lines: [ln("cut", "defense", [{ x: 26.5, y: 30 }, { x: 40.5, y: 24.5 }]), ln("cut", "defense", [{ x: 41, y: 20.5 }, { x: 43, y: 18.5 }]), ln("cut", "defense", [{ x: 25, y: 20 }, { x: 33, y: 17.5 }]), ln("cut", "defense", [{ x: 25, y: 6 }, { x: 42.5, y: 6 }]), ln("cut", "defense", [{ x: 9, y: 20.5 }, { x: 21, y: 15 }]), ln("pass", "offense", [{ x: 25, y: 33 }, { x: 45, y: 22 }])],
        note: "Pass to the wing: x1 and x4 trap, x3 cuts off the high post, x5 runs to the corner, x2 drops to the middle.",
        ballArrival: [{ x: 25, y: 33 }, { x: 45, y: 22 }],
      },
      {
        offense: [o("O1", 25, 33), o("O2", 45, 22), o("O3", 5, 22), o("O4", 47, 3.5), o("O5", 11, 7)],
        defense: [d("X1", "O2", { x: 40.5, y: 24.5 }), d("X2", "O2", { x: 25.5, y: 25 }), d("X3", "O2", { x: 33, y: 17.5 }), d("X4", "O2", { x: 43, y: 18.5 }), d("X5", "O2", { x: 42.5, y: 6 })],
        ballHolder: "O2",
        lines: [ln("cut", "defense", [{ x: 21, y: 15 }, { x: 25.5, y: 25 }])],
        note: "x2 reads the skip back to the top — jump the lane for the steal.",
      },
    ]
  ),

  play(
    "press-221",
    "2-2-1 Press",
    "defense",
    "Full court zone",
    "Soft zone press. Let the inbound happen, funnel to the sideline, trap after the first dribble.",
    [
      "Front line: funnel to the sideline, never let the ball go middle.",
      "Trappers: make it a “V” toward half court.",
      "Interceptors read the passer’s eyes.",
      "Beat? Sprint back and get into half-court defense.",
    ],
    [
      {
        offense: [o("O1", 13, 80.4), o("O2", 37, 74.2), o("O3", 20, 58.1), o("O4", 25, 85.6), o("O5", 30, 35.7)],
        defense: [d("X1", "O4", { x: 17.5, y: 78.6 }), d("X2", "O4", { x: 32.5, y: 78.6 }), d("X3", "O4", { x: 14, y: 58.1 }), d("X4", "O4", { x: 36, y: 58.1 }), d("X5", "O4", { x: 25, y: 34 })],
        ballHolder: "O4",
        lines: [],
        note: "Soft zone press. Let the inbound happen, funnel to the sideline, trap after the first dribble.",
      },
      {
        offense: [o("O1", 13, 80.4), o("O2", 37, 74.2), o("O3", 20, 58.1), o("O4", 25, 85.6), o("O5", 30, 35.7)],
        defense: [d("X1", "O1", { x: 17.5, y: 78.6 }), d("X2", "O1", { x: 32.5, y: 78.6 }), d("X3", "O1", { x: 14, y: 58.1 }), d("X4", "O1", { x: 36, y: 58.1 }), d("X5", "O1", { x: 25, y: 34 })],
        ballHolder: "O1",
        lines: [ln("pass", "offense", [{ x: 25, y: 85.6 }, { x: 13, y: 80.4 }])],
        note: "Let the inbound happen; the front two funnel it to the sideline.",
        ballArrival: [{ x: 25, y: 85.6 }, { x: 13, y: 80.4 }],
      },
      {
        offense: [o("O1", 8.5, 68.8), o("O2", 37, 74.2), o("O3", 20, 58.1), o("O4", 25, 85.6), o("O5", 30, 35.7)],
        defense: [d("X1", "O1", { x: 11.5, y: 71.5 }), d("X2", "O1", { x: 32.5, y: 78.6 }), d("X3", "O1", { x: 7.5, y: 65.2 }), d("X4", "O1", { x: 36, y: 58.1 }), d("X5", "O1", { x: 25, y: 34 })],
        ballHolder: "O1",
        lines: [ln("dribble", "offense", [{ x: 13, y: 80.4 }, { x: 8.5, y: 68.8 }]), ln("cut", "defense", [{ x: 17.5, y: 78.6 }, { x: 11.5, y: 71.5 }]), ln("cut", "defense", [{ x: 14, y: 58.1 }, { x: 7.5, y: 65.2 }])],
        note: "Trap after the first dribble: x1 and x3 trap 1 near the sideline.",
      },
      {
        offense: [o("O1", 8.5, 68.8), o("O2", 37, 74.2), o("O3", 20, 58.1), o("O4", 25, 85.6), o("O5", 30, 35.7)],
        defense: [d("X1", "O1", { x: 11.5, y: 71.5 }), d("X2", "O1", { x: 23, y: 67.9 }), d("X3", "O1", { x: 7.5, y: 65.2 }), d("X4", "O1", { x: 18.5, y: 53.6 }), d("X5", "O1", { x: 25, y: 28.6 })],
        ballHolder: "O1",
        lines: [ln("cut", "defense", [{ x: 32.5, y: 78.6 }, { x: 23, y: 67.9 }]), ln("cut", "defense", [{ x: 36, y: 58.1 }, { x: 18.5, y: 53.6 }]), ln("cut", "defense", [{ x: 25, y: 34 }, { x: 25, y: 28.6 }])],
        note: "Rotate: x2 takes the middle, x4 the sideline lane, x5 protects the rim.",
      },
    ]
  ),

  play(
    "box-and-1",
    "Box-and-1",
    "defense",
    "Junk defense",
    "Face-guard their best scorer with one defender. The other four play a box zone.",
    [
      "Chaser: face-guard, deny every catch, no help.",
      "Box: ball-side top takes the ball, bottom two protect the rim.",
      "Make the other four beat you.",
    ],
    [
      {
        offense: [o("O1", 25, 32), o("O2", 44.5, 21), o("O3", 5.5, 21), o("O4", 3, 3.5), o("O5", 32, 8)],
        defense: [d("X1", "O1", { x: 19.5, y: 20 }), d("X2", "O1", { x: 30.5, y: 20 }), d("X3", "O1", { x: 18.5, y: 8 }), d("X4", "O1", { x: 31.5, y: 8 }), d("X5", "O1", { x: 42, y: 19.5 })],
        ballHolder: "O1",
        lines: [],
        note: "Face-guard their best scorer with one defender. The other four play a box zone.",
      },
      {
        offense: [o("O1", 25, 32), o("O2", 44.5, 21), o("O3", 5.5, 21), o("O4", 3, 3.5), o("O5", 32, 8)],
        defense: [d("X1", "O1", { x: 19.5, y: 20 }), d("X2", "O1", { x: 30.5, y: 20 }), d("X3", "O1", { x: 18.5, y: 8 }), d("X4", "O1", { x: 31.5, y: 8 }), d("X5", "O1", { x: 42, y: 19.5 })],
        ballHolder: "O1",
        lines: [],
        note: "x5 face-guards their best scorer (2) everywhere. The other four hold the box.",
      },
      {
        offense: [o("O1", 25, 32), o("O2", 47, 4.5), o("O3", 5.5, 21), o("O4", 3, 3.5), o("O5", 32, 8)],
        defense: [d("X1", "O1", { x: 19.5, y: 20 }), d("X2", "O1", { x: 30.5, y: 20 }), d("X3", "O1", { x: 18.5, y: 8 }), d("X4", "O1", { x: 31.5, y: 8 }), d("X5", "O1", { x: 45.5, y: 7.5 })],
        ballHolder: "O1",
        lines: [ln("cut", "offense", [{ x: 44.5, y: 21 }, { x: 45.3, y: 18.9 }, { x: 45.9, y: 16.5 }, { x: 46.4, y: 13.9 }, { x: 46.7, y: 11 }, { x: 46.9, y: 7.9 }, { x: 47, y: 4.5 }]), ln("cut", "defense", [{ x: 42, y: 19.5 }, { x: 45.5, y: 7.5 }])],
        note: "2 cuts to the corner; x5 chases and denies. The box stays home.",
      },
      {
        offense: [o("O1", 25, 32), o("O2", 47, 4.5), o("O3", 5.5, 21), o("O4", 3, 3.5), o("O5", 32, 8)],
        defense: [d("X1", "O3", { x: 9.5, y: 20.5 }), d("X2", "O3", { x: 21.5, y: 21 }), d("X3", "O3", { x: 13, y: 8.5 }), d("X4", "O3", { x: 25.5, y: 8.5 }), d("X5", "O3", { x: 45.5, y: 7.5 })],
        ballHolder: "O3",
        lines: [ln("cut", "defense", [{ x: 19.5, y: 20 }, { x: 9.5, y: 20.5 }]), ln("cut", "defense", [{ x: 18.5, y: 8 }, { x: 13, y: 8.5 }]), ln("cut", "defense", [{ x: 30.5, y: 20 }, { x: 21.5, y: 21 }]), ln("cut", "defense", [{ x: 31.5, y: 8 }, { x: 25.5, y: 8.5 }]), ln("pass", "offense", [{ x: 25, y: 32 }, { x: 5.5, y: 21 }])],
        note: "Ball to 3 on the left wing — x1 takes the wing, the box shifts.",
        ballArrival: [{ x: 25, y: 32 }, { x: 5.5, y: 21 }],
      },
    ]
  ),

  play(
    "flare-slip-pin2",
    "Flare to Slip",
    "zone",
    "vs 1-2-2 Zone",
    "A flare screen for the point guard away from the ball, slipped to the rim instead of held, while a second screener pins the corner man up to the wing at the same time — two actions at once, so a 1-2-2's back line only has two defenders to answer both.",
    [
      "5 (the flare screener): slip the instant 1's defender starts to chase the flare — the goal is beating him before he recovers, not setting a textbook screen.",
      "4: hold the pin on 2's defender until 2 has actually cleared it. Let go early and the zone just slides over to cover him.",
      "1: run the flare all the way out, full speed. A flare that doesn't look live won't pull the defender far enough off to open the slip behind him.",
      "Whoever's on the wing with the ball: the slip to 5 is the first read — the reversal out to 2 off the pin is right there if it isn't open.",
    ],
    [
      {
        offense: [o("O1", 25, 32), o("O2", 4, 6), o("O3", 40, 22), o("O4", 12, 9), o("O5", 33, 25)],
        defense: [d("X1", "O1", { x: 25, y: 27 }), d("X2", "O2", { x: 13, y: 19 }), d("X3", "O3", { x: 37, y: 19 }), d("X4", "O2", { x: 17, y: 8 }), d("X5", "O3", { x: 33, y: 8 })],
        ballHolder: "O1",
        lines: [],
        note: "1-2-2 zone look: 1 up top with the ball, 3 on the wing, 2 deep in the corner, 4 and 5 underneath — a standard 3-out/2-in spacing.",
      },
      {
        offense: [o("O1", 25, 32), o("O2", 4, 6), o("O3", 40, 22), o("O4", 12, 9), o("O5", 33, 25)],
        defense: [d("X1", "O1", { x: 28, y: 24 }), d("X2", "O2", { x: 18, y: 18 }), d("X3", "O3", { x: 40, y: 19 }), d("X4", "O2", { x: 20, y: 8 }), d("X5", "O3", { x: 30, y: 8 })],
        ballHolder: "O3",
        lines: [ln("pass", "offense", [{ x: 25, y: 32 }, { x: 40, y: 22 }])],
        note: "1 reverses it to 3 on the wing — the zone shifts with the ball.",
        ballArrival: [{ x: 25, y: 32 }, { x: 40, y: 22 }],
      },
      {
        offense: [o("O1", 8, 27), o("O2", 16, 19), o("O3", 40, 22), o("O4", 7, 7), o("O5", 18, 28)],
        defense: [d("X1", "O1", { x: 15, y: 26 }), d("X2", "O2", { x: 19, y: 21 }), d("X3", "O3", { x: 39, y: 20 }), d("X4", "O2", { x: 12, y: 9 }), d("X5", "O3", { x: 28, y: 8 })],
        ballHolder: "O3",
        lines: [
          ln("screen", "offense", [{ x: 33, y: 25 }, { x: 18, y: 28 }]),
          ln("cut", "offense", [{ x: 25, y: 32 }, { x: 8, y: 27 }]),
          ln("screen", "offense", [{ x: 12, y: 9 }, { x: 7, y: 7 }]),
          ln("cut", "offense", [{ x: 4, y: 6 }, { x: 16, y: 19 }]),
        ],
        note: "5 flares up for 1 while 4 pins down for 2, at the same time — 1 fades away from the ball, 2 pops off the pin to the left slot.",
      },
      {
        offense: [o("O1", 8, 27), o("O2", 16, 19), o("O3", 40, 22), o("O4", 7, 7), o("O5", 21, 7)],
        defense: [d("X1", "O1", { x: 10, y: 22 }), d("X2", "O2", { x: 19, y: 22 }), d("X3", "O3", { x: 36, y: 16 }), d("X4", "O2", { x: 11, y: 10 }), d("X5", "O3", { x: 26, y: 8 })],
        ballHolder: "O5",
        lines: [ln("cut", "offense", [{ x: 18, y: 28 }, { x: 21, y: 7 }]), ln("pass", "offense", [{ x: 40, y: 22 }, { x: 21, y: 7 }])],
        note: "5 slips the screen instead of holding it — 3 hits him cutting to the rim before the back line can rotate over.",
        ballArrival: [{ x: 40, y: 22 }, { x: 21, y: 7 }],
      },
      {
        offense: [o("O1", 8, 27), o("O2", 16, 19), o("O3", 40, 22), o("O4", 7, 7), o("O5", 21, 7)],
        defense: [d("X1", "O1", { x: 10, y: 22 }), d("X2", "O2", { x: 19, y: 22 }), d("X3", "O3", { x: 35, y: 15 }), d("X4", "O2", { x: 11, y: 10 }), d("X5", "O3", { x: 23, y: 8 })],
        ballHolder: "O5",
        lines: [],
        note: "Finish at the rim off the slip — the zone's back line never got there.",
      },
    ],
    "Action named and generally inspired by a short-form coaching clip posted by \"Coach B 0.3\" (titled \"3-2 Flare to Slip with Pin 2\") — the flare-into-a-slip and the simultaneous pin-down for 2 are standard, widely-taught actions. The 1-2-2 look and the specific zone reactions shown here are my own construction, not copied from that clip."
  ),
];
