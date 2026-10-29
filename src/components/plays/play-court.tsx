"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Region } from "@/lib/plays/bounds";
import { distance, length, maxDeviationFromChord, smoothPath, sub, trimEnd, unit, zigzagAlongPath, type Point } from "@/lib/plays/geometry";
import { resolveDefense } from "@/lib/plays/resolve";
import { COURT_LENGTH, COURT_WIDTH, DEFENDED_HOOP, type DefenseId, type DrawnLine, type Frame, type LineColor, type LineType, type OffenseId } from "@/lib/plays/types";

export type Tool = "move" | "pass" | "cut" | "dribble" | "screen" | "erase";

const LINE_COLOR_HEX = { offense: "#dc2626", defense: "#1e3a8a", black: "#111827" } as const;
const OFFENSE_FILL = "#dc2626";
const DEFENSE_FILL = "#17306b";
const DEFENSE_NUMBER = "#F2B705";
const BALL_FILL = "#f97316";

/** Breathing room around the painted court — an inbounder stands a little behind the baseline, out of bounds. */
const MARGIN = 4;
const PLAYER_R = 1.7;
const HIT_R = 3.4;
/** How close a line's start point must be to a player for the line to inherit his color and snap onto him — much tighter than HIT_R (which is for forgiving grabs in Move). A wide net here is exactly what caused a line meant for an offensive player to ink in as the defender standing tight on him instead; this makes "which player did I actually touch" unambiguous rather than "which player happens to be nearest." */
const DRAW_START_HIT_R = PLAYER_R + 0.5;
/** How close a touch must land to a selected line's own endpoint handle to grab it. */
const HANDLE_HIT_R = PLAYER_R + 0.6;
const BALL_R = 1.1;
/** How far a token lifts above the fingertip while dragging, in court feet — fixed rather than derived from the live px-per-foot scale, so it's readable from render without touching a ref. */
const LIFT_FEET = 3.4;
const TAP_SLOP = 0.6; // feet of finger movement that still counts as a tap, not a drag
const STRAIGHT_TOLERANCE = 1.3; // feet a sampled drag can wander off its own chord and still count as "meant to be straight"

function clientToCourt(svg: SVGSVGElement, clientX: number, clientY: number): Point {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: COURT_WIDTH / 2, y: COURT_LENGTH / 2 };
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

function pxPerFoot(svg: SVGSVGElement): number {
  return svg.getScreenCTM()?.a || 8;
}

/** A pointer that ended (or was never real, e.g. a test harness) just before capture is requested throws — losing capture only means a drag won't survive the finger leaving the court bounds. */
function tryCapture(svg: SVGSVGElement, pointerId: number, release: boolean) {
  try {
    if (release) svg.releasePointerCapture(pointerId);
    else svg.setPointerCapture(pointerId);
  } catch {
    // Not fatal — see above.
  }
}

// NFHS (high school) court markings, verified against the current rule book: 12 ft lane, 19 ft lane
// length (baseline to free-throw line), 6 ft free-throw/center circle radius, a true-circle 19'9"
// three-point arc (see threePt() below for why the corner isn't a separately-chosen inset).
const LANE_HALF = 6;
const LANE_LEN = 19;
const FT_RADIUS = 6;
const THREE_PT_R = 19.75;

/** Math.cos/sin are not guaranteed bit-identical between Node (SSR) and the browser (CSR) — rounding before it reaches a path string keeps the two renders byte-for-byte equal, avoiding a hydration mismatch. */
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function CourtMarkings() {
  const topHoop = DEFENDED_HOOP;
  const botHoop: Point = { x: 25, y: COURT_LENGTH - topHoop.y };
  const baselineY = (flip: 1 | -1) => (flip === 1 ? 0 : COURT_LENGTH);

  const key = (flip: 1 | -1) => {
    const b = baselineY(flip);
    return `M ${25 - LANE_HALF} ${b} V ${b + flip * LANE_LEN} H ${25 + LANE_HALF} V ${b}`;
  };

  // The 3pt line is a true circle of radius R centred on the hoop — not a corner inset chosen
  // separately from the radius. Its leftmost/rightmost points (where the straight corner run takes
  // over) sit exactly R ft out from the centerline, which is always level with the hoop itself (the
  // same y, since those are the circle's horizontal extremes) — e.g. at R = 19'9" that is 25 - 19.75 =
  // 5.25 ft (63 in) off the sideline, exactly matching a real court diagram's own corner measurement,
  // not a fixed "3 ft inset" guess. The straight run is just that point's own x, from the baseline up
  // to the hoop's y — tangent to the circle there, so the curve meets it with no kink.
  //
  // The curved part is sampled directly from the circle's own parametric equation (angle(t) =
  // pi*(1 - flip*t) goes from the left corner at 180 deg, through the belly at 90*flip deg, to the
  // right corner at 0 deg — verified numerically before writing this) rather than approximated with a
  // 3-point spline: a Catmull-Rom curve through just the two corners and the belly cuts drastically
  // inside the real circle everywhere between those three points (measured over 5 ft short of true at
  // the deepest part of an earlier version of this arc) — nowhere close to round.
  const threePt = (hoop: Point, flip: 1 | -1) => {
    const b = baselineY(flip);
    const x1 = hoop.x - THREE_PT_R, x2 = hoop.x + THREE_PT_R;
    const N = 32;
    let d = `M ${x1} ${b} L ${x1} ${hoop.y}`;
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      const a = Math.PI * (1 - flip * t);
      d += ` L ${r3(hoop.x + THREE_PT_R * Math.cos(a))} ${r3(hoop.y + THREE_PT_R * Math.sin(a))}`;
    }
    return `${d} L ${x2} ${b}`;
  };

  const hoopGlyph = (hoop: Point, flip: 1 | -1) => (
    <g>
      <line x1={22} y1={hoop.y - flip * 1.25} x2={28} y2={hoop.y - flip * 1.25} stroke="#f4f1ea" strokeWidth={0.35} />
      <circle cx={hoop.x} cy={hoop.y} r={0.95} fill="none" stroke="#e8580c" strokeWidth={0.35} />
    </g>
  );

  return (
    <g>
      <rect x={0} y={0} width={COURT_WIDTH} height={COURT_LENGTH} fill="#8a5a34" />
      <g stroke="#f4f1ea" strokeWidth={0.25} fill="none" opacity={0.85}>
        <rect x={0} y={0} width={COURT_WIDTH} height={COURT_LENGTH} />
        <line x1={0} y1={COURT_LENGTH / 2} x2={COURT_WIDTH} y2={COURT_LENGTH / 2} />
        <circle cx={25} cy={COURT_LENGTH / 2} r={6} />
        <path d={key(1)} />
        <path d={key(-1)} />
        <circle cx={25} cy={0 + LANE_LEN} r={FT_RADIUS} />
        <circle cx={25} cy={COURT_LENGTH - LANE_LEN} r={FT_RADIUS} />
        <path d={threePt(topHoop, 1)} />
        <path d={threePt(botHoop, -1)} />
        {hoopGlyph(topHoop, 1)}
        {hoopGlyph(botHoop, -1)}
      </g>
    </g>
  );
}

function ArrowDefs() {
  return (
    <defs>
      {(["offense", "defense", "black"] as const).map((c) => (
        <marker key={c} id={`arrow-${c}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={LINE_COLOR_HEX[c]} />
        </marker>
      ))}
    </defs>
  );
}

// A line's own endpoint sits exactly on the player token it points at, but that token paints over
// the line layer — an arrowhead placed right at the destination is really there, just invisible
// under an opaque circle. Trimming the path back first is what makes the arrow (or the screen's
// T-bar) actually show up next to the token instead of vanishing underneath it.
const ARROW_TRIM = 2;
const SCREEN_TRIM = 1.7;

function LinePath({ line, selected }: { line: DrawnLine; selected?: boolean }) {
  const color = LINE_COLOR_HEX[line.color];
  const trimmed = trimEnd(line.points, line.type === "screen" ? SCREEN_TRIM : ARROW_TRIM);
  const start = trimmed[0];
  const end = trimmed[trimmed.length - 1];

  const halo = selected ? (
    <path d={line.type === "dribble" ? zigzagAlongPath(trimmed) : smoothPath(trimmed)} fill="none" stroke="#f2560a" strokeWidth={1.1} strokeLinecap="round" opacity={0.35} />
  ) : null;

  if (line.type === "dribble") {
    return (
      <g>
        {halo}
        <path d={zigzagAlongPath(trimmed)} fill="none" stroke={color} strokeWidth={0.35} strokeLinejoin="round" strokeLinecap="round" markerEnd={`url(#arrow-${line.color})`} />
      </g>
    );
  }

  const d = smoothPath(trimmed);
  const dash = line.type === "pass" ? "1.4 1.1" : undefined;
  const marker = line.type === "pass" || line.type === "cut" ? `url(#arrow-${line.color})` : undefined;

  let screenCap: React.ReactNode = null;
  if (line.type === "screen") {
    const dir = unit(sub(end, trimmed[trimmed.length - 2] ?? start));
    const normal = { x: -dir.y, y: dir.x };
    const capLen = 1.6;
    const a = { x: end.x + normal.x * capLen, y: end.y + normal.y * capLen };
    const b = { x: end.x - normal.x * capLen, y: end.y - normal.y * capLen };
    screenCap = <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={0.4} strokeLinecap="round" />;
  }

  return (
    <g>
      {halo}
      <path d={d} fill="none" stroke={color} strokeWidth={0.35} strokeDasharray={dash} strokeLinecap="round" markerEnd={marker} />
      {screenCap}
    </g>
  );
}

/** A small, generously-tappable handle at one end of the selected line — the untrimmed raw point, not the arrow's visually-trimmed tip, since dragging operates on the real stored data. */
function LineHandle({ point, color }: { point: Point; color: string }) {
  return (
    <g>
      <circle cx={point.x} cy={point.y} r={1.1} fill="#fff" stroke={color} strokeWidth={0.5} />
      <circle cx={point.x} cy={point.y} r={0.35} fill={color} />
    </g>
  );
}

export function PlayCourt({
  frame,
  tool,
  dragging,
  onTapPlayer,
  onMovePlayer,
  onDragStateChange,
  onAddLine,
  onEraseLine,
  selectedLineId = null,
  onSelectLine,
  onEditLineEndpoint,
  ballOverride,
  interactive = true,
  region,
}: {
  frame: Frame;
  tool: Tool;
  dragging: { kind: "offense" | "defense"; id: string } | null;
  onTapPlayer: (id: OffenseId | DefenseId) => void;
  onMovePlayer: (id: OffenseId | DefenseId, pos: Point) => void;
  onDragStateChange: (d: { kind: "offense" | "defense"; id: string } | null) => void;
  onAddLine: (line: Omit<DrawnLine, "id">) => void;
  onEraseLine: (id: string) => void;
  /** The line currently selected for editing (Move tool only) — its endpoints get draggable handles. */
  selectedLineId?: string | null;
  onSelectLine?: (id: string | null) => void;
  onEditLineEndpoint?: (lineId: string, which: "start" | "end", point: Point, color?: LineColor) => void;
  /** The ball's actual position mid-flight along a pass during playback — overrides deriving it from the holder. */
  ballOverride?: Point;
  /** False during film playback: no drag, draw, or tap-to-open-sheet. */
  interactive?: boolean;
  /** Crops the viewBox to this court-feet region instead of the whole court — fitting both axes to where the play actually happens, not just one, is what actually makes the action render bigger (see bounds.ts). Falls back to the whole court (plus the standard margin) when absent. */
  region?: Region;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<{
    kind: "offense" | "defense";
    id: string;
    startClient: Point;
    startPos: Point;
    moved: boolean;
  } | null>(null);
  const lineGesture = useRef<{ lineId: string; which: "start" | "end" } | null>(null);
  const [drawing, setDrawing] = useState<{ points: Point[] } | null>(null);
  const [dragEndpoint, setDragEndpoint] = useState<{ lineId: string; which: "start" | "end"; point: Point } | null>(null);

  useEffect(() => {
    if (tool !== "move") onSelectLine?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  const defense = resolveDefense(frame, ballOverride);
  const holderPos = frame.offense.find((o) => o.id === frame.ballHolder)?.pos ?? { x: 25, y: 47 };
  const ballPos = ballOverride ?? { x: holderPos.x + 1.7, y: holderPos.y + 1.7 };

  function nearestPlayer(p: Point, radius: number = HIT_R): { kind: "offense" | "defense"; id: string; pos: Point } | null {
    let best: { kind: "offense" | "defense"; id: string; pos: Point; d: number } | null = null;
    for (const o of frame.offense) {
      const d = distance(p, o.pos);
      if (d < radius && (!best || d < best.d)) best = { kind: "offense", id: o.id, pos: o.pos, d };
    }
    for (const x of defense) {
      const d = distance(p, x.pos);
      if (d < radius && (!best || d < best.d)) best = { kind: "defense", id: x.id, pos: x.pos, d };
    }
    return best;
  }

  function nearestLine(p: Point): DrawnLine | null {
    let best: { line: DrawnLine; d: number } | null = null;
    for (const line of frame.lines) {
      for (let i = 0; i < line.points.length - 1; i++) {
        const a = line.points[i];
        const b = line.points[i + 1];
        const ab = sub(b, a);
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / Math.max(1e-6, length(ab) ** 2)));
        const proj = { x: a.x + ab.x * t, y: a.y + ab.y * t };
        const d = distance(p, proj);
        if (d < 1.6 && (!best || d < best.d)) best = { line, d };
      }
    }
    return best?.line ?? null;
  }

  function onPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const p = clientToCourt(svg, e.clientX, e.clientY);

    if (tool === "erase") {
      const line = nearestLine(p);
      if (line) onEraseLine(line.id);
      return;
    }

    if (tool !== "move") {
      const snap = nearestPlayer(p, DRAW_START_HIT_R);
      setDrawing({ points: [snap ? snap.pos : p] });
      tryCapture(svg, e.pointerId, false);
      return;
    }

    const hit = nearestPlayer(p);
    if (hit) {
      onSelectLine?.(null);
      gesture.current = { kind: hit.kind, id: hit.id, startClient: { x: e.clientX, y: e.clientY }, startPos: hit.pos, moved: false };
      tryCapture(svg, e.pointerId, false);
      return;
    }

    const selected = selectedLineId ? frame.lines.find((l) => l.id === selectedLineId) : undefined;
    if (selected) {
      const startD = distance(p, selected.points[0]);
      const endD = distance(p, selected.points[selected.points.length - 1]);
      if (startD < HANDLE_HIT_R || endD < HANDLE_HIT_R) {
        const which: "start" | "end" = startD <= endD ? "start" : "end";
        lineGesture.current = { lineId: selected.id, which };
        setDragEndpoint({ lineId: selected.id, which, point: which === "start" ? selected.points[0] : selected.points[selected.points.length - 1] });
        tryCapture(svg, e.pointerId, false);
        return;
      }
    }

    const tapped = nearestLine(p);
    onSelectLine?.(tapped?.id ?? null);
  }

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;

    if (drawing) {
      const p = clientToCourt(svg, e.clientX, e.clientY);
      const last = drawing.points[drawing.points.length - 1];
      if (distance(last, p) > 0.6) {
        setDrawing({ points: [...drawing.points, p] });
      }
      return;
    }

    if (lineGesture.current) {
      const p = clientToCourt(svg, e.clientX, e.clientY);
      setDragEndpoint({ ...lineGesture.current, point: p });
      return;
    }

    const g = gesture.current;
    if (!g) return;
    const scale = pxPerFoot(svg);
    const movedPx = Math.hypot(e.clientX - g.startClient.x, e.clientY - g.startClient.y);
    if (!g.moved && movedPx / scale > TAP_SLOP) {
      g.moved = true;
      onDragStateChange({ kind: g.kind, id: g.id });
    }
    if (g.moved) {
      const p = clientToCourt(svg, e.clientX, e.clientY);
      onMovePlayer(g.id as OffenseId | DefenseId, p);
    }
  }

  function endLine(d: { points: Point[] }) {
    if (d.points.length < 2) return;
    const end = d.points[d.points.length - 1];
    const snapEnd = nearestPlayer(end);
    // A real drag samples many points even along a dead-straight path; only a deliberate wander off that path's own chord counts as "freehand curved."
    const isStraight = maxDeviationFromChord(d.points) < STRAIGHT_TOLERANCE;
    const points = isStraight ? [d.points[0], snapEnd ? snapEnd.pos : end] : [...d.points.slice(0, -1), snapEnd ? snapEnd.pos : end];
    const startHit = nearestPlayer(d.points[0], DRAW_START_HIT_R);
    const color: DrawnLine["color"] = startHit ? (startHit.kind === "offense" ? "offense" : "defense") : "black";
    onAddLine({ type: tool as LineType, color, points });
  }

  function onPointerUp(e: ReactPointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (svg) tryCapture(svg, e.pointerId, true);

    if (drawing) {
      endLine(drawing);
      setDrawing(null);
      return;
    }

    const lg = lineGesture.current;
    if (lg) {
      lineGesture.current = null;
      const p = clientToCourt(svg!, e.clientX, e.clientY);
      if (lg.which === "start") {
        const snap = nearestPlayer(p, DRAW_START_HIT_R);
        const color: LineColor = snap ? (snap.kind === "offense" ? "offense" : "defense") : "black";
        onEditLineEndpoint?.(lg.lineId, "start", snap ? snap.pos : p, color);
      } else {
        const snap = nearestPlayer(p);
        onEditLineEndpoint?.(lg.lineId, "end", snap ? snap.pos : p);
      }
      setDragEndpoint(null);
      return;
    }

    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (!g.moved) {
      onTapPlayer(g.id as OffenseId | DefenseId);
    } else {
      onDragStateChange(null);
    }
  }

  const drawPreview = drawing;
  const view = region ?? { x: -MARGIN, y: -MARGIN, width: COURT_WIDTH + MARGIN * 2, height: COURT_LENGTH + MARGIN * 2 };

  return (
    <svg
      ref={svgRef}
      viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
      className="h-full w-full touch-none select-none"
      style={{ background: "#6b4423" }}
      onPointerDown={interactive ? onPointerDown : undefined}
      onPointerMove={interactive ? onPointerMove : undefined}
      onPointerUp={interactive ? onPointerUp : undefined}
      onPointerCancel={interactive ? onPointerUp : undefined}
    >
      <ArrowDefs />
      <CourtMarkings />

      <g>
        {frame.lines.map((line) => {
          const live =
            dragEndpoint?.lineId === line.id
              ? { ...line, points: dragEndpoint.which === "start" ? [dragEndpoint.point, ...line.points.slice(1)] : [...line.points.slice(0, -1), dragEndpoint.point] }
              : line;
          return <LinePath key={line.id} line={live} selected={tool === "move" && selectedLineId === line.id} />;
        })}
      </g>
      {drawPreview && drawPreview.points.length > 1 && (
        <LinePath line={{ id: "preview", type: tool as LineType, color: "black", points: drawPreview.points }} />
      )}
      {tool === "move" &&
        selectedLineId &&
        (() => {
          const sel = frame.lines.find((l) => l.id === selectedLineId);
          if (!sel) return null;
          const color = LINE_COLOR_HEX[sel.color];
          const startPt = dragEndpoint?.lineId === sel.id && dragEndpoint.which === "start" ? dragEndpoint.point : sel.points[0];
          const endPt = dragEndpoint?.lineId === sel.id && dragEndpoint.which === "end" ? dragEndpoint.point : sel.points[sel.points.length - 1];
          return (
            <g>
              <LineHandle point={startPt} color={color} />
              <LineHandle point={endPt} color={color} />
            </g>
          );
        })()}

      {frame.offense.map((o) => {
        const isDragging = dragging?.kind === "offense" && dragging.id === o.id;
        const r = isDragging ? PLAYER_R * 1.3 : PLAYER_R;
        const cy = isDragging ? o.pos.y - LIFT_FEET : o.pos.y;
        return (
          <g key={o.id} style={{ transition: isDragging || !interactive ? "none" : "cx 0.4s cubic-bezier(.22,1,.36,1), cy 0.4s cubic-bezier(.22,1,.36,1)" }}>
            <circle cx={o.pos.x} cy={cy} r={r} fill={OFFENSE_FILL} stroke="#450a0a" strokeWidth={0.2} />
            <text x={o.pos.x} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={r * 1.05} fontWeight={800} fill="#ffffff">
              {o.id.slice(1)}
            </text>
          </g>
        );
      })}

      {defense.map((d) => {
        const isDragging = dragging?.kind === "defense" && dragging.id === d.id;
        const r = isDragging ? PLAYER_R * 1.3 : PLAYER_R;
        const cy = isDragging ? d.pos.y - LIFT_FEET : d.pos.y;
        return (
          <g key={d.id} style={{ transition: isDragging || !interactive ? "none" : "cx 0.4s cubic-bezier(.22,1,.36,1), cy 0.4s cubic-bezier(.22,1,.36,1)" }}>
            <circle cx={d.pos.x} cy={cy} r={r} fill={DEFENSE_FILL} stroke="#0a1120" strokeWidth={0.2} />
            <text x={d.pos.x} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={r * 1.05} fontWeight={800} fill={DEFENSE_NUMBER}>
              {d.id.slice(1)}
            </text>
          </g>
        );
      })}

      {(() => {
        const holder = frame.offense.find((o) => o.id === frame.ballHolder);
        const isDragging = dragging?.kind === "offense" && dragging.id === frame.ballHolder;
        const liftDy = isDragging && holder ? -LIFT_FEET : 0;
        return (
          <circle
            cx={ballPos.x}
            cy={ballPos.y + liftDy}
            r={BALL_R}
            fill={BALL_FILL}
            stroke="#7c2d12"
            strokeWidth={0.15}
            style={{ transition: isDragging || !interactive ? "none" : "cx 0.4s cubic-bezier(.22,1,.36,1), cy 0.4s cubic-bezier(.22,1,.36,1)" }}
          />
        );
      })()}
    </svg>
  );
}
