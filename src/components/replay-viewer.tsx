"use client";

import { useEffect, useState } from "react";
import { getReplay } from "@/lib/vision/replay-store";
import { Button } from "@/components/ui/button";

/**
 * Plays one shot's replay: the hoop close-up from a second before the
 * ball reached the rim to two seconds after, on a loop, at full or half
 * speed. Frames come from the phone (src/lib/vision/replay-store.ts).
 */
export function ReplayViewer({ replayId, title, onClose }: { replayId: string; title: string; onClose: () => void }) {
  const [frames, setFrames] = useState<{ t: number; url: string }[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [index, setIndex] = useState(0);
  const [slow, setSlow] = useState(true);

  useEffect(() => {
    let urls: string[] = [];
    let live = true;
    void getReplay(replayId).then((clip) => {
      if (!live) return;
      if (!clip || clip.frames.length === 0) {
        setMissing(true);
        return;
      }
      const list = clip.frames.map((f) => ({ t: f.t, url: URL.createObjectURL(f.blob) }));
      urls = list.map((f) => f.url);
      setFrames(list);
    });
    return () => {
      live = false;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [replayId]);

  // Each frame shows for as long as it really lasted (doubled at half speed); a pause at the end of the loop.
  useEffect(() => {
    if (!frames || frames.length < 2) return;
    const next = (index + 1) % frames.length;
    const gap = next === 0 ? 700 : Math.max(30, frames[next].t - frames[index].t) * (slow ? 2 : 1);
    const id = setTimeout(() => setIndex(next), gap);
    return () => clearTimeout(id);
  }, [frames, index, slow]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const frame = frames?.[Math.min(index, frames.length - 1)];
  const atRim = frame ? frame.t >= 0 && frame.t < 150 : false;

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4">
      <div className="w-full max-w-sm space-y-3">
        <div className="flex items-center justify-between text-white">
          <p className="text-sm font-extrabold uppercase tracking-wide">{title}</p>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-white/80 hover:text-white">
            Close
          </Button>
        </div>
        <div className="relative aspect-square overflow-hidden rounded-2xl bg-black">
          {frame ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local blob frame, not a page image
            <img src={frame.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/70">
              {missing ? "No replay for this shot (the phone couldn't keep it)." : "Loading the replay…"}
            </p>
          )}
          {frame && (
            <span
              className={`absolute left-2 top-2 rounded-md px-2 py-0.5 text-[11px] font-bold text-white ${
                atRim ? "bg-[var(--accent)]" : "bg-black/60"
              }`}
            >
              {atRim ? "At the rim" : `${(frame.t / 1000).toFixed(1)} s`}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-white/10 p-1">
          {[true, false].map((s) => (
            <button
              key={String(s)}
              type="button"
              aria-pressed={slow === s}
              onClick={() => setSlow(s)}
              className={`min-h-10 rounded-lg text-xs font-extrabold uppercase tracking-wide ${
                slow === s ? "bg-white text-black" : "text-white/80"
              }`}
            >
              {s ? "Half speed" : "Full speed"}
            </button>
          ))}
        </div>
        <p className="text-center text-xs text-white/60">Kept on this phone until the set is saved, then deleted.</p>
      </div>
    </div>
  );
}
