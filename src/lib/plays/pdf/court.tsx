/**
 * Static, print-oriented port of src/components/plays/play-court.tsx's rendering (same approach as
 * src/lib/plays/export/court-svg.ts, which does this for the web export) — this time emitting
 * @react-pdf/renderer's own Svg primitives instead of HTML strings, for the PDF playbook. Same
 * geometry math throughout (trimEnd/smoothPath/zigzagAlongPath/resolveDefense, all reused unchanged
 * from geometry.ts/resolve.ts), so a line looks identical in shape whether it's live in the app, in
 * the web export, or printed here — only the per-player color legend differs (see colors.ts), since
 * a printed BLOB page rarely shows defense and the varsity team's own book colors by jersey number.
 */
import { Circle, Defs, G, Line, Marker, Path, Rect, Svg, Text } from "@react-pdf/renderer";
import { smoothPath, sub, trimEnd, unit, zigzagAlongPath, type Point } from "../geometry";
import { COURT_LENGTH, COURT_WIDTH, DEFENDED_HOOP, type DrawnLine, type Frame } from "../types";
import { resolveDefense, type ResolvedDefender } from "../resolve";
import type { Region } from "../bounds";
import { BALL_COLOR, DEFENSE_COLOR, DEFENSE_TEXT, playerColor } from "./colors";

const PLAYER_R = 1.7;
const BALL_R = 1.1;
const REGION_PAD = 5;
const LANE_HALF = 6;
const LANE_LEN = 19;
const FT_RADIUS = 6;
const THREE_PT_R = 19.75;
const ARROW_TRIM = 2;
const SCREEN_TRIM = 1.7;

const LINE_COLOR: Record<DrawnLine["color"], string> = { offense: "#111827", defense: "#111827", black: "#111827" };

/** Same rule as export/court-svg.ts's computeExportRegion — crop the vertical extent to the play's own content, but never the width, so a page never looks like one side of the floor was arbitrarily chosen. */
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

function CourtMarkings() {
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
      d += ` L ${(hoop.x + THREE_PT_R * Math.cos(a)).toFixed(3)} ${(hoop.y + THREE_PT_R * Math.sin(a)).toFixed(3)}`;
    }
    return `${d} L ${x2} ${b}`;
  };

  const hoopGlyph = (hoop: Point, flip: 1 | -1) => (
    <G key={`hoop-${flip}`}>
      <Line x1={22} y1={hoop.y - flip * 1.25} x2={28} y2={hoop.y - flip * 1.25} stroke="#4a3220" strokeWidth={0.35} />
      <Circle cx={hoop.x} cy={hoop.y} r={0.95} fill="none" stroke={BALL_COLOR} strokeWidth={0.35} />
    </G>
  );

  return (
    <G>
      <Rect x={0} y={0} width={COURT_WIDTH} height={COURT_LENGTH} fill="#e4ceae" />
      <G stroke="#4a3220" strokeWidth={0.22} fill="none" opacity={0.9}>
        <Rect x={0} y={0} width={COURT_WIDTH} height={COURT_LENGTH} />
        <Line x1={0} y1={COURT_LENGTH / 2} x2={COURT_WIDTH} y2={COURT_LENGTH / 2} />
        <Circle cx={25} cy={COURT_LENGTH / 2} r={6} />
        <Path d={key(1)} />
        <Path d={key(-1)} />
        <Circle cx={25} cy={0 + LANE_LEN} r={FT_RADIUS} />
        <Circle cx={25} cy={COURT_LENGTH - LANE_LEN} r={FT_RADIUS} />
        <Path d={threePt(topHoop, 1)} />
        <Path d={threePt(botHoop, -1)} />
      </G>
      {hoopGlyph(topHoop, 1)}
      {hoopGlyph(botHoop, -1)}
    </G>
  );
}

function ArrowMarkers() {
  return (
    <Defs>
      {(["offense", "defense", "black"] as const).map((c) => (
        <Marker key={c} id={`arrow-${c}`} viewBox="0 0 10 10" refX={8} refY={5} markerWidth={3.4} markerHeight={3.4} orient="auto-start-reverse">
          <Path d="M 0 0 L 10 5 L 0 10 z" fill={LINE_COLOR[c]} />
        </Marker>
      ))}
    </Defs>
  );
}

function LineShape({ line }: { line: DrawnLine }) {
  const color = LINE_COLOR[line.color];
  const trimmed = trimEnd(line.points, line.type === "screen" ? SCREEN_TRIM : ARROW_TRIM);

  if (line.type === "dribble") {
    return <Path d={zigzagAlongPath(trimmed)} fill="none" stroke={color} strokeWidth={0.4} strokeLinejoin="round" strokeLinecap="round" markerEnd={`url(#arrow-${line.color})`} />;
  }

  const d = smoothPath(trimmed);
  const dash = line.type === "pass" ? "1.6 1.3" : undefined;
  const marker = line.type === "pass" || line.type === "cut" ? `url(#arrow-${line.color})` : undefined;

  let screenCap = null;
  if (line.type === "screen") {
    const end = trimmed[trimmed.length - 1];
    const dir = unit(sub(end, trimmed[trimmed.length - 2] ?? trimmed[0]));
    const normal = { x: -dir.y, y: dir.x };
    const capLen = 1.7;
    const a = { x: end.x + normal.x * capLen, y: end.y + normal.y * capLen };
    const b = { x: end.x - normal.x * capLen, y: end.y - normal.y * capLen };
    screenCap = <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={0.5} strokeLinecap="round" />;
  }

  return (
    <G>
      <Path d={d} fill="none" stroke={color} strokeWidth={0.4} strokeDasharray={dash} strokeLinecap="round" markerEnd={marker} />
      {screenCap}
    </G>
  );
}

function PlayerToken({ id, pos, fill, numberFill }: { id: string; pos: Point; fill: string; numberFill: string }) {
  return (
    <G>
      <Circle cx={pos.x} cy={pos.y} r={PLAYER_R} fill={fill} stroke="#00000055" strokeWidth={0.15} />
      {/* react-pdf's SVGTextProps type omits fontSize/fontFamily even though the renderer does honor them via style at runtime — verified visually, see pdf/README notes in the export memory. */}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- react-pdf's SVGTextProps type omits fontSize/fontFamily even though the renderer honors them via style at runtime (verified visually) */}
      <Text x={pos.x} y={pos.y + PLAYER_R * 0.37} textAnchor="middle" fill={numberFill} style={{ fontFamily: "Helvetica-Bold", fontSize: PLAYER_R * 1.25 } as any}>
        {id.slice(1)}
      </Text>
    </G>
  );
}

/**
 * One static, printable court diagram for a single rest frame — lines, then offense, then defense,
 * then the ball on top, same paint order as the live app.
 *
 * `height` is a fixed point value, not just `width: "100%"` — without it, a full/near-full-court
 * play (a transition set, a press break) renders at a much taller box than a half-court play,
 * since its region spans most of COURT_LENGTH rather than just the ~30 units a half-court set
 * uses. An unconstrained height blows out that one row to fit the tall diagram, which is exactly
 * the kind of avoidable page-count/white-space cost this fixed height exists to prevent. SVG's
 * default `preserveAspectRatio` ("xMidYMid meet") scales the content down to fit within both
 * bounds without distorting it — a tall play just ends up pillarboxed (narrower, not stretched)
 * at the same row height every other play gets.
 */
export function PlayDiagram({ frame, region, height }: { frame: Frame; region: Region; height: number }) {
  const resolved: ResolvedDefender[] = resolveDefense(frame);
  const holderPos = frame.offense.find((o) => o.id === frame.ballHolder)?.pos ?? { x: 25, y: 25 };
  const ballPos = { x: holderPos.x + 1.7, y: holderPos.y + 1.7 };

  return (
    <Svg viewBox={`${region.x} ${region.y} ${region.width} ${region.height}`} style={{ width: "100%", height }}>
      <ArrowMarkers />
      <CourtMarkings />
      {frame.lines.map((line) => (
        <LineShape key={line.id} line={line} />
      ))}
      {frame.offense.map((o) => (
        <PlayerToken key={o.id} id={o.id} pos={o.pos} fill={playerColor(o.id)} numberFill="#ffffff" />
      ))}
      {resolved.map((d) => (
        <PlayerToken key={d.id} id={d.id} pos={d.pos} fill={DEFENSE_COLOR} numberFill={DEFENSE_TEXT} />
      ))}
      <Circle cx={ballPos.x} cy={ballPos.y} r={BALL_R} fill={BALL_COLOR} stroke="#00000055" strokeWidth={0.12} />
    </Svg>
  );
}
