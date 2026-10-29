import type { DefenseId, DrawnLine, Frame, OffenseId, OffensePlayer, DefensePlayer } from "./types";
import type { Point } from "./geometry";

export type PlayCategory = "man" | "zone" | "blob" | "slob" | "fullCourt" | "late" | "defense";
export const PLAY_CATEGORY_LABEL: Record<PlayCategory, string> = {
  man: "Man",
  zone: "Zone",
  blob: "BLOB",
  slob: "SLOB",
  fullCourt: "Press break",
  late: "Late game",
  defense: "Defense",
};

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
function ln(type: DrawnLine["type"], color: DrawnLine["color"], points: { x: number; y: number }[]): DrawnLine {
  seq += 1;
  return { id: `lib${seq}`, type, color, points };
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
    "blob-stack",
    "Stack BLOB",
    "blob",
    "Baseline OB",
    "Four in a line on the ball-side lane. On the slap they explode in four directions.",
    [
      "Top man (2) is the safety — always get open.",
      "5 seals his man with his back before he rolls.",
      "Inbounder: ball fake before every pass.",
    ],
    [
      {
        offense: [o("O1", 32, -1.4), o("O2", 30, 19.5), o("O3", 30, 15), o("O4", 30, 10.5), o("O5", 30, 6)],
        defense: [],
        ballHolder: "O1",
        lines: [],
        note: "Four in a line on the ball-side lane. On the slap they explode in four directions.",
      },
      {
        offense: [o("O1", 32, -1.4), o("O2", 45.5, 25), o("O3", 21, 17.5), o("O4", 40.5, 6), o("O5", 25.5, 4.5)],
        defense: [],
        ballHolder: "O1",
        lines: [ln("cut", "offense", [{ x: 30, y: 6 }, { x: 25.5, y: 4.5 }]), ln("cut", "offense", [{ x: 30, y: 10.5 }, { x: 40.5, y: 6 }]), ln("cut", "offense", [{ x: 30, y: 15 }, { x: 28.8, y: 15.9 }, { x: 27.4, y: 16.6 }, { x: 26, y: 17.1 }, { x: 24.4, y: 17.4 }, { x: 22.8, y: 17.6 }, { x: 21, y: 17.5 }]), ln("cut", "offense", [{ x: 30, y: 19.5 }, { x: 45.5, y: 25 }])],
        note: "The line explodes: 5 rolls to the rim, 4 to the short corner, 3 curls to the elbow, 2 out to the wing.",
      },
      {
        offense: [o("O1", 32, -1.4), o("O2", 45.5, 25), o("O3", 21, 17.5), o("O4", 40.5, 6), o("O5", 25.5, 4.5)],
        defense: [],
        ballHolder: "O4",
        lines: [ln("pass", "offense", [{ x: 32, y: -1.4 }, { x: 40.5, y: 6 }])],
        note: "Read in order. 4 is open in the short corner for the jumper.",
        ballArrival: [{ x: 32, y: -1.4 }, { x: 40.5, y: 6 }],
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
];
