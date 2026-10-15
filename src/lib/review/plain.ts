/**
 * Plain-language wording for shot paths, confidence and missing data, for everyone who is not an engineer. Pure functions, no screen: the
 * words are tested (see plain.test.ts, which also checks that nothing here leaks an engineering term). Nothing here changes what is measured.
 * Everything is as the camera picture shows it: left and right are the picture's, not the shooter's.
 */
export type Level = "tracked" | "partial" | "unreliable" | "none";

export const CONFIDENCE: Record<Level, { label: string; sentence: string; tone: "good" | "ok" | "weak" | "none" }> = {
  tracked: { label: "Clear path", sentence: "The camera followed the ball all the way, so this path can be trusted.", tone: "good" },
  partial: { label: "Mostly clear", sentence: "The camera lost the ball for a moment or two. Gaps are left empty, not guessed.", tone: "ok" },
  unreliable: { label: "Not reliable", sentence: "The camera was not sure it was following the right ball, so this path is hidden unless you ask to see it.", tone: "weak" },
  none: { label: "No path", sentence: "There is no ball path for this shot. The make or miss is still counted.", tone: "none" },
};

const RULES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^No tracking data was kept for this shot\.?$/i, () => "No path was saved for this shot, only the make or miss."],
  [/^Too few connected sightings of the ball to draw a path\.?$/i, () => "The camera saw the ball too few times in a row to draw a path."],
  [/^Only detections on rim hardware were found around this shot/i, () => "The camera only picked up the rim and net, not the ball."],
  [/^No ball was found around this shot\.?$/i, () => "The camera did not find the ball for this shot."],
  [/^(\d+) detections? on a spot at the rim that is often mistaken for the ball were left out/i, () => "The camera mistook part of the rim for the ball and ignored it."],
  [/detections on rim hardware were present in this clip/i, () => "Part of the rim looked like a ball to the camera and was ignored."],
  [/another ball-like object was close to the ball near the rim/i, () => "Something else that looked like a ball was next to it near the rim, so this path may belong to another ball."],
  [/^(\d+) points? left out because another ball-like object was close/i, () => "A few sightings were skipped because something else looked like a ball."],
  [/the ball was not seen coming down through the rim's height/i, () => "The ball was not seen coming down past the rim."],
  [/^the path has (\d+) separate pieces/i, (m) => `The path has ${Number(m[1]) - 1} break${Number(m[1]) === 2 ? "" : "s"} where the ball was not seen. Nothing is drawn across a break.`],
  [/the camera paused looking while nothing moved near the hoop/i, () => "The camera rests when nothing moves near the hoop, so part of this clip was not checked."],
  [/^(\d+) points? (?:is|are) filled in across a one-frame gap/i, (m) => `${m[1]} point${m[1] === "1" ? " is" : "s are"} estimated across a split-second gap (drawn dashed).`],
];

/** One engineering sentence from the analysis, in words anyone can read. Unknown sentences pass through unchanged. */
export function plainReason(reason: string): string {
  const r = reason.trim();
  for (const [re, f] of RULES) { const m = r.match(re); if (m) return f(m); }
  return r.charAt(0).toUpperCase() + r.slice(1) + (r.endsWith(".") ? "" : ".");
}
export function plainReasons(reasons: string[]): string[] { return [...new Set(reasons.map(plainReason))]; }

const MISSING: Record<string, string> = {
  no_observed_descending_crossing: "The camera did not see the ball come down past the rim.",
  bracket_too_wide: "The ball was seen well above and well below the rim but not in between, so where it crossed would be a guess.",
  fewer_than_3_descending_points_in_band: "Not enough sightings on the way down to tell the angle.",
  band_not_descending: "The sightings before the rim did not show the ball coming down.",
  fewer_than_2_descending_steps: "Not enough sightings in a row on the way down to tell the speed.",
  fewer_than_6_points_before_rim_level: "Not enough sightings before the rim to judge how smooth the path was.",
  fewer_than_4_observed_points_after_closest_approach: "The ball was not seen long enough after the rim to tell whether it bounced.",
  no_observed_point_near_rim: "The ball was not seen near the rim.",
  no_closest_approach: "The ball was not seen near the rim.",
  fewer_than_2_observed_points: "The ball was seen fewer than two times.",
  flat_vertical_fit: "The sightings did not show a clear downward direction.",
  degenerate_fit: "The sightings were too close together to tell.",
  no_points: "The ball was not seen.",
};
export function plainMissing(reason: string | undefined): string {
  if (!reason) return "The camera could not measure this.";
  return MISSING[reason] ?? "The camera could not measure this.";
}

export type Measures = Record<string, number | boolean | null | undefined>;
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const bw = (v: number) => Math.abs(v).toFixed(1);

/** Where the ball crossed the height of the rim, as a sentence; null when it was not measured. `bwKnown` false: the ball size was a default, so say "about". */
export function crossingSentence(m: Measures): string | null {
  const x = m.rim_level_x_bw;
  if (!num(x)) return null;
  if (Math.abs(x) < 0.25) return "Came down almost dead centre over the rim.";
  return `Came down about ${bw(x)} ball${Math.abs(x) >= 1.5 ? "s" : ""} to the ${x > 0 ? "right" : "left"} of the rim's centre, as the picture shows it.`;
}
export function angleSentence(m: Measures): string | null {
  const d = m.approach_direction_deg;
  if (!num(d)) return null;
  if (Math.abs(d) < 8) return "Dropping nearly straight down.";
  return `Coming in at a slant toward the ${d > 0 ? "right" : "left"} of the picture.`;
}
export function bounceSentence(m: Measures): string | null {
  if (m.rim_interaction_observed === true) return "The ball was seen bouncing back up off the rim.";
  return null;
}

/** One line for a shot: what the camera saw. Never says why it went in or missed. */
export function shotSummary(opts: { level: Level; m: Measures | null }): string {
  if (opts.level === "none") return CONFIDENCE.none.sentence;
  const parts = opts.m ? [crossingSentence(opts.m), angleSentence(opts.m), bounceSentence(opts.m)].filter((x): x is string => !!x) : [];
  if (parts.length === 0) return opts.level === "unreliable" ? CONFIDENCE.unreliable.sentence : "The camera saw the ball, but not enough to say where it crossed the rim.";
  return parts.join(" ");
}

/** The words for one frame of a replay. */
export function frameStatus(kind: "none_kept" | "hidden" | "not_looking" | "seen" | "estimated" | "unclear" | "rim_part" | "not_seen"): string {
  return {
    none_kept: "No path was saved for this shot.",
    hidden: "This path is hidden because it is not reliable. The video is shown as recorded.",
    not_looking: "The camera was resting here (nothing was moving near the hoop).",
    seen: "The camera saw the ball here.",
    estimated: "Not seen for a split second, so this spot is an estimate (dashed).",
    unclear: "Something else that looked like a ball was right next to it, so this sighting is left out.",
    rim_part: "A part of the rim that looks like a ball was ignored here.",
    not_seen: "The ball was not seen at this moment. Nothing is drawn.",
  }[kind];
}

export const MIN_EACH = 5;
export type OutcomeRow = { made: boolean; level: Level; x: number | null };
export type MakesMisses = { enough: boolean; makes: { n: number; medianAbs: number | null }; misses: { n: number; medianAbs: number | null }; sentence: string; /** Chance of a gap at least this big if makes and misses were mixed at random (null when not enough shots). */ chance: number | null };

const median = (a: number[]) => { const s = [...a].sort((p, q) => p - q); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

/** How often shuffling the makes and misses at random gives a median gap at least as big as the real one. Deterministic (fixed seed), 2,000 shuffles. */
export function shuffleChance(a: number[], b: number[]): number {
  const all = [...a, ...b], na = a.length, real = Math.abs((median(a) as number) - (median(b) as number));
  let s = 0x2545f491, hits = 0;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const idx = all.map((_, i) => i);
  for (let r = 0; r < 2000; r += 1) {
    for (let i = idx.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const x = idx.slice(0, na).map((i) => all[i]), y = idx.slice(na).map((i) => all[i]);
    if (Math.abs((median(x) as number) - (median(y) as number)) >= real - 1e-12) hits += 1;
  }
  return (hits + 1) / 2001;
}

/**
 * Makes against misses among shots with a trustworthy path, as a description of what the camera saw (distance of the crossing from the rim's
 * centre). With fewer than MIN_EACH of either it says there is not enough to compare and gives no numbers; with enough it still says a
 * difference this size may be chance, and points to the tested comparison in History.
 */
export function makesVersusMisses(rows: OutcomeRow[]): MakesMisses {
  const usable = rows.filter((r) => (r.level === "tracked" || r.level === "partial") && r.x !== null && Number.isFinite(r.x));
  const mk = usable.filter((r) => r.made).map((r) => Math.abs(r.x as number)), ms = usable.filter((r) => !r.made).map((r) => Math.abs(r.x as number));
  const base = { makes: { n: mk.length, medianAbs: null as number | null }, misses: { n: ms.length, medianAbs: null as number | null } };
  if (mk.length < MIN_EACH || ms.length < MIN_EACH) {
    return { enough: false, ...base, chance: null, sentence: `Not enough to compare yet. You have ${mk.length} make${mk.length === 1 ? "" : "s"} and ${ms.length} miss${ms.length === 1 ? "" : "es"} with a trustworthy path; at least ${MIN_EACH} of each are needed. You can still look at the paths side by side.` };
  }
  const a = median(mk) as number, b = median(ms) as number, chance = shuffleChance(mk, ms);
  const verdict = chance >= 0.1 ? "A gap this size is common by chance, so nothing can be said yet." : chance >= 0.01 ? "That could still be chance." : "That is a bigger gap than mixing makes and misses at random usually gives (every shot is treated as independent, which flatters it).";
  return {
    enough: true, chance,
    makes: { n: mk.length, medianAbs: a }, misses: { n: ms.length, medianAbs: b },
    sentence: `Makes crossed the rim's height a typical ${a.toFixed(1)} ball widths from its centre; misses ${b.toFixed(1)} (from ${mk.length} makes and ${ms.length} misses). ${verdict} Misses are mostly balls that were not over the rim, so some gap is expected; it says where the ball was seen, not why or how it was shot.`,
  };
}

export const coverageSentence = (total: number, withPath: number, clear: number): string =>
  total === 0 ? "No shots." : withPath === 0 ? `${total} shot${total === 1 ? "" : "s"}, none with a saved path.` : `${total} shot${total === 1 ? "" : "s"}: ${withPath} with a path, ${clear} clear.`;

/** Words an ordinary person should never meet on a review or history screen. Used by the tests. */
/** The wording of a pattern statement (written for the tests, in consistency.ts) in everyday words. */
export function plainStatement(text: string): string {
  return text
    .replace(/in framing \d+( \(\d+ sessions?\))?/gi, (m) => (/^In/.test(m) ? "In this camera setup" : "in this camera setup"))
    .replace(/framing \d+( \(\d+ sessions?\))?/gi, "this camera setup")
    .replace(/image-horizontal/gi, "sideways in the picture")
    .replace(/Sessions are grouped when the camera showed the hoop the same size and in the same place\./, "Sets are grouped when the camera showed the hoop the same size and in the same place.");
}

export const JARGON = /framing|image-horizontal|fingerprint|image-space|detector|detection|reconstruct|ambiguous|hardware|\bscore\b|\bbw\b|p-value|holm|framing group|schema|\brecord\b|\btrail\b|pixel|\bpx\b|uncertain/i;
