/** A defense, reduced to the one thing the simulator needs: given where the ball and our five players are right now, where would each of their five defenders like to be? */
import { computeCoveragePosition, isBallSide } from "@/lib/plays/coverage";
import { add, clampDistanceTo, distance, scale, sub, unit, type Point } from "@/lib/plays/geometry";
import { resolveDefense } from "@/lib/plays/resolve";
import type { ScoutDiagram } from "@/lib/scouting/report";
import { DEFENDED_HOOP, DEFENSE_IDS, OFFENSE_IDS, type Frame, type OffenseId } from "@/lib/plays/types";
import type { OffenseAt } from "./timeline";

export type DefenseKind = "man" | "zone" | "press" | "blob";

const RIM_HELP_FT = 12;

/** When the ball gets into the paint, the nearest defenders (never the one already guarding it) step in to help — without this a drive or post catch would look open just because nobody drawn was standing there. */
function collapse(anchors: Point[], ball: Point, helpers: number, strength: number, exclude: number): Point[] {
  if (distance(ball, DEFENDED_HOOP) > RIM_HELP_FT) return anchors;
  const order = anchors
    .map((a, j) => ({ j, d: distance(a, ball) }))
    .filter((x) => x.j !== exclude)
    .sort((a, b) => a.d - b.d)
    .slice(0, helpers)
    .map((x) => x.j);
  return anchors.map((a, j) => (order.includes(j) ? { x: a.x + strength * (ball.x - a.x), y: a.y + strength * (ball.y - a.y) } : a));
}

export type DefenseModel = {
  id: string;
  label: string;
  kind: DefenseKind;
  /** Only a scouted trap defense (not our generic man baseline) is allowed to double the ball. */
  canTrap: boolean;
  /** Where each defender (X1..X5, in order) wants to be. */
  anchors: (ball: Point, offense: OffenseAt, holder: OffenseId | null) => Point[];
  /** How far this ball spot is from the nearest spot the diagram actually shows. Large means the model is extrapolating. */
  distanceToExample: (ball: Point) => number;
};

/**
 * Ordinary half-court man-to-man: stay in front of the ball, a step off the man one pass away, and
 * sit in a gap on the weak side. This is deliberately softer than the builder's own "Auto"
 * coverage, which denies every man within 15 ft and would pick off almost any pass.
 */
export const MAN_MODEL: DefenseModel = {
  id: "man",
  label: "Man-to-man (generic)",
  kind: "man",
  canTrap: false,
  anchors: (ball, offense, holder) => {
    const anchors = DEFENSE_IDS.map((_, i) => {
      const man = OFFENSE_IDS[i];
      if (holder === man || isBallSide(offense[man], ball)) {
        return computeCoveragePosition(holder === man ? "onBall" : "softDeny", offense[man], ball, DEFENDED_HOOP, holder === man);
      }
      // Weak side: a gap position between his man and the ball, shaded toward the hoop so a skip pass goes over him, not through him.
      const m = offense[man];
      const mid = { x: (m.x + ball.x) / 2, y: (m.y + ball.y) / 2 };
      return clampDistanceTo(m, add(mid, scale(unit(sub(DEFENDED_HOOP, mid)), 4)), 12);
    });
    return collapse(anchors, ball, 1, 0.5, holder ? DEFENSE_IDS.findIndex((_, i) => OFFENSE_IDS[i] === holder) : -1);
  },
  distanceToExample: () => 0,
};

type Sample = { ball: Point; defenders: Point[] };

const mirror = (p: Point): Point => ({ x: 50 - p.x, y: p.y });

const PERMUTATIONS: number[][] = (() => {
  const out: number[][] = [];
  const rec = (rest: number[], acc: number[]) => {
    if (!rest.length) out.push(acc);
    for (let i = 0; i < rest.length; i++) rec([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, rest[i]]);
  };
  rec([0, 1, 2, 3, 4], []);
  return out;
})();

/** The mirror image of a sample, with defender identities reassigned so each one stays as close as possible to where he really stands — X2 on the left wing becomes the right-wing defender, not a defender who runs across the floor. */
function mirrorSample(s: Sample): Sample {
  const flipped = s.defenders.map(mirror);
  let best = PERMUTATIONS[0];
  let bestCost = Infinity;
  for (const perm of PERMUTATIONS) {
    let cost = 0;
    for (let i = 0; i < 5; i++) cost += distance(s.defenders[i], flipped[perm[i]]);
    if (cost < bestCost) {
      bestCost = cost;
      best = perm;
    }
  }
  return { ball: mirror(s.ball), defenders: best.map((j) => flipped[j]) };
}

function sampleOf(frame: Frame): Sample | null {
  if (frame.defense.length !== 5) return null;
  const holder = frame.offense.find((o) => o.id === frame.ballHolder);
  if (!holder) return null;
  const resolved = resolveDefense(frame);
  const byId = new Map(resolved.map((r) => [r.id, r.pos]));
  const defenders = DEFENSE_IDS.map((id) => byId.get(id));
  if (defenders.some((d) => !d)) return null;
  return { ball: { ...holder.pos }, defenders: defenders as Point[] };
}

/** Does this drawn diagram give us enough to build a defense from — five defenders, in at least one frame? */
export function isUsableDefenseDiagram(d: ScoutDiagram): boolean {
  return d.frames.some((f) => sampleOf(f) !== null);
}

/** How hard the defense leans toward the ball as it moves beyond the spots that were actually drawn. */
const BALL_SHADE: Record<Exclude<DefenseKind, "man">, number> = { zone: 0.25, press: 0.5, blob: 0.2 };
/** How far a defender steps toward the nearest offensive player standing in his area. */
const AREA_PULL = 0.42;
const AREA_RADIUS = 7;

/**
 * Builds a reactive defense from a drawn scouting diagram. Each frame of the diagram is a snapshot
 * of "ball here → defenders here"; the model blends those snapshots (and their mirror images, since
 * a defense plays the other side the same way) by how close the real ball is to each, leans the
 * whole shell toward the ball past what was drawn, and has each defender close on an offensive
 * player standing in his area. It is an estimate of the shape — good for "where are the holes and
 * where does the trap come from", not a promise about any one possession.
 */
export function scoutedModel(diagram: ScoutDiagram, kind: Exclude<DefenseKind, "man">): DefenseModel {
  const base = diagram.frames.map(sampleOf).filter((s): s is Sample => s !== null);
  const samples = [...base, ...base.map(mirrorSample)];
  const shade = BALL_SHADE[kind];
  const meanBall = (w: number[], total: number): Point => ({
    x: samples.reduce((a, s, i) => a + w[i] * s.ball.x, 0) / total,
    y: samples.reduce((a, s, i) => a + w[i] * s.ball.y, 0) / total,
  });

  return {
    id: diagram.id,
    label: diagram.title,
    kind,
    canTrap: true,
    distanceToExample: (ball) => Math.min(...samples.map((s) => distance(s.ball, ball))),
    anchors: (ball, offense) => {
      const w = samples.map((s) => 1 / (distance(s.ball, ball) ** 2 + 4));
      const total = w.reduce((a, b) => a + b, 0);
      const ref = meanBall(w, total);
      const lean = { x: shade * (ball.x - ref.x), y: shade * (ball.y - ref.y) };
      const anchors = DEFENSE_IDS.map((_, d) => ({
        x: samples.reduce((a, s, i) => a + w[i] * s.defenders[d].x, 0) / total + lean.x,
        y: samples.reduce((a, s, i) => a + w[i] * s.defenders[d].y, 0) / total + lean.y,
      }));

      // Each offensive player standing inside a defender's area is picked up by the nearest defender.
      const pulled = anchors.map((a) => ({ ...a }));
      const claimed = new Set<number>();
      for (const id of OFFENSE_IDS) {
        const p = offense[id];
        let best = -1;
        let bestD = AREA_RADIUS;
        anchors.forEach((a, d) => {
          const dist = distance(a, p);
          if (dist < bestD) {
            bestD = dist;
            best = d;
          }
        });
        if (best >= 0 && !claimed.has(best)) {
          claimed.add(best);
          pulled[best] = { x: anchors[best].x + AREA_PULL * (p.x - anchors[best].x), y: anchors[best].y + AREA_PULL * (p.y - anchors[best].y) };
        }
      }
      return collapse(pulled, ball, 2, 0.6, -1);
    },
  };
}
