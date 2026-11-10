/**
 * The standing team rules that sit in front of every play in the printed playbook — defensive
 * coverages and communication expectations that apply across whichever play is actually called,
 * not tied to any one diagram. Kept separate from the play library since these have no court
 * diagram of their own.
 */
export type PhilosophyPillar = {
  title: string;
  points: string[];
};

export const TEAM_PHILOSOPHY: PhilosophyPillar[] = [
  {
    title: "Man-to-Man Principles",
    points: [
      "Ball pressure, every possession — a relaxed on-ball defender is the one thing that breaks this whole system.",
      "One pass away: loose deny. More than one pass away: split the court between your man and the ball, in help.",
      "Jump to the ball on every pass — move while it's in the air, not after it lands.",
      "Talk: \"ball,\" \"help,\" \"shot.\"",
    ],
  },
  {
    title: "Ball-Screen Coverage",
    points: [
      "Guard screening for a guard: blitz the ball handler — trap it and force it out of his hands.",
      "Big screening for a guard: hedge, then get back to your own man — don't switch, don't trail through it.",
      "Vocal on every screen: call out which side it's coming on in time for your teammate to use it.",
    ],
  },
  {
    title: "Transition",
    points: [
      "Push the ball up the floor with the pass, looking to score quickly — see Cycle, in Offensive System, for the full read.",
    ],
  },
];
