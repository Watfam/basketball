/**
 * Which existing drills can be tracked with the camera, and what kind of shot each one is.
 *
 * Nothing here is a new drill library. The drills, workouts and plans stay exactly as they are (hoops.drills, workout_drills); this reads a drill's
 * own name, variant and skill tags and says (a) whether counting its makes and attempts is meaningful, and (b) which KIND of shooting it asks for,
 * so results can be kept by kind and not only as one overall percentage.
 *
 * What the camera does and does not know is stated in WHAT_IS_MEASURED and is the rule for every screen that talks about a tracked drill: the camera
 * counts shots and calls them make or miss; the kind of shot comes from the drill's definition and the player starting it, never from the picture.
 */

export type ShootingCategory = "stationary" | "catch_and_shoot" | "movement" | "off_the_dribble" | "change_of_direction" | "decision" | "pressure_challenge";

export const CATEGORY_ORDER: ShootingCategory[] = ["stationary", "catch_and_shoot", "movement", "off_the_dribble", "change_of_direction", "decision", "pressure_challenge"];

export const CATEGORY_LABELS: Record<ShootingCategory, string> = {
  stationary: "Stationary shooting",
  catch_and_shoot: "Catch-and-shoot",
  movement: "Movement shooting",
  off_the_dribble: "Off-the-dribble shooting",
  change_of_direction: "Shooting after a change of direction",
  decision: "Decision-making shooting",
  pressure_challenge: "Timed challenge",
};

/** What the category means in this app: what the DRILL asks the player to do. It is never something the camera detected. */
export const CATEGORY_MEANING: Record<ShootingCategory, string> = {
  stationary: "Shots taken standing still (free throws, spot shots).",
  catch_and_shoot: "Shots taken off a pass or a catch, as the drill is set up.",
  movement: "Shots after moving to a spot, with no dribble.",
  off_the_dribble: "Shots after one or more dribbles (pull-ups, step-backs).",
  change_of_direction: "Shots straight after a cut or a change of direction.",
  decision: "Shots where the player chooses what to do (read and react).",
  pressure_challenge: "Shots against a clock or a target. The pressure is the timer, not a defender.",
};

export type DrillProfile = {
  category: ShootingCategory | null;
  /** Counting makes and attempts for this drill is meaningful and the camera can be offered. */
  trackable: boolean;
  /** One plain sentence for why (shown when it is not offered, and kept in the report). */
  why: string;
  /** "defined": an entry for this exact drill was written by hand. "keyword": inferred from the name, shown the same but never trusted for new claims. "none": not a shooting-outcome drill. */
  basis: "defined" | "keyword" | "none";
  /** Free throws are stationary but are a spot of their own. */
  freeThrow?: boolean;
};

const DEFINED: Record<string, Omit<DrillProfile, "basis">> = {
  "form shooting progression": { category: "stationary", trackable: false, why: "Form work is about the mechanics of the shot, not the make count." },
  "one-hand form shooting": { category: "stationary", trackable: false, why: "Form work at close range is about the mechanics of the shot, not the make count." },
  "free throw reset": { category: "stationary", trackable: true, why: "Free throws: the same shot every time.", freeThrow: true },
  "catch-and-shoot off the pin-down": { category: "catch_and_shoot", trackable: true, why: "A catch-and-shoot after moving off a screen." },
  "elbow pull-up": { category: "off_the_dribble", trackable: true, why: "A one-dribble pull-up jumper." },
  "off-the-dribble pull-up series": { category: "off_the_dribble", trackable: true, why: "Pull-up jumpers off the dribble." },
  "wing step-back": { category: "off_the_dribble", trackable: true, why: "A step-back jumper off the dribble." },
  "beat the clock finisher": { category: "pressure_challenge", trackable: true, why: "Makes against a clock." },
  "big man post-up footwork": { category: null, trackable: false, why: "Post footwork: the camera is set up for jump shots at the rim, not post moves." },
};

const KEYWORDS: { re: RegExp; category: ShootingCategory; trackable: boolean; freeThrow?: boolean; why: string }[] = [
  { re: /free[ -]?throw/i, category: "stationary", trackable: true, freeThrow: true, why: "Free throws." },
  { re: /catch[- ]and[- ]shoot|spot[- ]?up/i, category: "catch_and_shoot", trackable: true, why: "Catch-and-shoot." },
  { re: /pull-?up|step-?back|off[- ]the[- ]dribble/i, category: "off_the_dribble", trackable: true, why: "Shots off the dribble." },
  { re: /beat the clock|against the clock|challenge/i, category: "pressure_challenge", trackable: true, why: "Makes against a clock." },
  { re: /\bform\b/i, category: "stationary", trackable: false, why: "Form work is about mechanics, not the make count." },
];

/**
 * The profile of one drill. Exact definitions win; otherwise a drill tagged `shooting` whose name clearly says what it is gets a keyword profile
 * (marked as such); anything else is not offered the camera.
 */
export function shootingProfile(drill: { name: string; skill_tags?: string[] | null } | null | undefined): DrillProfile {
  const name = drill?.name?.trim() ?? "";
  const hit = DEFINED[name.toLowerCase()];
  if (hit) return { ...hit, basis: "defined" };
  if ((drill?.skill_tags ?? []).includes("shooting")) {
    const k = KEYWORDS.find((x) => x.re.test(name));
    if (k) return { category: k.category, trackable: k.trackable, why: k.why, freeThrow: k.freeThrow, basis: "keyword" };
  }
  return { category: null, trackable: false, why: "This drill is not about counting made and missed shots.", basis: "none" };
}

export type Spot = { family: "wing" | "elbow" | "free_throw_line" | "three_point_line" | "unspecified"; side: "right" | "left" | null };

/** Where on the floor a drill entry is shot from, read from its variant label and drill name. Used only to decide what can be compared fairly. */
export function spotOf(drillName: string, variant: string | null | undefined): Spot {
  const v = (variant ?? "").toLowerCase(), n = drillName.toLowerCase();
  const side = /\bright\b/.test(v) ? "right" : /\bleft\b/.test(v) ? "left" : null;
  if (/free throw/.test(v) || /free throw/.test(n)) return { family: "free_throw_line", side: null };
  if (/three-point|3-point|three point/.test(v)) return { family: "three_point_line", side: null };
  if (/wing/.test(v)) return { family: "wing", side };
  if (/elbow/.test(v)) return { family: "elbow", side: /either/.test(v) ? null : side };
  if (/elbow/.test(n)) return { family: "elbow", side };
  if (/wing/.test(n)) return { family: "wing", side };
  return { family: "unspecified", side };
}

export type Prescription = { sets: number | null; reps: number | null; durationSeconds: number | null };
export type TrackingGoal = { kind: "shots" | "time"; target: number };

/** What the set is shot to, from the drill's own prescription: a timed drill is a time goal, sets x reps is a shot count. Null: no goal, ended by hand. */
export function trackingGoal(p: Prescription): TrackingGoal | null {
  if (p.durationSeconds && p.durationSeconds > 0) return { kind: "time", target: Math.min(3600, Math.round(p.durationSeconds)) };
  if (p.sets && p.reps) return { kind: "shots", target: Math.min(300, p.sets * p.reps) };
  if (p.reps) return { kind: "shots", target: Math.min(300, p.reps) };
  return null;
}

/** Who knows what. The rule for every screen and report about a tracked drill. */
export type Source = "camera" | "player" | "drill_definition" | "timer" | "not_measured";
export const WHAT_IS_MEASURED: { id: string; label: string; source: Source; detail: string }[] = [
  { id: "attempts_makes", label: "Shots, makes and misses", source: "camera", detail: "Counted by the camera's ball detection and make/miss rule, then looked over and corrected by you before saving. Without the camera, counted by your taps." },
  { id: "corrections", label: "Corrections", source: "player", detail: "A result you flipped, a shot you added or took back is the player's call and is kept as such." },
  { id: "kind_of_shot", label: "The kind of shot (stationary, catch-and-shoot, off the dribble)", source: "drill_definition", detail: "What the drill asks you to do. You chose to start that drill; the camera did not see how the shot was taken." },
  { id: "clock", label: "The clock in a timed challenge", source: "timer", detail: "The app's timer. It is not evidence of game speed." },
  { id: "footwork", label: "Footwork, balance and form", source: "not_measured", detail: "Not measured. The camera follows the ball, not your body." },
  { id: "game_speed", label: "Game speed", source: "not_measured", detail: "Not measured." },
  { id: "defender", label: "Defender pressure", source: "not_measured", detail: "Not measured. A timed challenge has a clock, not a defender." },
  { id: "decision", label: "Decision quality", source: "not_measured", detail: "Not measured." },
  { id: "spot", label: "Exact shooting spot and distance", source: "not_measured", detail: "Not measured. The spot is what the drill says (for example Right wing), not what the camera saw." },
  { id: "who", label: "Who took the shot", source: "not_measured", detail: "Not measured. It is whoever is shooting at the camera." },
];

export const SOURCE_LABELS: Record<Source, string> = {
  camera: "Counted by the camera",
  player: "Reported by you",
  drill_definition: "From the drill, not seen by the camera",
  timer: "From the app's timer",
  not_measured: "Not measured",
};
