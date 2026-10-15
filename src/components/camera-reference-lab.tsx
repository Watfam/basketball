"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pictureFraction, containedRect } from "@/lib/vision/contain";
import { captureDescriptor, checkAgainstReference, clearReference, loadReference, saveReference, type CameraCheck, type ReferenceRecord } from "@/lib/framing/reference";
import type { FramingDescriptor } from "@/lib/framing/descriptor";
import type { FramingMeasurement } from "@/lib/framing/measure";
import { Button } from "@/components/ui/button";

/**
 * The optional camera reference (EXPERIMENTAL). Point the phone at the hoop, tap the rim, confirm what was found, and keep a few numbers.
 * Later, check whether the camera still looks the same. Advisory only: it never blocks counting, saving or any comparison, and it keeps no picture.
 * It is a separate page and is never run inside the counting loop.
 */
const word: Record<CameraCheck["status"], string> = { same: "Looks the same", shifted: "Moved a little", different_angle: "Different angle", cant_tell: "Cannot tell", no_hoop: "Hoop not found" };

export function CameraReferenceLab() {
  const video = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const work = useRef<HTMLCanvasElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seed, setSeed] = useState<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [found, setFound] = useState<{ descriptor: FramingDescriptor; stills: FramingMeasurement[]; ms: number } | null>(null);
  const [ref, setRef] = useState<ReferenceRecord | null>(() => (typeof window === "undefined" ? null : loadReference()));
  const [check, setCheck] = useState<CameraCheck | null>(null);

  const stop = useCallback(() => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; setOn(false); }, []);
  useEffect(() => stop, [stop]);

  const open = async () => {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      stream.current = s;
      const v = video.current; if (!v) return;
      v.srcObject = s; v.muted = true; v.playsInline = true; await v.play(); setOn(true);
    } catch (e) { setError(e instanceof Error ? e.message : "The camera could not be opened."); }
  };

  const grab = useCallback(() => {
    const v = video.current;
    if (!v || !v.videoWidth) return null;
    const c = (work.current ??= document.createElement("canvas"));
    const w = Math.min(1920, v.videoWidth), h = Math.round((w * v.videoHeight) / v.videoWidth);
    if (c.width !== w) { c.width = w; c.height = h; }
    const ctx = c.getContext("2d", { willReadFrequently: true }); if (!ctx) return null;
    ctx.drawImage(v, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    return { data: img.data, width: w, height: h };
  }, []);

  const draw = useCallback((m: FramingMeasurement | null, at: { x: number; y: number } | null) => {
    const cv = overlay.current, v = video.current; if (!cv || !v) return;
    const box = cv.getBoundingClientRect(); cv.width = box.width; cv.height = box.height;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const r = containedRect(box.width, box.height, v.videoWidth || 16, v.videoHeight || 9);
    const px = (x: number, y: number, f: number, srcW: number) => ({ x: r.x + (x * f * r.w) / srcW, y: r.y + (y * f * r.w) / srcW });
    if (at) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(r.x + at.x * r.w, r.y + at.y * r.h, 14, 0, 6.283); ctx.stroke(); }
    if (m?.rim) {
      const c = px(m.rim.cx, m.rim.cy, m.factor, m.src.width);
      ctx.strokeStyle = "#22dd55"; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(c.x, c.y, (m.rim.w * m.factor * r.w) / m.src.width / 2, Math.max(3, (m.rim.h * m.factor * r.w) / m.src.width / 2), 0, 0, 6.283); ctx.stroke();
    }
    if (m?.board) {
      ctx.strokeStyle = "#ff44cc"; ctx.lineWidth = 3; ctx.beginPath();
      m.board.corners.forEach((p, i) => { const q = px(p.x, p.y, m.factor, m.src.width); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
      ctx.closePath(); ctx.stroke();
    }
  }, []);

  const tap = (e: React.PointerEvent<HTMLDivElement>) => {
    const v = video.current; if (!v || !on) return;
    const b = e.currentTarget.getBoundingClientRect();
    const f = pictureFraction(e.clientX - b.left, e.clientY - b.top, { w: b.width, h: b.height }, { w: v.videoWidth, h: v.videoHeight });
    if (!f) return;
    setSeed(f); setFound(null); setCheck(null); draw(null, f);
  };

  const measure = async () => {
    if (!seed) return;
    setBusy("Measuring: hold the phone still for a few seconds");
    try {
      const res = await captureDescriptor(grab, seed, {});
      setFound(res);
      const last = [...res.stills].reverse().find((s) => s.rim) ?? null;
      draw(last, seed);
      if (ref) setCheck(checkAgainstReference(ref, res.descriptor));
    } catch (e) { setError(e instanceof Error ? e.message : "Measuring failed."); }
    setBusy(null);
  };

  const keep = () => {
    const v = video.current;
    if (!found || !v || found.descriptor.rimFound < 4) return;
    const rec: ReferenceRecord = { v: 1, createdAt: new Date().toISOString(), descriptor: found.descriptor, frame: { width: v.videoWidth, height: v.videoHeight } };
    if (saveReference(rec)) { setRef(rec); setCheck(null); setError(null); } else setError("Could not keep the reference on this phone.");
  };
  const wipe = () => { clearReference(); setRef(null); setCheck(null); };

  const d = found?.descriptor;
  const q = (k: "size" | "az" | "off" | "asp" | "roll") => (d?.q[k] ? d.q[k]!.mean : null);

  return (
    <div className="space-y-4 text-foreground">
      <section className="rounded-2xl border border-line bg-surface p-3 text-[12px] text-foreground-dim">
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">What this is</p>
        <p className="mt-1">Keep a few numbers about how the camera sees the hoop (where the rim is, how big, how tilted, how the backboard sits behind it). Later, check whether the camera still looks the same. <b className="text-foreground">Counting works the same with or without it, and nothing here changes how saved sessions are compared.</b> No picture is kept; it stays on this phone.</p>
        <p className="mt-1">It cannot see how high the phone is, and it is unsure about small changes of side-to-side angle. A &ldquo;cannot tell&rdquo; is an honest answer.</p>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-3">
        <div className="flex flex-wrap items-center gap-2">
          {!on ? <Button size="sm" onClick={() => void open()}>Open camera</Button> : <Button variant="secondary" size="sm" onClick={stop}>Close camera</Button>}
        </div>
        {error && <p role="alert" className="mt-2 text-[12px] font-semibold text-foreground">{error}</p>}
        <div className="relative mt-2 aspect-video w-full overflow-hidden rounded-xl bg-black" onPointerDown={tap} data-testid="stage">
          <video ref={video} className="absolute inset-0 h-full w-full object-contain" playsInline muted />
          <canvas ref={overlay} className="pointer-events-none absolute inset-0 h-full w-full" />
        </div>
        <p className="mt-2 text-[12px] text-foreground-dim">{!on ? "Open the camera and point it at the hoop." : !seed ? "Tap the rim in the picture." : "Rim chosen. Measure to see what was found."}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void measure()} disabled={!on || !seed || !!busy}>{ref ? "Check against reference" : "Measure"}</Button>
          <Button variant="secondary" size="sm" onClick={keep} disabled={!found || found.descriptor.rimFound < 4 || !!busy}>{ref ? "Replace the reference with this" : "Keep as the reference"}</Button>
        </div>
        {busy && <p aria-live="polite" className="mt-2 text-[12px] text-foreground">{busy}</p>}
      </section>

      {found && (
        <section aria-label="What was found" className="rounded-2xl border border-line bg-surface p-3 text-[12px] text-foreground-dim">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">What was found (green ring: rim, pink box: backboard)</p>
          <p className="mt-1">{d!.rimFound} of {d!.stills} stills found the rim; {found.stills.filter((s) => s.board).length} also found the backboard. Took {(found.ms / 1000).toFixed(1)} s.</p>
          <ul className="mt-1 list-disc pl-5">
            <li>Rim width: {q("size") !== null ? `${(Math.exp(q("size")!) * 100).toFixed(2)}% of the picture` : "not measured"}{d!.usable.includes("size") ? "" : " (not steady enough to use)"}</li>
            <li>Backboard width over rim width: {q("az") !== null ? q("az")!.toFixed(2) : "not found"}{d!.usable.includes("az") ? "" : " (not steady enough to use)"}</li>
            <li>Rim position against the backboard: {q("off") !== null ? q("off")!.toFixed(2) : "not found"}{d!.usable.includes("off") ? "" : " (not steady enough to use)"}</li>
            <li>Tilt: {q("roll") !== null ? `${q("roll")!.toFixed(1)}°` : "not found"}{d!.usable.includes("roll") ? "" : " (not steady enough to use)"}</li>
          </ul>
          {found.stills.flatMap((s) => s.issues).length > 0 && <p className="mt-1">Notes: {[...new Set(found.stills.flatMap((s) => s.issues))].join("; ")}.</p>}
          {d!.rimFound < 4 && <p className="mt-1 font-semibold text-foreground">The rim was not found often enough. Tap closer to the rim, hold the phone still and try again.</p>}
        </section>
      )}

      {check && (
        <section aria-label="Camera check" className="rounded-2xl border border-line bg-surface p-3 text-[12px] text-foreground-dim">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">Against the reference · {word[check.status]}</p>
          <p className="mt-1 text-[14px] font-semibold text-foreground">{check.headline}</p>
          <ul className="mt-1 list-disc pl-5">{check.details.map((t) => <li key={t}>{t}</li>)}</ul>
        </section>
      )}

      <section className="rounded-2xl border border-line bg-surface p-3 text-[12px] text-foreground-dim">
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-foreground-mute">Saved reference</p>
        {ref ? <>
          <p className="mt-1">Kept {ref.createdAt.slice(0, 10)}: {ref.descriptor.rimFound} stills, steady numbers: {ref.descriptor.usable.join(", ") || "none"}. About {JSON.stringify(ref).length} bytes.</p>
          <Button variant="danger" size="sm" className="mt-2" onClick={wipe}>Delete the reference</Button>
        </> : <p className="mt-1">None. Counting does not need one.</p>}
      </section>
    </div>
  );
}
