"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { computeCoveragePosition } from "@/lib/plays/coverage";
import { distance, length, maxDeviationFromChord, smoothPath, sub, unit, zigzagAlongPath, type Point } from "@/lib/plays/geometry";
import { COURT_LENGTH, COURT_WIDTH, DEFENDED_HOOP, type DefenseId, type DrawnLine, type Frame, type LineType, type OffenseId } from "@/lib/plays/types";

export type Tool = "move" | "pass" | "cut" | "dribble" | "screen";

const LINE_COLOR_HEX = { offense: "#dc2626", defense: "#1e3a8a", black: "#111827" } as const;
const OFFENSE_FILL = "#dc2626";
const DEFENSE_FILL = "#17306b";
const DEFENSE_NUMBER = "#F2B705";
const BALL_FILL = "#f97316";

/** Breathing room around the painted court — an inbounder stands a little behind the baseline, out of bounds. */
const MARGIN = 4;
const PLAYER_R = 1.7;
const HIT_R = 3.4;
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

/** Live defender positions — purely a function of the frame, never stored. */
function resolveDefense(frame: Frame) {
  const byOffense = new Map(frame.offense.map((o) => [o.id, o.pos]));
  const ball = byOffense.get(frame.ballHolder)!;
  return frame.defense.map((d) => {
    const man = byOffense.get(d.man)!;
    const pos = computeCoveragePosition(d.coverage, man, ball, DEFENDED_HOOP, d.man === frame.ballHolder, d.manualPos);
    return { ...d, pos, man };
  });
}

function CourtMarkings() {
  const topHoop = DEFENDED_HOOP;
  const botHoop: Point = { x: 25, y: COURT_LENGTH - topHoop.y };
  const arc = (hoop: Point, flip: 1 | -1) => {
    const r = 22;
    const y0 = hoop.y + flip * 14.3; // where the arc meets the straight corner run, ~ the real NBA corner-3 geometry
    const x1 = 3, x2 = 47;
    const sweep = flip === 1 ? 1 : 0;
    return `M ${x1} ${hoop.y} L ${x1} ${y0} A ${r} ${r} 0 0 ${sweep} ${x2} ${y0} L ${x2} ${hoop.y}`;
  };
  const key = (hoop: Point, flip: 1 | -1) => `M ${17} ${hoop.y} V ${hoop.y + flip * 19} H ${33} V ${hoop.y}`;
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
      <path d={key(topHoop, 1)} />
      <path d={key(botHoop, -1)} />
      <circle cx={25} cy={topHoop.y + 19} r={6} />
      <circle cx={25} cy={botHoop.y - 19} r={6} />
      <path d={arc(topHoop, 1)} />
      <path d={arc(botHoop, -1)} />
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

function LinePath({ line }: { line: DrawnLine }) {
  const color = LINE_COLOR_HEX[line.color];
  const pts = line.points;
  const start = pts[0];
  const end = pts[pts.length - 1];

  if (line.type === "dribble") {
    return <path d={zigzagAlongPath(pts)} fill="none" stroke={color} strokeWidth={0.35} strokeLinejoin="round" strokeLinecap="round" markerEnd={`url(#arrow-${line.color})`} />;
  }

  const d = smoothPath(pts);
  const dash = line.type === "pass" ? "1.4 1.1" : undefined;
  const marker = line.type === "pass" || line.type === "cut" ? `url(#arrow-${line.color})` : undefined;

  let screenCap: React.ReactNode = null;
  if (line.type === "screen") {
    const dir = unit(sub(end, pts[pts.length - 2] ?? start));
    const normal = { x: -dir.y, y: dir.x };
    const capLen = 1.6;
    const a = { x: end.x + normal.x * capLen, y: end.y + normal.y * capLen };
    const b = { x: end.x - normal.x * capLen, y: end.y - normal.y * capLen };
    screenCap = <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={0.4} strokeLinecap="round" />;
  }

  return (
    <g>
      <path d={d} fill="none" stroke={color} strokeWidth={0.35} strokeDasharray={dash} strokeLinecap="round" markerEnd={marker} />
      {screenCap}
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
}: {
  frame: Frame;
  tool: Tool;
  dragging: { kind: "offense" | "defense"; id: string } | null;
  onTapPlayer: (id: OffenseId | DefenseId) => void;
  onMovePlayer: (id: OffenseId | DefenseId, pos: Point) => void;
  onDragStateChange: (d: { kind: "offense" | "defense"; id: string } | null) => void;
  onAddLine: (line: Omit<DrawnLine, "id">) => void;
  onEraseLine: (id: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<{
    kind: "offense" | "defense";
    id: string;
    startClient: Point;
    startPos: Point;
    moved: boolean;
  } | null>(null);
  const [drawing, setDrawing] = useState<{ points: Point[] } | null>(null);

  const defense = resolveDefense(frame);
  const ball = frame.offense.find((o) => o.id === frame.ballHolder)?.pos ?? { x: 25, y: 47 };
  const ballPos = { x: ball.x + 1.7, y: ball.y + 1.7 };

  function nearestPlayer(p: Point): { kind: "offense" | "defense"; id: string; pos: Point } | null {
    let best: { kind: "offense" | "defense"; id: string; pos: Point; d: number } | null = null;
    for (const o of frame.offense) {
      const d = distance(p, o.pos);
      if (d < HIT_R && (!best || d < best.d)) best = { kind: "offense", id: o.id, pos: o.pos, d };
    }
    for (const x of defense) {
      const d = distance(p, x.pos);
      if (d < HIT_R && (!best || d < best.d)) best = { kind: "defense", id: x.id, pos: x.pos, d };
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

    if (tool !== "move") {
      const snap = nearestPlayer(p);
      setDrawing({ points: [snap ? snap.pos : p] });
      tryCapture(svg, e.pointerId, false);
      return;
    }

    const hit = nearestPlayer(p);
    if (hit) {
      gesture.current = { kind: hit.kind, id: hit.id, startClient: { x: e.clientX, y: e.clientY }, startPos: hit.pos, moved: false };
      tryCapture(svg, e.pointerId, false);
      return;
    }
    const line = nearestLine(p);
    if (line) onEraseLine(line.id);
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
    const startHit = nearestPlayer(d.points[0]);
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

  return (
    <svg
      ref={svgRef}
      viewBox={`${-MARGIN} ${-MARGIN} ${COURT_WIDTH + MARGIN * 2} ${COURT_LENGTH + MARGIN * 2}`}
      className="h-full w-full touch-none select-none"
      style={{ background: "#6b4423" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <ArrowDefs />
      <CourtMarkings />

      {frame.lines.map((line) => (
        <LinePath key={line.id} line={line} />
      ))}
      {drawPreview && drawPreview.points.length > 1 && (
        <LinePath line={{ id: "preview", type: tool as LineType, color: "black", points: drawPreview.points }} />
      )}

      {frame.offense.map((o) => {
        const isDragging = dragging?.kind === "offense" && dragging.id === o.id;
        const r = isDragging ? PLAYER_R * 1.3 : PLAYER_R;
        const cy = isDragging ? o.pos.y - LIFT_FEET : o.pos.y;
        return (
          <g key={o.id} style={{ transition: isDragging ? "none" : "cx 0.4s cubic-bezier(.22,1,.36,1), cy 0.4s cubic-bezier(.22,1,.36,1)" }}>
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
          <g key={d.id} style={{ transition: isDragging ? "none" : "cx 0.4s cubic-bezier(.22,1,.36,1), cy 0.4s cubic-bezier(.22,1,.36,1)" }}>
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
            style={{ transition: isDragging ? "none" : "cx 0.4s cubic-bezier(.22,1,.36,1), cy 0.4s cubic-bezier(.22,1,.36,1)" }}
          />
        );
      })()}
    </svg>
  );
}
