"use client";

import Link from "next/link";
import { useState } from "react";
import { FilmPlayer } from "@/components/plays/film-player";
import { PlayCourt } from "@/components/plays/play-court";
import { computeContentBounds } from "@/lib/plays/bounds";
import { haptic } from "@/lib/haptics";
import type { LibraryPlay } from "@/lib/plays/library";
import { mirrorFrames } from "@/lib/plays/mirror";
import { SPEEDS, usePlayClock } from "@/lib/plays/use-play-clock";

/**
 * The default way to look at a play: read-only, laid out as a page (court up top, the full step list
 * and coaching points below it, no edit tools competing for space), not the heavy frame-by-frame
 * designer. Clicking a step animates straight into it — the same "click the words, the play jumps
 * there" interaction as the step list a coach is already used to — and Full screen hands off to the
 * same immersive player the designer uses, rather than a second, different-feeling playback engine.
 */
export function PlayViewer({ play, teamId, canEdit }: { play: LibraryPlay; teamId: string; canEdit: boolean }) {
  const [frames, setFrames] = useState(play.frames);
  const [fullscreen, setFullscreen] = useState(false);
  const region = computeContentBounds(frames);
  const { clock, shown, ballOverride, playing, speed, setSpeed, togglePlay, jumpToStep } = usePlayClock(frames);

  function flip() {
    haptic("tap");
    setFrames((fs) => mirrorFrames(fs));
  }

  if (fullscreen) {
    return <FilmPlayer frames={frames} onExit={() => setFullscreen(false)} region={region} onFlip={flip} />;
  }

  const activeStep = clock.phase === "hold" ? clock.frameIndex : clock.frameIndex + 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link href={`/teams/${teamId}/plays/playbook`} className="text-sm font-bold text-foreground-dim hover:text-foreground">
          ← Playbook
        </Link>
        <div className="flex items-center gap-1.5">
          {canEdit && (
            <Link
              href={`/teams/${teamId}/plays?lib=${play.id}`}
              onClick={() => haptic("tap")}
              aria-label="Edit this play"
              className="flex items-center gap-1 rounded-full border border-line-strong px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-foreground-dim hover:border-accent hover:text-accent"
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 20h4L19 9l-4-4L4 16z" />
                <path d="M13.5 6.5l4 4" />
              </svg>
              Edit
            </Link>
          )}
          <button
            type="button"
            onClick={flip}
            aria-label="Flip to the other side of the court"
            className="flex items-center gap-1 rounded-full border border-line-strong px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-foreground-dim hover:border-accent hover:text-accent"
          >
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M8 3 4 7l4 4" />
              <path d="M4 7h11a5 5 0 0 1 5 5" />
              <path d="M16 21l4-4-4-4" />
              <path d="M20 17H9a5 5 0 0 1-5-5" />
            </svg>
            Flip
          </button>
          <button
            type="button"
            onClick={() => { haptic("tap"); setFullscreen(true); }}
            className="flex items-center gap-1 rounded-full border border-line-strong px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-foreground-dim hover:border-accent hover:text-accent"
          >
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
            </svg>
            Full screen
          </button>
        </div>
      </div>

      <h1 className="text-xl font-bold text-foreground">{play.name}</h1>
      <p className="-mt-2 text-xs font-semibold text-foreground-dim">{play.vs}</p>

      <div className="overflow-hidden rounded-2xl border border-line">
        <div className="relative aspect-square w-full sm:aspect-video">
          <PlayCourt
            frame={shown}
            tool="move"
            dragging={null}
            onTapPlayer={() => {}}
            onMovePlayer={() => {}}
            onDragStateChange={() => {}}
            onAddLine={() => {}}
            onEraseLine={() => {}}
            ballOverride={ballOverride}
            interactive={false}
            region={region}
          />
        </div>

        <div className="space-y-3 border-t border-line bg-surface p-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => { haptic("tap"); togglePlay(); }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><rect x="5" y="4" width="5" height="16" /><rect x="14" y="4" width="5" height="16" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M6 4 20 12 6 20Z" /></svg>
              )}
            </button>
            <div className="flex gap-1.5">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { haptic("tap"); setSpeed(s); }}
                  className={`min-h-9 rounded-lg border px-2.5 text-xs font-extrabold ${
                    speed === s ? "border-accent bg-accent/10 text-accent" : "border-line bg-raised text-foreground-dim"
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">Steps</h2>
        <ol className="space-y-1">
          {play.frames.map((f, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => { haptic("tap"); jumpToStep(i); }}
                aria-current={activeStep === i}
                className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
                  activeStep === i ? "border-accent bg-accent/10" : "border-transparent hover:bg-raised"
                }`}
              >
                <span className={`shrink-0 font-display text-lg leading-tight ${activeStep === i ? "text-accent" : "text-foreground-mute"}`}>
                  {i === 0 ? "—" : i}
                </span>
                <span className={`text-sm leading-snug ${activeStep === i ? "text-foreground" : "text-foreground-dim"}`}>{f.note}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      {play.keys.length > 0 && (
        <section>
          <h2 className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">Coaching points</h2>
          <ul className="list-disc space-y-1.5 pl-5">
            {play.keys.map((k, i) => (
              <li key={i} className="text-sm leading-relaxed text-foreground-dim">
                {k}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs leading-relaxed text-foreground-mute">{play.about}</p>
      {play.source && <p className="text-[11px] leading-relaxed text-foreground-mute">{play.source}</p>}
    </div>
  );
}
