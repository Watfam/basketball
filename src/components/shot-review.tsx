"use client";

import { useState } from "react";
import type { Shot } from "@/lib/basketball/shooting";
import { Button } from "@/components/ui/button";
import { ReplayViewer } from "@/components/replay-viewer";

/**
 * Before a camera set is saved: every call, so a mistake anywhere in the
 * set can be put right, with the few the camera wasn't sure of up front.
 * "Unsure" is the quick check (a kid won't review fifty shots; three, yes);
 * "All shots" is the whole set in order, each with its replay while the
 * phone still has it and one tap to change the call.
 */
export function ShotReview({ shots, onFlip }: { shots: Shot[]; onFlip: (seq: number) => void }) {
  const flagged = shots.filter((s) => s.flagged);
  const [view, setView] = useState<"unsure" | "all">(flagged.length > 0 ? "unsure" : "all");
  const [watching, setWatching] = useState<Shot | null>(null);
  const shown = view === "unsure" ? flagged : shots;
  const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
  return (
    <section className="rounded-2xl border border-accent bg-surface p-4">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-accent">Check your shots before saving</p>
      <p className="mt-1 text-xs text-foreground-dim">
        {flagged.length > 0
          ? `The camera wasn’t sure about ${flagged.length}. Watch the replay, then tap to change any it got wrong.`
          : "The camera was sure about every call. Look through them if you like, then save."}
      </p>
      {flagged.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-raised p-1">
          {(
            [
              { id: "unsure", label: `Unsure · ${flagged.length}` },
              { id: "all", label: `All shots · ${shots.length}` },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={view === t.id}
              onClick={() => setView(t.id)}
              className={`min-h-9 rounded-md px-3 text-xs font-extrabold uppercase tracking-wide ${
                view === t.id ? "bg-surface text-accent shadow-sm" : "text-foreground-dim"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      <ul className="mt-3 max-h-[50vh] divide-y divide-line overflow-y-auto">
        {shown.map((s) => {
          const changed = s.detectedMade !== null && s.detectedMade !== s.made;
          const note = [
            typeof s.tMs === "number" ? clock(s.tMs) : null,
            s.addedByHand ? "added by you" : null,
            s.flagged ? "unsure" : null,
            changed ? "changed" : null,
          ].filter(Boolean);
          return (
            <li key={s.seq} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Shot {s.seq}</p>
                {note.length > 0 && <p className="text-[11px] text-foreground-mute">{note.join(" · ")}</p>}
              </div>
              {s.replayId && (
                <Button variant="secondary" size="sm" onClick={() => setWatching(s)} className="ml-auto">
                  Watch
                </Button>
              )}
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-raised p-1">
                {[true, false].map((made) => (
                  <button
                    key={String(made)}
                    type="button"
                    aria-pressed={s.made === made}
                    onClick={() => s.made !== made && onFlip(s.seq)}
                    className={`min-h-9 rounded-md px-3 text-xs font-extrabold uppercase tracking-wide ${
                      s.made === made ? "bg-surface text-accent shadow-sm" : "text-foreground-dim"
                    }`}
                  >
                    {made ? "Make" : "Miss"}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      {watching?.replayId && (
        <ReplayViewer replayId={watching.replayId} title={`Shot ${watching.seq}`} onClose={() => setWatching(null)} />
      )}
    </section>
  );
}
