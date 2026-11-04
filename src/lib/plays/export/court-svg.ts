/**
 * Dependency-free port of src/components/plays/play-court.tsx's SVG markup — same constants, same
 * math, just built as plain strings/DOM instead of React, so it can run standalone in the exported
 * HTML file with no framework. Keep in sync with play-court.tsx if the court markings ever change.
 */
import { smoothPath, trimEnd, unit, sub, zigzagAlongPath, type Point } from "../geometry";
import { COURT_LENGTH, COURT_WIDTH, DEFENDED_HOOP, type DrawnLine, type Frame } from "../types";
import type { Region } from "../bounds";
import type { ResolvedDefender } from "../resolve";

export const MARGIN = 4;
export const PLAYER_R = 1.7;
export const BALL_R = 1.1;
const REGION_PAD = 5;
const LANE_HALF = 6;
const LANE_LEN = 19;
const FT_RADIUS = 6;
const THREE_PT_R = 19.75;
const ARROW_TRIM = 2;
const SCREEN_TRIM = 1.7;

const LINE_COLOR_HEX: Record<DrawnLine["color"], string> = { offense: "#dc2626", defense: "#1e3a8a", black: "#111827" };
export const OFFENSE_FILL = "#dc2626";
export const DEFENSE_FILL = "#17306b";
export const DEFENSE_NUMBER = "#F2B705";
export const BALL_FILL = "#f97316";

const r3 = (n: number) => Math.round(n * 1000) / 1000;

function courtMarkingsSvg(): string {
  const topHoop = DEFENDED_HOOP;
  const botHoop: Point = { x: 25, y: COURT_LENGTH - topHoop.y };
  const baselineY = (flip: 1 | -1) => (flip === 1 ? 0 : COURT_LENGTH);

  const key = (flip: 1 | -1) => {
    const b = baselineY(flip);
    return `M ${25 - LANE_HALF} ${b} V ${b + flip * LANE_LEN} H ${25 + LANE_HALF} V ${b}`;
  };

  const threePt = (hoop: Point, flip: 1 | -1) => {
    const b = baselineY(flip);
    const x1 = hoop.x - THREE_PT_R;
    const x2 = hoop.x + THREE_PT_R;
    const N = 32;
    let d = `M ${x1} ${b} L ${x1} ${hoop.y}`;
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      const a = Math.PI * (1 - flip * t);
      d += ` L ${r3(hoop.x + THREE_PT_R * Math.cos(a))} ${r3(hoop.y + THREE_PT_R * Math.sin(a))}`;
    }
    return `${d} L ${x2} ${b}`;
  };

  const hoopGlyph = (hoop: Point, flip: 1 | -1) => `
    <line x1="22" y1="${hoop.y - flip * 1.25}" x2="28" y2="${hoop.y - flip * 1.25}" stroke="#f4f1ea" stroke-width="0.35" />
    <circle cx="${hoop.x}" cy="${hoop.y}" r="0.95" fill="none" stroke="#e8580c" stroke-width="0.35" />
  `;

  return `
    <rect x="0" y="0" width="${COURT_WIDTH}" height="${COURT_LENGTH}" fill="#8a5a34" />
    <g stroke="#f4f1ea" stroke-width="0.25" fill="none" opacity="0.85">
      <rect x="0" y="0" width="${COURT_WIDTH}" height="${COURT_LENGTH}" />
      <line x1="0" y1="${COURT_LENGTH / 2}" x2="${COURT_WIDTH}" y2="${COURT_LENGTH / 2}" />
      <circle cx="25" cy="${COURT_LENGTH / 2}" r="6" />
      <path d="${key(1)}" />
      <path d="${key(-1)}" />
      <circle cx="25" cy="${0 + LANE_LEN}" r="${FT_RADIUS}" />
      <circle cx="25" cy="${COURT_LENGTH - LANE_LEN}" r="${FT_RADIUS}" />
      <path d="${threePt(topHoop, 1)}" />
      <path d="${threePt(botHoop, -1)}" />
      ${hoopGlyph(topHoop, 1)}
      ${hoopGlyph(botHoop, -1)}
    </g>
  `;
}

function arrowDefsSvg(): string {
  return `
    <defs>
      ${(["offense", "defense", "black"] as const)
        .map(
          (c) => `
        <marker id="arrow-${c}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="${LINE_COLOR_HEX[c]}" />
        </marker>`
        )
        .join("")}
    </defs>
  `;
}

export function lineSvg(line: DrawnLine): string {
  const color = LINE_COLOR_HEX[line.color];
  const trimmed = trimEnd(line.points, line.type === "screen" ? SCREEN_TRIM : ARROW_TRIM);

  if (line.type === "dribble") {
    return `<path d="${zigzagAlongPath(trimmed)}" fill="none" stroke="${color}" stroke-width="0.35" stroke-linejoin="round" stroke-linecap="round" marker-end="url(#arrow-${line.color})" />`;
  }

  const d = smoothPath(trimmed);
  const dash = line.type === "pass" ? ' stroke-dasharray="1.4 1.1"' : "";
  const marker = line.type === "pass" || line.type === "cut" ? ` marker-end="url(#arrow-${line.color})"` : "";

  let screenCap = "";
  if (line.type === "screen") {
    const end = trimmed[trimmed.length - 1];
    const dir = unit(sub(end, trimmed[trimmed.length - 2] ?? trimmed[0]));
    const normal = { x: -dir.y, y: dir.x };
    const capLen = 1.6;
    const a = { x: end.x + normal.x * capLen, y: end.y + normal.y * capLen };
    const b = { x: end.x - normal.x * capLen, y: end.y - normal.y * capLen };
    screenCap = `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${color}" stroke-width="0.4" stroke-linecap="round" />`;
  }

  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="0.35"${dash} stroke-linecap="round"${marker} /> ${screenCap}`;
}

/**
 * Like bounds.ts's computeContentBounds, but never crops the x-axis — a half-court play can crop out
 * the empty top or bottom half (where nothing happens), but cropping the WIDTH too would make it look
 * like one side of the floor was arbitrarily chosen, even for a play whose action only occupies one
 * side horizontally (e.g. a BLOB stacked on a single block). Full sideline-to-sideline width, always;
 * only the vertical extent tightens to the content.
 */
export function computeExportRegion(frames: Frame[]): Region {
  let minY = Infinity;
  let maxY = -Infinity;
  const consider = (y: number) => {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };
  for (const f of frames) {
    for (const o of f.offense) consider(o.pos.y);
    for (const d of f.defense) if (d.manualPos) consider(d.manualPos.y);
    for (const l of f.lines) for (const p of l.points) consider(p.y);
    for (const path of Object.values(f.arrivals ?? {})) for (const p of path ?? []) consider(p.y);
    for (const p of f.ballArrival ?? []) consider(p.y);
  }
  if (!isFinite(minY)) {
    minY = -REGION_PAD;
    maxY = COURT_LENGTH + REGION_PAD;
  } else {
    minY = Math.max(-REGION_PAD, minY - REGION_PAD);
    maxY = Math.min(COURT_LENGTH + REGION_PAD, maxY + REGION_PAD);
  }
  return { x: -REGION_PAD, y: minY, width: COURT_WIDTH + REGION_PAD * 2, height: maxY - minY };
}

/** The static background layer (markings + arrow defs) for one play's court, scoped to `region`. */
export function courtBackgroundSvg(region: Region): string {
  return `
    <svg viewBox="${region.x} ${region.y} ${region.width} ${region.height}" class="hl-court" style="background:#6b4423">
      ${arrowDefsSvg()}
      ${courtMarkingsSvg()}
      <g class="hl-dynamic"></g>
    </svg>
  `;
}

function playerCircleSvg(id: string, pos: Point, fill: string, stroke: string, numberFill: string): string {
  const r = PLAYER_R;
  return `
    <g>
      <circle cx="${pos.x}" cy="${pos.y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="0.2" />
      <text x="${pos.x}" y="${pos.y}" text-anchor="middle" dominant-baseline="central" font-size="${r * 1.05}" font-weight="800" fill="${numberFill}">${id.slice(1)}</text>
    </g>
  `;
}

/** Lines, then offense, then defense, then the ball on top — same paint order as PlayCourt. Rebuilt wholesale each animation tick; cheap enough at this element count, and far simpler than hand-diffing. */
export function dynamicLayerSvg(frame: Frame, resolvedDefense: ResolvedDefender[], ballPos: Point): string {
  const lines = frame.lines.map(lineSvg).join("");
  const offense = frame.offense.map((o) => playerCircleSvg(o.id, o.pos, OFFENSE_FILL, "#450a0a", "#ffffff")).join("");
  const defense = resolvedDefense.map((d) => playerCircleSvg(d.id, d.pos, DEFENSE_FILL, "#0a1120", DEFENSE_NUMBER)).join("");
  const ball = `<circle cx="${ballPos.x}" cy="${ballPos.y}" r="${BALL_R}" fill="${BALL_FILL}" stroke="#7c2d12" stroke-width="0.15" />`;
  return lines + offense + defense + ball;
}
