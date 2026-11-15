/** Runs one of our plays against one defense many times and boils the runs down to what a coach needs: how good a look does this create, how often is it picked off, and why. */
import { distance, type Point } from "@/lib/plays/geometry";
import { DEFENDED_HOOP, type DefenseId, type Frame, type OffenseId } from "@/lib/plays/types";
import type { DefenseModel } from "./defense-model";
import { buildTimeline, DT, type Timeline } from "./timeline";

export type SimMode = "half" | "press";
export type Rating = "good" | "mixed" | "poor";
export type Reason = { tone: "bad" | "good" | "note"; text: string; tick?: number; defender?: DefenseId };

export type ReplayData = {
  dt: number;
  ticks: { o: Point[]; x: Point[]; ball: Point; holder: OffenseId | null }[];
  /** The tick of each coaching point, for jumping the replay to it. */
  moments: { tick: number; label: string }[];
};

export type MatchupSummary = {
  ppp: number;
  score: number;
  rating: Rating;
  pTurnover: number;
  pTrap: number;
  /** Share of runs that end in a shot with nobody within 6 ft. */
  pOpenLook: number;
  /** Share of runs where the ball crosses half court (press only). */
  pAdvance: number;
  shot: { who: OffenseId; where: string; eps: number; distance: number };
  /** 0-1: how much of the play happens in spots the defense diagram actually shows. */
  confidence: number;
  reasons: Reason[];
};

export type MatchupResult = { summary: MatchupSummary; replay: ReplayData };

const OPEN_FT = 6;
const OK_FT = 4;
const CONTESTED_FT = 2.5;
const TRAP_FT = 5.5;
const TRAP_TICKS = 5;
const SCREEN_FT = 2.4;
const TURNOVER_VALUE = -0.1;

function fnv(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clampPt = (p: Point): Point => ({ x: Math.max(-3, Math.min(53, p.x)), y: Math.max(-5, Math.min(89, p.y)) });

function openness(nd: number): "open" | "ok" | "contested" | "smothered" {
  return nd >= OPEN_FT ? "open" : nd >= OK_FT ? "ok" : nd >= CONTESTED_FT ? "contested" : "smothered";
}

type ShotKind = "rim" | "paint" | "jumper" | "none";

/** A defender in your face costs a jump shot far more than a layup, so the penalty depends on the kind of shot. */
function shotMult(kind: ShotKind, nd: number): number {
  if (kind === "rim") return nd >= 4 ? 1.1 : nd >= 2 ? 0.95 : 0.8;
  if (kind === "paint") return nd >= 5 ? 1.1 : nd >= 2.5 ? 0.95 : 0.75;
  if (kind === "jumper") return nd >= OPEN_FT ? 1.2 : nd >= OK_FT ? 1 : nd >= CONTESTED_FT ? 0.8 : 0.55;
  return 1;
}

function shotBase(p: Point): { base: number; where: string; dist: number; kind: ShotKind } {
  const dist = distance(p, DEFENDED_HOOP);
  const side = p.x < 25 ? "left" : "right";
  if (p.y > 40) return { base: 0.5, where: "no shot — the play ends before the frontcourt", dist, kind: "none" };
  if (dist < 4.5) return { base: 1.15, where: "shot at the rim", dist, kind: "rim" };
  if (Math.abs(p.x - 25) <= 6 && p.y < 19) return { base: 0.85, where: "paint shot", dist, kind: "paint" };
  if (dist >= 19.75) {
    if (p.y < 14 && Math.abs(p.x - 25) >= 18) return { base: 1.0, where: `${side} corner three`, dist, kind: "jumper" };
    const zone = Math.abs(p.x - 25) < 7 ? "top-of-the-key" : `${side}-wing`;
    return { base: 0.95, where: `${zone} three`, dist, kind: "jumper" };
  }
  if (dist > 28) return { base: 0.5, where: "heave from deep", dist, kind: "none" };
  return { base: 0.75, where: `${side} mid-range jumper`, dist, kind: "jumper" };
}

type Run = {
  tracks: Point[][];
  disrupted: { pass: number; tick: number; defender: number; converted: boolean }[];
  traps: { tick: number; converted: boolean }[];
  screens: { tick: number; defender: number; screener: OffenseId }[];
  catchND: { nd: number; defender: number }[];
  shotND: number;
  shotDefender: number;
  eps: number;
  turnoverTick: number | null;
  advanced: boolean;
  value: number;
};

function simulateRun(tl: Timeline, anchors: Point[][], model: DefenseModel, mode: SimMode, rand: () => number): Run {
  const T = tl.ticks.length;
  const lag = Array.from({ length: 5 }, () => Math.round((0.2 + 0.3 * rand()) / DT));
  const vmax = Array.from({ length: 5 }, () => 10 + 3.5 * rand());
  const gain = 3.5 + 1.5 * rand();
  const reach = Array.from({ length: 5 }, () => 1.1 + 0.7 * rand());
  const offset = Array.from({ length: 5 }, () => ({ x: (rand() - 0.5) * 1.4, y: (rand() - 0.5) * 1.4 }));
  const screenedUntil = [0, 0, 0, 0, 0];
  const lastScreen = [-99, -99, -99, -99, -99];

  const pos = anchors[0].map((a, j) => clampPt({ x: a.x + offset[j].x, y: a.y + offset[j].y }));
  const tracks: Point[][] = pos.map(() => []);
  const disrupted: Run["disrupted"] = [];
  const traps: Run["traps"] = [];
  const screens: Run["screens"] = [];
  const passDone = new Set<number>();
  let trapRun = 0;
  let trapped = false;

  for (let k = 0; k < T; k++) {
    const tick = tl.ticks[k];
    for (let j = 0; j < 5; j++) {
      tracks[j].push({ ...pos[j] });
      const goal = anchors[Math.max(0, k - lag[j])][j];
      const target = { x: goal.x + offset[j].x, y: goal.y + offset[j].y };
      const dx = target.x - pos[j].x;
      const dy = target.y - pos[j].y;
      const dist = Math.hypot(dx, dy);
      const cap = vmax[j] * (k < screenedUntil[j] ? 0.3 : 1);
      const speed = Math.min(cap, gain * dist);
      if (dist > 1e-6) pos[j] = clampPt({ x: pos[j].x + (dx / dist) * speed * DT, y: pos[j].y + (dy / dist) * speed * DT });

      if (k >= lastScreen[j] + 8) {
        for (const s of tick.screeners) {
          if (s === (`O${j + 1}` as OffenseId)) continue;
          if (distance(pos[j], tick.offense[s]) < SCREEN_FT) {
            screenedUntil[j] = k + 6;
            lastScreen[j] = k;
            screens.push({ tick: k, defender: j, screener: s });
            break;
          }
        }
      }
    }

    if (tick.flight !== null && tick.flight >= 0.12 && tick.flight <= 0.88) {
      const pi = tl.passes.findIndex((p) => k >= p.startTick && k < p.endTick);
      if (pi >= 0 && !passDone.has(pi)) {
        const pass = tl.passes[pi];
        const passer = tick.offense[pass.from];
        const catcher = tick.offense[pass.to];
        if (distance(tick.ball, passer) >= 3 && distance(tick.ball, catcher) >= 5) {
          for (let j = 0; j < 5; j++) {
            if (distance(pos[j], tick.ball) <= reach[j]) {
              passDone.add(pi);
              disrupted.push({ pass: pi, tick: k, defender: j, converted: rand() < 0.4 });
              break;
            }
          }
        }
      }
    }

    if (model.canTrap && tick.holder && tick.ball.y >= 0.5) {
      const near = pos.filter((p) => distance(p, tick.ball) <= TRAP_FT).length;
      trapRun = near >= 2 ? trapRun + 1 : 0;
      if (trapRun === TRAP_TICKS && !trapped) {
        trapped = true;
        traps.push({ tick: k, converted: rand() < (mode === "press" ? 0.3 : 0.22) });
      }
      if (near < 2) trapped = false;
    } else {
      trapRun = 0;
    }
  }

  const nearest = (k: number, p: Point) => {
    let best = Infinity;
    let who = 0;
    for (let j = 0; j < 5; j++) {
      const d = distance(tracks[j][k], p);
      if (d < best) {
        best = d;
        who = j;
      }
    }
    return { nd: best, defender: who };
  };

  const catchND = tl.catches.map((c) => {
    const k = Math.min(T - 1, c.tick + 2);
    return nearest(k, tl.ticks[k].offense[c.player]);
  });

  const shooterPos = tl.ticks[tl.shotTick].offense[tl.shooter];
  const shotNear = nearest(tl.shotTick, shooterPos);
  const loc = shotBase(shooterPos);
  const eps = loc.base * shotMult(loc.kind, shotNear.nd);

  const turnovers = [...disrupted.filter((d) => d.converted).map((d) => d.tick), ...traps.filter((t) => t.converted).map((t) => t.tick)];
  const turnoverTick = turnovers.length ? Math.min(...turnovers) : null;

  const finalBall = tl.ticks[T - 1].ball;
  const advanced = finalBall.y <= 44;
  let value: number;
  if (turnoverTick !== null) value = TURNOVER_VALUE;
  else if (mode === "press") {
    const o = openness(shotNear.nd);
    value = advanced ? 0.9 + (o === "open" ? 0.2 : o === "ok" ? 0.05 : o === "contested" ? -0.1 : -0.2) : 0.5;
  } else value = eps;

  return { tracks, disrupted, traps, screens, catchND, shotND: shotNear.nd, shotDefender: shotNear.defender, eps, turnoverTick, advanced, value };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const r1 = (x: number) => Math.round(x * 10) / 10;
const xName = (j: number) => `X${j + 1}`;
const mostCommon = (xs: number[]) => {
  const counts = new Map<number, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
};

export function ratingFor(ppp: number): Rating {
  return ppp >= 0.85 ? "good" : ppp >= 0.6 ? "mixed" : "poor";
}
export const scoreFor = (ppp: number) => Math.max(0, Math.min(100, Math.round(((ppp - 0.1) / 1.1) * 100)));

export function simulateMatchup(frames: Frame[], model: DefenseModel, mode: SimMode, seedKey: string, runs = 40): MatchupResult {
  const tl = buildTimeline(frames);
  const anchors = tl.ticks.map((t) => model.anchors(t.ball, t.offense, t.holder));
  const rand = mulberry32(fnv(seedKey));
  const all: Run[] = Array.from({ length: runs }, () => simulateRun(tl, anchors, model, mode, rand));

  const ppp = mean(all.map((r) => r.value));
  const sorted = [...all].sort((a, b) => a.value - b.value);
  const rep = sorted[Math.floor(sorted.length / 2)];
  const pTurnover = mean(all.map((r) => (r.turnoverTick !== null ? 1 : 0)));
  const pTrap = mean(all.map((r) => (r.traps.length ? 1 : 0)));
  const pOpenLook = mean(all.map((r) => (r.shotND >= OPEN_FT ? 1 : 0)));
  const pAdvance = mean(all.map((r) => (r.advanced ? 1 : 0)));
  const shotLoc = shotBase(tl.ticks[tl.shotTick].offense[tl.shooter]);
  const confidence = mean(tl.ticks.map((t) => (model.distanceToExample(t.ball) <= 15 ? 1 : 0)));

  const reasons: Reason[] = [];

  tl.passes.forEach((p, pi) => {
    const hits = all.flatMap((r) => r.disrupted.filter((d) => d.pass === pi));
    const rate = hits.length / runs;
    if (rate >= 0.3) {
      const j = mostCommon(hits.map((h) => h.defender));
      reasons.push({
        tone: "bad",
        text: `Step ${p.step}: the ${p.from} to ${p.to} pass gets a hand on it in ${pct(rate)} of runs. ${xName(j)} gets into the lane.`,
        tick: p.startTick,
        defender: xName(j) as DefenseId,
      });
    }
  });

  if (model.canTrap && pTrap >= 0.25) {
    const first = all.flatMap((r) => r.traps.map((t) => t.tick)).sort((a, b) => a - b);
    const tick = first[Math.floor(first.length / 2)];
    const holder = tl.ticks[tick].holder;
    reasons.push({ tone: "bad", text: `Step ${tl.ticks[tick].step}: they double ${holder ?? "the ball"} in ${pct(pTrap)} of runs. Get the ball out of the trap before it closes.`, tick });
  }

  tl.catches.forEach((c, ci) => {
    const nds = all.map((r) => r.catchND[ci].nd);
    const avg = mean(nds);
    const j = mostCommon(all.map((r) => r.catchND[ci].defender));
    if (avg < CONTESTED_FT) {
      reasons.push({ tone: "bad", text: `Step ${c.step}: ${c.player} catches it with ${xName(j)} right on him (about ${r1(avg)} ft away).`, tick: c.tick, defender: xName(j) as DefenseId });
    } else if (avg >= OPEN_FT) {
      reasons.push({ tone: "good", text: `Step ${c.step}: ${c.player} catches it open, ${r1(avg)} ft from the nearest defender.`, tick: c.tick });
    }
  });

  if (mode === "half") {
    const avgND = mean(all.map((r) => r.shotND));
    const j = mostCommon(all.map((r) => r.shotDefender));
    const tone = avgND >= OPEN_FT ? "good" : avgND < OK_FT ? "bad" : "note";
    reasons.push({
      tone,
      text: `Ends with ${tl.shooter} on a ${shotLoc.where}; ${xName(j)} is ${r1(avgND)} ft away on average, worth about ${Math.round(mean(all.map((r) => r.eps)) * 100) / 100} points a shot.`,
      tick: tl.shotTick,
      defender: xName(j) as DefenseId,
    });
  } else {
    reasons.push({
      tone: pAdvance >= 0.7 ? "good" : "bad",
      text: `The ball crosses half court in ${pct(pAdvance)} of runs and survives the press in ${pct(1 - pTurnover)}.`,
      tick: tl.shotTick,
    });
  }

  const screenGroups = new Map<string, { runs: Set<number>; ticks: number[] }>();
  all.forEach((r, ri) => {
    for (const s of r.screens) {
      const key = `${s.defender}|${s.screener}`;
      const g = screenGroups.get(key) ?? { runs: new Set<number>(), ticks: [] };
      g.runs.add(ri);
      g.ticks.push(s.tick);
      screenGroups.set(key, g);
    }
  });
  const topScreen = [...screenGroups.entries()].sort((a, b) => b[1].runs.size - a[1].runs.size)[0];
  if (topScreen && topScreen[1].runs.size / runs >= 0.5) {
    const [j, who] = topScreen[0].split("|");
    const ticks = topScreen[1].ticks.sort((a, b) => a - b);
    const tick = ticks[Math.floor(ticks.length / 2)];
    reasons.push({ tone: "good", text: `Step ${tl.ticks[tick].step}: ${who}'s screen holds up ${xName(Number(j))} in ${pct(topScreen[1].runs.size / runs)} of runs.`, tick, defender: xName(Number(j)) as DefenseId });
  }

  if (confidence < 0.7) {
    reasons.push({ tone: "note", text: `Rougher read: for ${pct(1 - confidence)} of this play the ball is far from anywhere their diagram shows. Open the diagram and add that spot to firm this up.` });
  }

  reasons.sort((a, b) => (a.tone === b.tone ? (a.tick ?? 0) - (b.tick ?? 0) : a.tone === "bad" ? -1 : b.tone === "bad" ? 1 : a.tone === "good" ? -1 : 1));

  const replay: ReplayData = {
    dt: DT,
    ticks: tl.ticks.map((t, k) => ({
      o: (["O1", "O2", "O3", "O4", "O5"] as OffenseId[]).map((id) => ({ x: r1(t.offense[id].x), y: r1(t.offense[id].y) })),
      x: rep.tracks.map((tr) => ({ x: r1(tr[k].x), y: r1(tr[k].y) })),
      ball: { x: r1(t.ball.x), y: r1(t.ball.y) },
      holder: t.holder,
    })),
    moments: reasons.filter((r) => r.tick !== undefined).map((r) => ({ tick: r.tick as number, label: r.text })),
  };

  return {
    summary: {
      ppp: Math.round(ppp * 100) / 100,
      score: scoreFor(ppp),
      rating: ratingFor(ppp),
      pTurnover,
      pTrap,
      pOpenLook,
      pAdvance,
      shot: { who: tl.shooter, where: shotLoc.where, eps: shotLoc.base, distance: shotLoc.dist },
      confidence,
      reasons,
    },
    replay,
  };
}
