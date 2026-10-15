"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getReplay } from "@/lib/vision/replay-store";
import { buildTrail, type Trail } from "@/lib/review/trail";
import { explainMissing, fingerprint, type Fingerprint } from "@/lib/review/fingerprint";
import { assessTrail, type TrailQuality } from "@/lib/review/quality";
import type { ReviewRecord, ReviewShot } from "@/lib/review/types";
import { Button } from "@/components/ui/button";

/**
 * Session review (EXPERIMENTAL, behind the hl:session-review flag; src/lib/review/flag.ts). Browse the shots of a finished set, replay one with the
 * ball's observed path drawn on its video, step frame by frame, compare shots' rim-relative paths, and read the measurements the camera could
 * take, with what it could not and why. It never invents a path: where the ball was not found, or who was who was unclear, the path stops
 * and says so. Everything is image-space; nothing here is a physical measurement, and image-left/right is not the shooter's left/right.
 * The existing review screen (shot-review.tsx) is unchanged; this opens beside it.
 */

type Item = { shot: ReviewShot; trail: Trail | null; fp: Fingerprint | null; quality: TrailQuality };

const QUALITY_LABEL: Record<TrailQuality["level"], { text: string; tone: string }> = {
  tracked: { text: "Path found", tone: "bg-accent text-on-accent" },
  partial: { text: "Partial path", tone: "bg-raised text-foreground" },
  unreliable: { text: "Path unreliable", tone: "bg-raised text-foreground-dim" },
  none: { text: "No path", tone: "bg-raised text-foreground-mute" },
};

function analyse(shot: ReviewShot, reconstructMaxGap: number): Item {
  if (!shot.record) return { shot, trail: null, fp: null, quality: { level: "none", reasons: ["No tracking data was kept for this shot."] } };
  const trail = buildTrail(shot.record, { reconstructMaxGap });
  const fp = trail.hasTrail ? fingerprint(trail) : null;
  return { shot, trail, fp, quality: assessTrail(trail, fp) };
}

const fmt = (m: { value: number | boolean | null; reason?: string }, unit = "", digits = 2) =>
  m.value === null ? null : typeof m.value === "boolean" ? (m.value ? "yes" : "no") : `${(m.value as number).toFixed(digits)}${unit}`;

const ROWS: { key: string; label: string; unit?: string; digits?: number }[] = [
  { key: "rim_level_x_bw", label: "Position at rim height (image-horizontal, from rim centre)", unit: " ball widths" },
  { key: "approach_direction_deg", label: "Direction coming down (image-space)", unit: "°", digits: 0 },
  { key: "descent_speed_bw_per_frame", label: "Speed coming down", unit: " ball widths per frame", digits: 2 },
  { key: "closest_approach_bw", label: "Closest to the rim centre", unit: " ball widths" },
  { key: "observed_flight_ms", label: "Flight seen before the rim", unit: " ms", digits: 0 },
  { key: "path_fit_rms_bw", label: "Smoothness of the last stretch (lower is smoother)", unit: " ball widths", digits: 2 },
  { key: "rim_interaction_observed", label: "Ball seen bouncing back up after the rim" },
  { key: "apex_observed", label: "Top of the arc seen" },
];

export function SessionReview({ shots, title = "Session review", onClose }: { shots: ReviewShot[]; title?: string; onClose: () => void }) {
  const [longGaps, setLongGaps] = useState(false);
  const items = useMemo(() => shots.map((s) => analyse(s, longGaps ? 3 : 1)), [shots, longGaps]);
  const [sel, setSel] = useState(0);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [showUnreliable, setShowUnreliable] = useState(false);
  const [showRecon, setShowRecon] = useState(true);
  const [showRings, setShowRings] = useState(true);
  const [whole, setWhole] = useState(false);
  const item = items[Math.min(sel, items.length - 1)];
  const rec: ReviewRecord | null = item?.shot.record ?? null;
  // Position and play state belong to one shot: a different shot starts again at its first rim sighting, paused.
  const startIdx = rec ? Math.max(0, rec.frames.findIndex((f) => f.t >= 0)) : 0;
  const [pos, setPos] = useState<{ seq: number; idx: number; playing: boolean }>({ seq: -1, idx: 0, playing: false });
  const here = pos.seq === item?.shot.seq ? pos : { seq: item?.shot.seq ?? -1, idx: startIdx, playing: false };
  const idx = here.idx, playing = here.playing;
  const setIdx = (f: number | ((i: number) => number)) => setPos((p) => { const cur = p.seq === item?.shot.seq ? p : { seq: item?.shot.seq ?? -1, idx: startIdx, playing: false }; return { ...cur, idx: typeof f === "function" ? f(cur.idx) : f }; });
  const setPlaying = (f: boolean | ((p: boolean) => boolean)) => setPos((p) => { const cur = p.seq === item?.shot.seq ? p : { seq: item?.shot.seq ?? -1, idx: startIdx, playing: false }; return { ...cur, playing: typeof f === "function" ? f(cur.playing) : f }; });
  const [loaded, setLoaded] = useState<{ id: string; frames: { t: number; url: string }[] | null } | null>(null);
  const replayId = item?.shot.replayId;
  const frames = loaded && loaded.id === replayId ? loaded.frames : null;
  const videoState: "loading" | "ok" | "none" = !replayId ? "none" : loaded && loaded.id === replayId ? (loaded.frames ? "ok" : "none") : "loading";
  const canvas = useRef<HTMLCanvasElement>(null);
  const cmp = useRef<HTMLCanvasElement>(null);
  const imgs = useRef<Map<string, HTMLImageElement>>(new Map());
  const [tick, setTick] = useState(0);

  // This shot's video frames from the phone's replay store, if the phone still has them.
  useEffect(() => {
    let urls: string[] = [];
    let live = true;
    if (!replayId) return;
    void getReplay(replayId).then((clip) => {
      if (!live) return;
      if (!clip || clip.frames.length === 0) return setLoaded({ id: replayId, frames: null });
      const list = clip.frames.map((f) => ({ t: f.t, url: URL.createObjectURL(f.blob) }));
      urls = list.map((f) => f.url);
      imgs.current = new Map();
      list.forEach((f) => { const im = new Image(); im.onload = () => setTick((n) => n + 1); im.src = f.url; imgs.current.set(f.url, im); });
      setLoaded({ id: replayId, frames: list });
    });
    return () => { live = false; urls.forEach((u) => URL.revokeObjectURL(u)); };
  }, [replayId]);

  const seq = item?.shot.seq ?? -1, last = (rec?.frames.length ?? 1) - 1;
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setPos((p) => (p.seq !== seq ? p : p.idx >= last ? { ...p, playing: false } : { ...p, idx: p.idx + 1 })), 110);
    return () => clearInterval(id);
  }, [playing, seq, last]);

  const hidden = !!item && (item.quality.level === "unreliable" || item.quality.level === "none") && !showUnreliable;
  const frame = rec?.frames[Math.min(idx, (rec?.frames.length ?? 1) - 1)] ?? null;

  // ---- draw the shot ----
  useEffect(() => {
    const cv = canvas.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const S = cv.width, k = S / 416;
    ctx.fillStyle = "#0b0d10"; ctx.fillRect(0, 0, S, S);
    const nearest = frames && frame ? frames.reduce((b, f) => (Math.abs(f.t - frame.t) < Math.abs(b.t - frame.t) ? f : b), frames[0]) : null;
    const im = nearest ? imgs.current.get(nearest.url) : null;
    if (im && im.complete && im.naturalWidth) ctx.drawImage(im, 0, 0, S, S);
    else { ctx.strokeStyle = "#1f242b"; ctx.lineWidth = 1; for (let g = 0; g <= 416; g += 52) { ctx.beginPath(); ctx.moveTo(g * k, 0); ctx.lineTo(g * k, S); ctx.moveTo(0, g * k); ctx.lineTo(S, g * k); ctx.stroke(); } }
    if (!rec) return;
    const rim = rec.rim;
    ctx.strokeStyle = "rgba(255,120,60,.95)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(rim.x * k, rim.y * k, 6, 0, 7); ctx.stroke();
    if (!item.trail || hidden) return;
    const t = frame?.t ?? 0, show = (p: { t: number; type: string }) => (whole || p.t <= t) && (showRecon || p.type === "observed");
    for (const seg of item.trail.segments) {
      const pts = seg.filter(show);
      for (let i = 1; i < pts.length; i += 1) { const a = pts[i - 1], b = pts[i], rc = a.type === "reconstructed" || b.type === "reconstructed"; ctx.strokeStyle = rc ? "rgba(255,210,79,.95)" : "rgba(79,209,255,.95)"; ctx.setLineDash(rc ? [5, 4] : []); ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(a.x * k, a.y * k); ctx.lineTo(b.x * k, b.y * k); ctx.stroke(); ctx.setLineDash([]); }
      for (const p of pts) {
        const now = frame && Math.abs(p.t - frame.t) < 34;
        if (p.type === "observed") { ctx.fillStyle = `hsl(${Math.round(30 + Math.max(0, Math.min(1, ((p.score ?? 0.25) - 0.25) / 0.65)) * 150)},90%,58%)`; ctx.beginPath(); ctx.arc(p.x * k, p.y * k, now ? 5 : 3, 0, 7); ctx.fill(); }
        else { ctx.strokeStyle = "#ffd24f"; ctx.setLineDash([3, 3]); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x * k, p.y * k, now ? 6 : 4, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
        if (showRings && now) { ctx.strokeStyle = p.type === "observed" ? "rgba(79,209,255,.6)" : "rgba(255,210,79,.7)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x * k, p.y * k, Math.max(2, p.unc * k), 0, 7); ctx.stroke(); }
      }
    }
    for (const e of item.trail.events) { if (!(whole || e.t <= t)) continue; ctx.strokeStyle = e.reason === "ambiguous" ? "#ff6b6b" : "#c27cff"; ctx.lineWidth = 2; const x = e.x * k, y = e.y * k; ctx.beginPath(); ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y + 5); ctx.moveTo(x + 5, y - 5); ctx.lineTo(x - 5, y + 5); ctx.stroke(); }
  }, [item, rec, frame, frames, whole, hidden, showRecon, showRings, videoState, tick]);

  // ---- compare overlay (rim-relative, ball widths) ----
  const chosen = useMemo(() => [...picked].map((i) => items[i]).filter((it) => it && it.trail && it.fp && (showUnreliable || (it.quality.level !== "unreliable" && it.quality.level !== "none"))), [picked, items, showUnreliable]);
  useEffect(() => {
    const cv = cmp.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const W = cv.width, H = cv.height, pad = 30;
    ctx.fillStyle = "#12151a"; ctx.fillRect(0, 0, W, H);
    const X = (v: number) => pad + ((v + 9) / 18) * (W - 2 * pad), Y = (v: number) => H - pad - ((v + 2) / 13) * (H - 2 * pad);
    ctx.strokeStyle = "#2d323b"; ctx.fillStyle = "#9aa3b2"; ctx.font = "10px system-ui"; ctx.lineWidth = 1;
    for (let x = -8; x <= 8; x += 2) { ctx.beginPath(); ctx.moveTo(X(x), 10); ctx.lineTo(X(x), H - pad); ctx.stroke(); ctx.fillText(String(x), X(x) - 4, H - pad + 12); }
    for (let y = -2; y <= 10; y += 2) { ctx.beginPath(); ctx.moveTo(pad, Y(y)); ctx.lineTo(W - 10, Y(y)); ctx.stroke(); ctx.fillText(String(y), 6, Y(y) + 3); }
    ctx.strokeStyle = "#ff783c"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(pad, Y(0)); ctx.lineTo(W - 10, Y(0)); ctx.moveTo(X(0), 10); ctx.lineTo(X(0), H - pad); ctx.stroke();
    const palette = ["#4fd1ff", "#ffb454", "#8ae68a", "#e08cff"];
    chosen.forEach((it, n) => {
      const bw = it.fp!.ballWidthPx, rim = it.trail!.rim, col = palette[n % palette.length];
      for (const seg of it.trail!.segments) { const pts = seg.filter((p) => p.type === "observed" && p.t >= -1000 && p.t <= 400); if (pts.length < 2) continue; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); pts.forEach((p, i) => { const x = X((p.x - rim.x) / bw), y = Y((rim.y - p.y) / bw); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); pts.forEach((p) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X((p.x - rim.x) / bw), Y((rim.y - p.y) / bw), 2, 0, 7); ctx.fill(); }); }
    });
  }, [chosen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setPos((p) => { const c = p.seq === seq ? p : { seq, idx: startIdx, playing: false }; return { ...c, playing: false, idx: Math.min(last, c.idx + 1) }; });
      else if (e.key === "ArrowLeft") setPos((p) => { const c = p.seq === seq ? p : { seq, idx: startIdx, playing: false }; return { ...c, playing: false, idx: Math.max(0, c.idx - 1) }; });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, seq, last, startIdx]);

  // ---- per-frame status in words ----
  const status = (() => {
    if (!rec || !frame || !item) return null;
    if (!item.trail) return "No tracking data was kept for this shot.";
    if (hidden) return "This path is hidden because it is not reliable. The video is shown as recorded.";
    if (!frame.ran) return "The camera was not looking at this moment (nothing was moving near the hoop).";
    const here = item.trail.segments.flat().find((p) => Math.abs(p.t - frame.t) < 34);
    if (here?.type === "observed") return `Ball seen here (score ${(here.score ?? 0).toFixed(2)}, position good to about ${here.unc.toFixed(1)} px in the picture).`;
    if (here) return `Filled in, not seen: estimated across a one-frame gap, good to about ${here.unc.toFixed(1)} px.`;
    const ev = item.trail.events.find((e) => Math.abs(e.t - frame.t) < 34);
    if (ev) return ev.reason === "ambiguous" ? "Something else ball-like was right next to the ball, so this sighting is left out and the path breaks." : "A detection on the rim hardware was left out.";
    return "Ball not found in this frame. Nothing is drawn.";
  })();

  const q = item ? QUALITY_LABEL[item.quality.level] : null;
  const made = (s: ReviewShot) => (s.made ? "Make" : "Miss");

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="theme-dark fixed inset-0 z-[70] overflow-y-auto bg-background text-foreground">
      <div className="mx-auto w-full max-w-md px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-wide">{title}</p>
            <p className="text-[11px] text-foreground-mute">Experimental. Image-space only: not a physical measurement.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>

        {items.length === 0 ? (
          <p className="mt-6 text-sm text-foreground-dim">This session has no shots to review.</p>
        ) : (
          <>
            <ul aria-label="Shots" className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
              {items.map((it, i) => (
                <li key={it.shot.seq}>
                  <button type="button" aria-pressed={i === sel} onClick={() => setSel(i)} className={`min-h-9 whitespace-nowrap rounded-md px-3 text-xs font-extrabold ${i === sel ? "bg-surface text-accent shadow-sm" : "bg-raised text-foreground-dim"}`}>
                    {it.shot.seq} · {made(it.shot)}
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="font-bold">Shot {item.shot.seq}</span>
              <span className={`rounded-md px-2 py-0.5 font-bold ${item.shot.made ? "bg-accent text-on-accent" : "bg-raised text-foreground"}`}>{made(item.shot)}</span>
              {item.shot.detectedMade !== null && item.shot.detectedMade !== item.shot.made && <span className="text-foreground-mute">camera said {item.shot.detectedMade ? "make" : "miss"}, changed by you</span>}
              {item.shot.flagged && <span className="text-foreground-mute">camera was unsure</span>}
              {q && <span className={`rounded-md px-2 py-0.5 font-bold ${q.tone}`}>{q.text}</span>}
            </div>

            <div className="relative mt-2 aspect-square overflow-hidden rounded-2xl bg-surface">
              <canvas ref={canvas} width={416} height={416} aria-label="The shot with the ball's observed path" className="h-full w-full" />
              {videoState === "none" && <p className="absolute bottom-2 left-2 right-2 rounded-md bg-background/80 px-2 py-1 text-[11px] text-foreground-dim">{rec ? "The video of this shot is not kept on this phone; the path is drawn on a plain grid." : "No video or tracking data was kept for this shot."}</p>}
              {item.quality.level === "none" && rec && <p className="absolute inset-x-3 top-3 rounded-md bg-background/85 px-2 py-1 text-[11px] font-semibold text-foreground">Tracking is incomplete for this shot.</p>}
            </div>

            {rec && (
              <>
                <div className="mt-2 flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => { setPlaying(false); setIdx((i) => Math.max(0, i - 1)); }} aria-label="Previous frame">◀ Frame</Button>
                  <Button size="sm" onClick={() => setPlaying((p) => !p)}>{playing ? "Pause" : "Play"}</Button>
                  <Button variant="secondary" size="sm" onClick={() => { setPlaying(false); setIdx((i) => Math.min(rec.frames.length - 1, i + 1)); }} aria-label="Next frame">Frame ▶</Button>
                  <input type="range" min={0} max={rec.frames.length - 1} value={idx} aria-label="Frame" onChange={(e) => { setPlaying(false); setIdx(+e.target.value); }} className="min-w-0 flex-1" />
                </div>
                <p aria-live="polite" className="mt-2 min-h-10 rounded-lg bg-raised px-2 py-1.5 text-[12px] text-foreground-dim">
                  <span className="font-mono text-foreground-mute">{frame ? `${frame.t >= 0 ? "+" : ""}${(frame.t / 1000).toFixed(2)} s from the rim` : ""}</span> · {status}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-foreground-dim">
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={whole} onChange={(e) => setWhole(e.target.checked)} /> whole path</label>
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={showRecon} onChange={(e) => setShowRecon(e.target.checked)} /> filled-in points</label>
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={showRings} onChange={(e) => setShowRings(e.target.checked)} /> uncertainty</label>
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={longGaps} onChange={(e) => setLongGaps(e.target.checked)} /> fill longer gaps (low confidence)</label>
                  {(item.quality.level === "unreliable" || item.quality.level === "none") && <label className="flex items-center gap-1.5"><input type="checkbox" checked={showUnreliable} onChange={(e) => setShowUnreliable(e.target.checked)} /> show unreliable paths</label>}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-foreground-mute">
                  <span><b className="text-[#4fd1ff]">●</b> seen</span><span><b className="text-[#ffd24f]">◌</b> filled in (not seen)</span><span><b className="text-[#ff6b6b]">✕</b> unclear who is who</span><span><b className="text-[#c27cff]">✕</b> rim hardware left out</span>
                </div>
              </>
            )}

            {item.quality.reasons.length > 0 && (
              <ul className="mt-3 list-disc space-y-0.5 pl-4 text-[12px] text-foreground-dim">
                {item.quality.reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
            )}

            {item.fp && (
              <section aria-label="Measurements" className="mt-4 rounded-2xl border border-line bg-surface p-3">
                <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">What the camera could measure · shot-fingerprint/1</p>
                <dl className="mt-2 space-y-1.5">
                  {ROWS.map((r) => {
                    const m = item.fp!.measurements[r.key];
                    if (!m) return null;
                    const v = fmt(m, r.unit ?? "", r.digits ?? 2);
                    return (
                      <div key={r.key} className="text-[12px]">
                        <dt className="text-foreground-mute">{r.label}</dt>
                        <dd className={v ? "font-semibold text-foreground" : "text-foreground-dim"}>{v ?? `Not available. ${explainMissing(m.reason ?? "")}`}</dd>
                      </div>
                    );
                  })}
                </dl>
                <p className="mt-2 text-[11px] text-foreground-mute">
                  Measured from {item.fp.observedPoints} sightings (never from filled-in points), mean detector score {String(item.fp.measurements.mean_score.value ?? "n/a")}. Ball width {item.fp.ballWidthPx.toFixed(0)} px ({item.fp.ballWidthSource === "shot" ? "from this shot" : "default"}). Lengths are in ball widths; direction is in the picture, not the shooter&apos;s left or right.
                </p>
                <p className="mt-1 break-all text-[10px] text-foreground-mute">Evidence: shot {item.shot.seq} · record {rec?.shotId} · replay {item.shot.replayId ?? "none"} · {rec?.frames.length ?? 0} frames · {item.fp.evidence.observedTimesMs.length} sightings{item.fp.evidence.breakTimesMs.length ? ` · ${item.fp.evidence.breakTimesMs.length} breaks` : ""}</p>
              </section>
            )}

            <section aria-label="Compare shots" className="mt-4 rounded-2xl border border-line bg-surface p-3">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">Compare paths (rim at the centre, in ball widths)</p>
              <canvas ref={cmp} width={360} height={300} aria-label="Observed paths of the chosen shots relative to the rim" className="mt-2 w-full rounded-lg" />
              <p className="mt-1 text-[11px] text-foreground-mute">Tick two or more shots. Only seen points are drawn; unreliable paths are left out unless you choose to show them.</p>
              <ul className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1 text-[12px]">
                {items.map((it, i) => (
                  <li key={it.shot.seq}>
                    <label className="flex items-center gap-1.5 text-foreground-dim">
                      <input type="checkbox" checked={picked.has(i)} disabled={!it.trail} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(i); else n.delete(i); return n; })} />
                      {it.shot.seq} {it.shot.made ? "make" : "miss"}
                    </label>
                  </li>
                ))}
              </ul>
              {chosen.length === 1 && picked.size >= 1 && <p className="mt-1 text-[11px] text-foreground-mute">Only one of the chosen shots has a reliable path to draw.</p>}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
