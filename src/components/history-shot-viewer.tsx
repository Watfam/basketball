"use client";

import { useEffect, useMemo, useState } from "react";
import { PathChart, type ChartLine } from "@/components/path-chart";
import { Button } from "@/components/ui/button";
import { CONFIDENCE, plainMissing, plainReasons, shotSummary } from "@/lib/review/plain";
import { pathPieces } from "@/lib/review/history-view";
import type { HistoryShot } from "@/lib/review/history-types";

const MEASURES: { key: string; label: string; unit?: string; digits?: number }[] = [
  { key: "rim_level_x_bw", label: "Sideways from the rim's centre as it came down (+ is right in the picture)", unit: " ball widths" },
  { key: "approach_direction_deg", label: "Slant coming down (+ leans right in the picture)", unit: "°", digits: 0 },
  { key: "descent_speed_bw_per_frame", label: "How fast it was dropping", unit: " ball widths per camera frame" },
  { key: "closest_approach_bw", label: "Closest it came to the rim's centre", unit: " ball widths" },
  { key: "observed_flight_ms", label: "How long the camera followed it before the rim", unit: " ms", digits: 0 },
  { key: "path_fit_rms_bw", label: "How smooth the last stretch was (lower is smoother)", unit: " ball widths" },
  { key: "rim_interaction_observed", label: "Seen bouncing back up off the rim" },
];

/**
 * Watch a saved shot's path again, on a plain grid with the rim at the centre (the video is not kept in history). Only moments the camera
 * actually saw the ball are drawn; a missing stretch breaks the line.
 */
export function HistoryShotViewer({ shot, when, onClose }: { shot: HistoryShot; when: string; onClose: () => void }) {
  const total = shot.points.length;
  const [idx, setIdx] = useState(Math.max(0, total - 1));
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setIdx((i) => { if (i >= total - 1) { setPlaying(false); return i; } return i + 1; }), 120);
    return () => clearInterval(id);
  }, [playing, total]);

  const sorted = useMemo(() => [...shot.points].sort((a, b) => a[0] - b[0]), [shot]);
  const bw = shot.ballWidthPx && shot.ballWidthPx > 0 ? shot.ballWidthPx : 24;
  const lines: ChartLine[] = pathPieces(shot, { upTo: idx + 1, window: false }).map((pts) => ({ pts, color: shot.made ? "#4fd1ff" : "#ffb454" }));
  const cur = sorted[Math.min(idx, total - 1)];
  const marker: [number, number] | null = cur ? [cur[1] / bw, cur[2] / bw] : null;
  const conf = CONFIDENCE[shot.quality.level];
  const m = shot.fingerprint?.m ?? null;
  const val = (k: string, unit = "", digits = 2) => { const v = m?.[k]; return v === null || v === undefined ? null : typeof v === "boolean" ? (v ? "yes" : "no") : `${(v as number).toFixed(digits)}${unit}`; };

  return (
    <section aria-label="Watch this shot" className="rounded-2xl border border-line bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-bold text-foreground">{when} · shot {shot.seq} · {shot.made ? "Make" : "Miss"}</p>
          <p className="text-[11px] font-bold text-foreground-mute">{conf.label}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>
      <p className="mt-1 text-[12px] text-foreground-dim">{shotSummary({ level: shot.quality.level, m })}</p>
      {total >= 2 ? (
        <>
          <PathChart lines={lines} marker={marker} label="This shot's path, with the rim at the centre" />
          <p className="mt-1 text-[11px] text-foreground-mute">The rim is the orange bar. Each square is two ball widths. Up is up in the picture. The video of a saved shot is not kept, only where the ball was seen.</p>
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" onClick={() => { if (!playing && idx >= total - 1) setIdx(0); setPlaying((p) => !p); }}>{playing ? "Pause" : idx >= total - 1 ? "Replay" : "Play"}</Button>
            <input type="range" min={0} max={total - 1} value={idx} aria-label="Moment in the shot" onChange={(e) => { setPlaying(false); setIdx(+e.target.value); }} className="min-w-0 flex-1" />
          </div>
          {cur && <p aria-live="polite" className="mt-1 text-[11px] text-foreground-mute">{cur[0] >= 0 ? "+" : ""}{(cur[0] / 1000).toFixed(2)} s from the rim · sighting {idx + 1} of {total}</p>}
        </>
      ) : (
        <p className="mt-2 rounded-lg bg-raised px-2 py-1.5 text-[12px] text-foreground-dim">{shot.tracked ? "The camera saw the ball too few times to draw a path." : "No path was saved for this shot, only the make or miss."}</p>
      )}
      <p className="mt-2 text-[12px] text-foreground-dim">{conf.sentence}</p>
      {plainReasons(shot.quality.reasons).length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] text-foreground-dim">{plainReasons(shot.quality.reasons).map((r) => <li key={r}>{r}</li>)}</ul>}
      {shot.fingerprint && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[12px] font-bold text-foreground-mute">What the camera measured</summary>
          <dl className="mt-1 space-y-1.5">
            {MEASURES.map((r) => { const v = val(r.key, r.unit ?? "", r.digits ?? 2); return (
              <div key={r.key} className="text-[12px]"><dt className="text-foreground-mute">{r.label}</dt><dd className={v ? "font-semibold text-foreground" : "text-foreground-dim"}>{v ?? `Not available. ${plainMissing(shot.fingerprint!.why[r.key])}`}</dd></div>
            ); })}
          </dl>
          <p className="mt-1 text-[11px] text-foreground-mute">Taken from the times the ball was actually seen. One ball width is the ball&apos;s size in the picture.</p>
        </details>
      )}
    </section>
  );
}
