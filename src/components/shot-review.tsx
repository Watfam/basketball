"use client";

import { useEffect, useMemo, useState } from "react";
import type { Shot } from "@/lib/basketball/shooting";
import { summarize } from "@/lib/basketball/shooting";
import { formatPercentage } from "@/lib/basketball/shooting";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/card";
import { ReplayViewer } from "@/components/replay-viewer";
import { SessionReviewEntry } from "@/components/session-review-entry";

/** Unsure shots shown before "Show more": a kid will check ten, not forty. */
const FIRST_UNSURE = 12;
/** Save stays off this long after the screen opens, so the tap that ended the set can't also save it. */
const SAVE_LOCK_MS = 1200;

const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

/**
 * The review step of a camera set, a screen of its own after "End session":
 * the live total, the shots the camera wasn't sure of (most unsure first),
 * every shot in order, a replay for each while the phone still has it, and
 * one tap to change a call. Nothing is saved until Save set; Keep shooting
 * goes back to the counter. The state lives in the stored set, so a phone
 * that restarts (unhooked from its stand, app switched away) comes back here.
 */
export function ShotReview({
  shots,
  label,
  playerName,
  saving,
  error,
  onFlip,
  onSave,
  onKeepShooting,
  report,
}: {
  shots: Shot[];
  label: string;
  playerName: string;
  saving: boolean;
  error: string | null;
  onFlip: (seq: number) => void;
  onSave: () => void;
  onKeepShooting: () => void;
  /** The camera report text, for the copy button. */
  report: () => string;
}) {
  const flagged = useMemo(
    () => shots.filter((s) => s.flagged).sort((a, b) => (b.flagReasons?.length ?? 0) - (a.flagReasons?.length ?? 0) || a.seq - b.seq),
    [shots]
  );
  const [view, setView] = useState<"unsure" | "all">(flagged.length > 0 ? "unsure" : "all");
  const [more, setMore] = useState(false);
  const [watching, setWatching] = useState<Shot | null>(null);
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shownReport, setShownReport] = useState<string | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setReady(true), SAVE_LOCK_MS);
    return () => clearTimeout(id);
  }, []);

  const sum = summarize(shots);
  const list = view === "all" ? shots : more ? flagged : flagged.slice(0, FIRST_UNSURE);
  const hidden = view === "unsure" ? flagged.length - list.length : 0;

  return (
    <div className="theme-dark court-glow fixed inset-0 z-50 flex flex-col bg-background text-foreground">
      <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-4 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <Eyebrow className="text-accent">
          Review your set · {label || "Shooting session"} · {playerName}
        </Eyebrow>
        <div className="mt-2 flex items-end gap-4">
          <p className="font-display text-7xl leading-[0.85] tabular-nums text-foreground">
            {sum.makes}
            <span className="text-foreground-mute">/{sum.attempts}</span>
          </p>
          <p className="font-display pb-1 text-3xl leading-none tabular-nums text-accent">{formatPercentage(sum.pct)}</p>
        </div>
        <p className="mt-2 text-xs text-foreground-dim">
          {flagged.length > 0
            ? `The camera wasn’t sure about ${flagged.length} of ${shots.length}. Watch the replay and tap to change any it got wrong. Replays are kept on this phone until you save.`
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

        <ul className="mt-3 min-h-0 flex-1 divide-y divide-line overflow-y-auto rounded-2xl border border-line bg-surface px-3">
          {list.map((s) => {
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
          {hidden > 0 && (
            <li className="py-2">
              <Button variant="ghost" size="sm" block onClick={() => setMore(true)}>
                Show {hidden} more unsure
              </Button>
            </li>
          )}
        </ul>

        <button
          type="button"
          onClick={() => {
            const text = report();
            // A phone that refuses the clipboard still gets the text, to select and copy by hand.
            const fallback = () => setShownReport(text);
            if (!navigator.clipboard?.writeText) return fallback();
            navigator.clipboard.writeText(text).then(() => {
              setShownReport(null);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }, fallback);
          }}
          className="mt-2 self-center text-[11px] font-bold uppercase tracking-wide text-foreground-mute"
        >
          {copied ? "Copied" : "Copy camera report"}
        </button>
        <SessionReviewEntry shots={shots} />
        {shownReport && (
          <textarea
            readOnly
            value={shownReport}
            rows={6}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-2 w-full rounded-lg border border-line bg-surface p-2 text-base text-foreground"
          />
        )}
      </div>

      <div className="mx-auto w-full max-w-md px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
        {error && <p className="mb-2 text-center text-xs text-accent">{error}</p>}
        <div className="flex gap-2.5">
          <Button variant="secondary" onClick={onKeepShooting} disabled={saving} className="flex-1 py-4">
            Keep shooting
          </Button>
          <Button onClick={onSave} disabled={saving || !ready || shots.length === 0} className="flex-[1.6] py-4">
            {saving ? "Saving…" : `Save set · ${sum.makes}/${sum.attempts}`}
          </Button>
        </div>
      </div>

      {watching?.replayId && (
        <ReplayViewer replayId={watching.replayId} title={`Shot ${watching.seq}`} onClose={() => setWatching(null)} />
      )}
    </div>
  );
}
