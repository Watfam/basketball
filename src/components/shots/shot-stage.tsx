"use client";

import { memo, useMemo } from "react";
import { BOARD_M, stateAt, type Scene } from "@/lib/review/shot-scene";

export const MAKE_COLOR = "#4fd1ff";
export const MISS_COLOR = "#ffb454";
export const THIRD_COLOR = "#c79bff";
const W = 360, H = 300;

export type Layer = { scene: Scene; color: string; t: number; tag: string };

/**
 * The camera's own view of a shot, drawn from what it saw: the rim and backboard at the size the ball implies (drawn for reference, not detected),
 * the ball at each moment it was seen at the size it appeared, and the path so far. When the ball was not seen, it is held where it was last seen
 * and marked, never moved; a dashed line marks the stretch where it was not seen. Nothing here is estimated or smoothed.
 */
function StageBase({ layers, label, showCrossing = true, crossingLabel = false, compact = false }: { layers: Layer[]; label: string; showCrossing?: boolean; crossingLabel?: boolean; compact?: boolean }) {
  const geo = useMemo(() => {
    const ref = layers[0]?.scene;
    const pxM = ref ? ref.pxPerM : 100;
    let minX = -190, maxX = 190, minY = -70, maxY = 210;
    const boardHalf = (BOARD_M.w / 2) * pxM, boardTop = (BOARD_M.h - BOARD_M.belowRim) * pxM;
    maxY = Math.max(maxY, boardTop + 12); minX = Math.min(minX, -boardHalf - 10); maxX = Math.max(maxX, boardHalf + 10);
    for (const l of layers) for (const s of l.scene.sightings) { minX = Math.min(minX, s.x - s.w); maxX = Math.max(maxX, s.x + s.w); minY = Math.min(minY, s.y - s.w); maxY = Math.max(maxY, s.y + s.w); }
    const k = Math.min(W / (maxX - minX), H / (maxY - minY));
    const offX = (W - (maxX - minX) * k) / 2;
    return { k, X: (x: number) => offX + (x - minX) * k, Y: (y: number) => (maxY - y) * k, pxM, boardHalf, boardTop };
  }, [layers]);
  const { k, X, Y, pxM, boardHalf, boardTop } = geo;
  const ref = layers[0]?.scene;
  const rimR = ref ? (ref.rimW / 2) * k : 20;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-manipulation rounded-xl bg-[#0d1117]" role="img" aria-label={label}>
      {/* backboard and target square, to scale from the ball's size */}
      <rect x={X(-boardHalf)} y={Y(boardTop)} width={2 * boardHalf * k} height={(boardTop + BOARD_M.belowRim * pxM) * k} rx={3} fill="#ffffff" fillOpacity={0.05} stroke="#ffffff" strokeOpacity={0.22} />
      <rect x={X(-(BOARD_M.targetW / 2) * pxM)} y={Y(BOARD_M.targetH * pxM)} width={BOARD_M.targetW * pxM * k} height={BOARD_M.targetH * pxM * k} fill="none" stroke="#ffffff" strokeOpacity={0.3} />
      {/* net, then the rim */}
      {[-1, -0.5, 0, 0.5, 1].map((f) => <line key={f} x1={X(f * (ref?.rimW ?? 46) / 2)} y1={Y(0)} x2={X(f * (ref?.rimW ?? 46) / 4)} y2={Y(-(ref?.ballPx ?? 24) * 1.9)} stroke="#ffffff" strokeOpacity={0.18} />)}
      <ellipse cx={X(0)} cy={Y(0)} rx={rimR} ry={Math.max(3, rimR * 0.22)} fill="none" stroke="#ff783c" strokeWidth={compact ? 2 : 3} />
      <text x={X(0)} y={Y(0) + Math.max(3, rimR * 0.22) + 12} textAnchor="middle" className="fill-[#ff783c] text-[9px] font-bold">RIM</text>
      {layers.map((l) => <LayerView key={l.tag + l.scene.id} layer={l} k={k} X={X} Y={Y} showCrossing={showCrossing} crossingLabel={crossingLabel} compact={compact} />)}
    </svg>
  );
}

function LayerView({ layer, k, X, Y, showCrossing, crossingLabel, compact }: { layer: Layer; k: number; X: (x: number) => number; Y: (y: number) => number; showCrossing: boolean; crossingLabel: boolean; compact: boolean }) {
  const { scene, color, t } = layer;
  const st = stateAt(scene, t);
  // the trail as separate pieces, split wherever the ball was not seen
  const pieces: string[] = [];
  let cur: string[] = [];
  let prevT = -Infinity;
  for (const s of st.trail) {
    if (cur.length && s.t - prevT > 100) { pieces.push(cur.join(" ")); cur = []; }
    cur.push(`${X(s.x).toFixed(1)},${Y(s.y).toFixed(1)}`); prevT = s.t;
  }
  if (cur.length) pieces.push(cur.join(" "));
  const dashed = scene.gaps.filter((g) => t >= g.toT).map((g) => {
    const a = scene.sightings.find((s) => s.t === g.fromT), b = scene.sightings.find((s) => s.t === g.toT);
    return a && b ? { x1: X(a.x), y1: Y(a.y), x2: X(b.x), y2: Y(b.y), key: g.fromT } : null;
  }).filter((x): x is NonNullable<typeof x> => !!x);
  const b = st.shown;
  const r = b ? Math.max(3, (b.w / 2) * k) : 0;
  return (
    <g>
      {pieces.map((p, i) => <polyline key={i} points={p} fill="none" stroke={color} strokeWidth={compact ? 1.8 : 2.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />)}
      {dashed.map((d) => <line key={d.key} x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke="#9aa4b2" strokeWidth={2} strokeDasharray="4 4" />)}
      {st.trail.filter((s) => s.unsure).map((s) => <circle key={s.t} cx={X(s.x)} cy={Y(s.y)} r={2.8} fill="#0d1117" stroke="#9aa4b2" strokeWidth={1.4} />)}
      {showCrossing && scene.crossing && t >= scene.crossing.t && (
        <g><line x1={X(scene.crossing.xBw * scene.ballPx) - 7} x2={X(scene.crossing.xBw * scene.ballPx) + 7} y1={Y(0)} y2={Y(0)} stroke={color} strokeWidth={3} />{crossingLabel && <text x={X(scene.crossing.xBw * scene.ballPx) + (scene.crossing.xBw >= 0 ? 11 : -11)} y={Y(0) - 6} textAnchor={scene.crossing.xBw >= 0 ? "start" : "end"} fill={color} className="text-[9px] font-bold">came down here</text>}</g>
      )}
      {b && (
        <g opacity={st.seenNow ? 1 : 0.55}>
          <circle cx={X(b.x)} cy={Y(b.y)} r={r} fill="#e8803a" stroke={color} strokeWidth={compact ? 2 : 3} strokeDasharray={st.seenNow ? undefined : "3 3"} />
          <path d={`M ${X(b.x) - r} ${Y(b.y)} Q ${X(b.x)} ${Y(b.y) - r * 0.5} ${X(b.x) + r} ${Y(b.y)}`} stroke="#5a2d0c" strokeWidth={1} fill="none" />
          <line x1={X(b.x)} y1={Y(b.y) - r} x2={X(b.x)} y2={Y(b.y) + r} stroke="#5a2d0c" strokeWidth={1} />
          {!st.seenNow && <text x={X(b.x) + r + 4} y={Y(b.y) + 3} fill="#9aa4b2" className="text-[10px] font-bold">{st.ended ? "last seen" : "not seen"}</text>}
        </g>
      )}
    </g>
  );
}

export const ShotStage = memo(StageBase);
