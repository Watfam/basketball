"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getReplay } from "@/lib/vision/replay-store";
import { buildTrail, type Trail } from "@/lib/review/trail";
import { fingerprint, type Fingerprint } from "@/lib/review/fingerprint";
import { assessTrail, type TrailQuality } from "@/lib/review/quality";
import type { ReviewRecord, ReviewShot } from "@/lib/review/types";
import { Button } from "@/components/ui/button";
import { PathChart, type ChartLine } from "@/components/path-chart";
import { CONFIDENCE, coverageSentence, frameStatus, makesVersusMisses, plainMissing, plainReasons, shotSummary } from "@/lib/review/plain";

/**
 * Review your shots (EXPERIMENTAL, behind the hl:session-review flag; src/lib/review/flag.ts). Watch a shot from a finished set with the ball's
 * observed path drawn on its video, step through it, and compare shots, makes against misses included. Wording is plain (src/lib/review/plain.ts). It never invents a path: where the ball was not found, or who was who was unclear, the path stops
 * and says so. Everything is image-space; nothing here is a physical measurement, and image-left/right is not the shooter's left/right.
 * The existing review screen (shot-review.tsx) is unchanged; this opens beside it.
 */

type Item = { shot: ReviewShot; trail: Trail | null; fp: Fingerprint | null; quality: TrailQuality };

const TONE: Record<TrailQuality["level"], string> = { tracked: "bg-accent text-on-accent", partial: "bg-raised text-foreground", unreliable: "bg-raised text-foreground-dim", none: "bg-raised text-foreground-mute" };
const MAKE = "#4fd1ff", MISS = "#ffb454", PALETTE = ["#4fd1ff", "#ffb454", "#8ae68a", "#e08cff"];

function analyse(shot: ReviewShot, reconstructMaxGap: number): Item {
  if (!shot.record) return { shot, trail: null, fp: null, quality: { level: "none", reasons: ["No tracking data was kept for this shot."] } };
  const trail = buildTrail(shot.record, { reconstructMaxGap });
  const fp = trail.hasTrail ? fingerprint(trail) : null;
  return { shot, trail, fp, quality: assessTrail(trail, fp) };
}

const fmt = (m: { value: number | boolean | null; reason?: string }, unit = "", digits = 2) =>
  m.value === null ? null : typeof m.value === "boolean" ? (m.value ? "yes" : "no") : `${(m.value as number).toFixed(digits)}${unit}`;

const ROWS: { key: string; label: string; unit?: string; digits?: number }[] = [
  { key: "rim_level_x_bw", label: "Sideways from the rim's centre as it came down (+ is right in the picture)", unit: " ball widths" },
  { key: "approach_direction_deg", label: "Slant coming down (+ leans right in the picture)", unit: "°", digits: 0 },
  { key: "descent_speed_bw_per_frame", label: "How fast it was dropping", unit: " ball widths per camera frame", digits: 2 },
  { key: "closest_approach_bw", label: "Closest it came to the rim's centre", unit: " ball widths" },
  { key: "observed_flight_ms", label: "How long the camera followed it before the rim", unit: " ms", digits: 0 },
  { key: "path_fit_rms_bw", label: "How smooth the last stretch was (lower is smoother)", unit: " ball widths", digits: 2 },
  { key: "rim_interaction_observed", label: "Seen bouncing back up off the rim" },
  { key: "apex_observed", label: "Top of the arc seen" },
];

export function SessionReview({ shots, title = "Review your shots", onClose }: { shots: ReviewShot[]; title?: string; onClose: () => void }) {
  const [longGaps, setLongGaps] = useState(false);
  const items = useMemo(() => shots.map((s) => analyse(s, longGaps ? 3 : 1)), [shots, longGaps]);
  const [sel, setSel] = useState(0);
  const [tab, setTab] = useState<"watch" | "compare">("watch");
  const [mode, setMode] = useState<"outcome" | "pick">("outcome");
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
    if (!item.trail) return frameStatus("none_kept");
    if (hidden) return frameStatus("hidden");
    if (!frame.ran) return frameStatus("not_looking");
    const here = item.trail.segments.flat().find((p) => Math.abs(p.t - frame.t) < 34);
    if (here?.type === "observed") return frameStatus("seen");
    if (here) return frameStatus("estimated");
    const ev = item.trail.events.find((e) => Math.abs(e.t - frame.t) < 34);
    if (ev) return ev.reason === "ambiguous" ? frameStatus("unclear") : frameStatus("rim_part");
    return frameStatus("not_seen");
  })();

  const made = (s: ReviewShot) => (s.made ? "Make" : "Miss");
  const usable = (it: Item) => !!it.trail && !!it.fp && (showUnreliable || (it.quality.level !== "unreliable" && it.quality.level !== "none"));
  const line = (it: Item, color: string): ChartLine => {
    const bw = it.fp!.ballWidthPx, rim = it.trail!.rim, pts: [number, number][] = [];
    for (const seg of it.trail!.segments) for (const p of seg) if (p.type === "observed" && p.t >= -1000 && p.t <= 400) pts.push([(p.x - rim.x) / bw, (rim.y - p.y) / bw]);
    return { pts, color };
  };
  const rowsMM = items.map((it) => ({ made: it.shot.made, level: it.quality.level, x: typeof it.fp?.measurements.rim_level_x_bw.value === "number" ? it.fp.measurements.rim_level_x_bw.value : null }));
  const mm = useMemo(() => makesVersusMisses(rowsMM), [items]); // eslint-disable-line react-hooks/exhaustive-deps
  const withPath = items.filter((it) => it.trail).length, clear = items.filter((it) => it.quality.level === "tracked").length;
  const lines: ChartLine[] = mode === "outcome"
    ? items.filter(usable).map((it) => line(it, it.shot.made ? MAKE : MISS))
    : [...picked].map((i) => items[i]).filter((it) => it && usable(it)).map((it, n) => line(it, PALETTE[n % PALETTE.length]));
  const nMake = items.filter(usable).filter((it) => it.shot.made).length, nMiss = items.filter(usable).filter((it) => !it.shot.made).length;
  const conf = item ? CONFIDENCE[item.quality.level] : null;
  const go = (d: number) => setSel((i) => Math.max(0, Math.min(items.length - 1, i + d)));

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="theme-dark fixed inset-0 z-[70] overflow-y-auto bg-background text-foreground">
      <div className="mx-auto w-full max-w-md px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-wide">{title}</p>
            <p className="text-[11px] text-foreground-mute">Beta. Paths show where the camera saw the ball. Where it did not, nothing is drawn.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Done</Button>
        </div>

        {items.length === 0 ? (
          <p className="mt-6 text-sm text-foreground-dim">This set has no shots to review.</p>
        ) : (
          <>
            <p className="mt-2 text-[12px] text-foreground-dim">{coverageSentence(items.length, withPath, clear)}{withPath === 0 ? " Paths are only saved for sets shot with the camera while shot review is on." : ""}</p>
            <div role="tablist" aria-label="View" className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-raised p-1">
              {([["watch", "Watch a shot"], ["compare", "Compare shots"]] as const).map(([k, t]) => (
                <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)} className={`min-h-10 rounded-lg text-xs font-extrabold ${tab === k ? "bg-surface text-accent shadow-sm" : "text-foreground-dim"}`}>{t}</button>
              ))}
            </div>

            {tab === "watch" && (
              <>
                <ul aria-label="Shots" className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
                  {items.map((it, i) => (
                    <li key={it.shot.seq}>
                      <button type="button" aria-pressed={i === sel} onClick={() => setSel(i)} className={`min-h-10 whitespace-nowrap rounded-md px-3 text-xs font-extrabold ${i === sel ? "bg-surface text-accent shadow-sm ring-1 ring-line-strong" : "bg-raised text-foreground-dim"}`}>
                        {it.shot.seq} · {made(it.shot)}{it.quality.level === "unreliable" || it.quality.level === "none" ? " ·" : ""}
                      </button>
                    </li>
                  ))}
                </ul>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="font-bold">Shot {item.shot.seq} of {items.length}</span>
                  <span className={`rounded-md px-2 py-0.5 font-bold ${item.shot.made ? "bg-accent text-on-accent" : "bg-raised text-foreground"}`}>{made(item.shot)}</span>
                  {conf && <span className={`rounded-md px-2 py-0.5 font-bold ${TONE[item.quality.level]}`}>{conf.label}</span>}
                  {item.shot.detectedMade !== null && item.shot.detectedMade !== item.shot.made && <span className="text-foreground-mute">camera said {item.shot.detectedMade ? "make" : "miss"}; you changed it</span>}
                  {item.shot.flagged && <span className="text-foreground-mute">camera was unsure about this call</span>}
                </div>
                <p className="mt-1 text-[12px] text-foreground-dim">{shotSummary({ level: item.quality.level, m: item.fp ? Object.fromEntries(Object.entries(item.fp.measurements).map(([k, v]) => [k, v.value])) : null })}</p>

                <div className="relative mt-2 aspect-square overflow-hidden rounded-2xl bg-surface">
                  <canvas ref={canvas} width={416} height={416} aria-label="The shot with the ball's path drawn on it" className="h-full w-full" />
                  {videoState === "none" && <p className="absolute bottom-2 left-2 right-2 rounded-md bg-background/80 px-2 py-1 text-[11px] text-foreground-dim">{rec ? "The video of this shot is no longer on this phone, so the path is drawn on a plain grid." : "No video or path was saved for this shot."}</p>}
                </div>

                {rec && (
                  <>
                    <div className="mt-2 flex items-center gap-2">
                      <Button variant="secondary" size="sm" onClick={() => { setPlaying(false); setIdx((i) => Math.max(0, i - 1)); }} aria-label="Back one frame">◀</Button>
                      <Button size="sm" onClick={() => setPlaying((p) => !p)}>{playing ? "Pause" : "Play"}</Button>
                      <Button variant="secondary" size="sm" onClick={() => { setPlaying(false); setIdx((i) => Math.min(rec.frames.length - 1, i + 1)); }} aria-label="Forward one frame">▶</Button>
                      <input type="range" min={0} max={rec.frames.length - 1} value={idx} aria-label="Moment in the shot" onChange={(e) => { setPlaying(false); setIdx(+e.target.value); }} className="min-w-0 flex-1" />
                    </div>
                    <p aria-live="polite" className="mt-2 min-h-10 rounded-lg bg-raised px-2 py-1.5 text-[12px] text-foreground-dim">
                      <span className="text-foreground-mute">{frame ? `${frame.t >= 0 ? "+" : ""}${(frame.t / 1000).toFixed(2)} s from the rim` : ""}</span> · {status}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-foreground-dim">
                      <label className="flex items-center gap-1.5"><input type="checkbox" checked={whole} onChange={(e) => setWhole(e.target.checked)} /> Show the whole path at once</label>
                      <span><b className="text-[#4fd1ff]">●</b> seen</span><span><b className="text-[#ffd24f]">◌</b> estimated</span><span><b className="text-[#ff6b6b]">✕</b> unsure which ball</span>
                    </div>
                    <details className="mt-2 text-[11px] text-foreground-dim">
                      <summary className="cursor-pointer font-bold text-foreground-mute">More options</summary>
                      <div className="mt-1 flex flex-col gap-1">
                        <label className="flex items-center gap-1.5"><input type="checkbox" checked={showRecon} onChange={(e) => setShowRecon(e.target.checked)} /> Show estimated points</label>
                        <label className="flex items-center gap-1.5"><input type="checkbox" checked={showRings} onChange={(e) => setShowRings(e.target.checked)} /> Show how sure the camera is (circles)</label>
                        <label className="flex items-center gap-1.5"><input type="checkbox" checked={longGaps} onChange={(e) => setLongGaps(e.target.checked)} /> Estimate across longer gaps (less certain)</label>
                        {(item.quality.level === "unreliable" || item.quality.level === "none") && <label className="flex items-center gap-1.5"><input type="checkbox" checked={showUnreliable} onChange={(e) => setShowUnreliable(e.target.checked)} /> Show paths that are not reliable</label>}
                      </div>
                    </details>
                  </>
                )}

                {conf && (
                  <section aria-label="How much to trust this path" className="mt-3 rounded-2xl border border-line bg-surface p-3 text-[12px] text-foreground-dim">
                    <p className="font-bold text-foreground">{conf.label}</p>
                    <p>{conf.sentence}</p>
                    {plainReasons(item.quality.reasons).length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-4">{plainReasons(item.quality.reasons).map((r) => <li key={r}>{r}</li>)}</ul>}
                  </section>
                )}

                {item.fp && (
                  <details className="mt-3 rounded-2xl border border-line bg-surface p-3">
                    <summary className="cursor-pointer text-[12px] font-bold text-foreground-mute">What the camera measured</summary>
                    <dl className="mt-2 space-y-1.5">
                      {ROWS.map((r) => {
                        const m = item.fp!.measurements[r.key];
                        if (!m) return null;
                        const v = fmt(m, r.unit ?? "", r.digits ?? 2);
                        return (
                          <div key={r.key} className="text-[12px]">
                            <dt className="text-foreground-mute">{r.label}</dt>
                            <dd className={v ? "font-semibold text-foreground" : "text-foreground-dim"}>{v ?? `Not available. ${plainMissing(m.reason)}`}</dd>
                          </div>
                        );
                      })}
                    </dl>
                    <p className="mt-2 text-[11px] text-foreground-mute">
                      Taken from the {item.fp.observedPoints} times the ball was actually seen, never from estimated points. One ball width is the ball&apos;s size in the picture ({item.fp.ballWidthSource === "shot" ? "measured on this shot" : "a typical size was used"}). Left and right are the picture&apos;s, not the shooter&apos;s.
                    </p>
                    <p className="mt-1 break-all text-[10px] text-foreground-mute">For debugging: shot {item.shot.seq} · {rec?.shotId} · {rec?.frames.length ?? 0} frames · mean detector score {String(item.fp.measurements.mean_score.value ?? "n/a")}</p>
                  </details>
                )}

                <div className="mt-3 flex gap-2">
                  <Button variant="secondary" size="sm" disabled={sel <= 0} onClick={() => go(-1)}>◀ Previous shot</Button>
                  <Button variant="secondary" size="sm" disabled={sel >= items.length - 1} onClick={() => go(1)}>Next shot ▶</Button>
                </div>
              </>
            )}

            {tab === "compare" && (
              <section aria-label="Compare shots" className="mt-3 rounded-2xl border border-line bg-surface p-3">
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-raised p-1">
                  {([["outcome", "Makes vs misses"], ["pick", "Pick shots"]] as const).map(([k, t]) => (
                    <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)} className={`min-h-9 rounded-lg text-xs font-extrabold ${mode === k ? "bg-surface text-accent shadow-sm" : "text-foreground-dim"}`}>{t}</button>
                  ))}
                </div>
                <PathChart lines={lines} label="Ball paths side by side, with the rim at the centre" />
                <p className="mt-1 text-[11px] text-foreground-mute">The rim is the orange bar. Each square is two ball widths across. Up is up in the picture.</p>
                {mode === "outcome" ? (
                  <>
                    <p className="mt-1 text-[12px] text-foreground-dim"><b style={{ color: MAKE }}>●</b> {nMake} make{nMake === 1 ? "" : "s"} · <b style={{ color: MISS }}>●</b> {nMiss} miss{nMiss === 1 ? "" : "es"} <span className="text-foreground-mute">(only shots with a trustworthy path)</span></p>
                    <p aria-live="polite" className="mt-2 rounded-lg bg-raised px-2 py-1.5 text-[12px] text-foreground-dim">{mm.sentence}</p>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-[11px] text-foreground-mute">Tick two or more shots. Shots with an unreliable path are left out unless you choose to show them in the Watch view.</p>
                    <ul className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1 text-[12px]">
                      {items.map((it, i) => (
                        <li key={it.shot.seq}>
                          <label className="flex items-center gap-1.5 text-foreground-dim">
                            <input type="checkbox" checked={picked.has(i)} disabled={!usable(it)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(i); else n.delete(i); return n; })} />
                            {it.shot.seq} {it.shot.made ? "make" : "miss"}
                          </label>
                        </li>
                      ))}
                    </ul>
                    {lines.length === 1 && <p className="mt-1 text-[11px] text-foreground-mute">Only one of the ticked shots has a trustworthy path to draw.</p>}
                  </>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
