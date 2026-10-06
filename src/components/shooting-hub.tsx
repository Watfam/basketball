"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { syncShotSession, deleteShotSession } from "@/app/actions";
import {
  ZONES,
  addShot,
  formatPercentage,
  summarize,
  toggleShot,
  undoLastShot,
  type Shot,
  type ZoneKey,
} from "@/lib/basketball/shooting";
import { primeAlerts, blipShot } from "@/lib/alerts";
import { haptic } from "@/lib/haptics";
import { readDraft, useLocalDraft, writeDraft } from "@/lib/use-local-draft";
import { useWakeLock } from "@/lib/use-wake-lock";
import { SessionSummary, ShotStrip } from "@/components/shot-summary";

/**
 * The session lives on the phone first.
 *
 * Every tap is written to local storage synchronously and a snapshot is
 * pushed to the server in the background. So a dropped signal, a locked
 * screen or a closed tab costs nothing: the session is still there when
 * the app reopens, and the next sync (idempotent on shot number) brings
 * the server up to date. Nothing waits on the network to register a tap.
 */

type Draft = {
  v: 1;
  sessionId: string | null;
  label: string;
  startedAt: string;
  shots: Shot[];
  /** Sticky: stays on the last chosen spot until changed. */
  zone: ZoneKey | null;
  /**
   * The set ends and saves itself at this many shots, so nobody has to
   * walk back to the phone to stop it. Missing in drafts from before it
   * existed, which simply never stop on their own.
   */
  stopAt?: number | null;
  /** Bumped on every edit; a session is synced once syncedRev catches up. */
  rev: number;
  syncedRev: number;
};

type SyncState = "saved" | "saving" | "offline";

const SOUND_KEY = "hl:shots:sound";
const STOP_AT_KEY = "hl:shots:stopAt";
const STOP_AT_CHOICES = [25, 50, 100];
const STOP_AT_MAX = 500;
const draftKey = (playerId: string) => `hl:shots:${playerId}:draft`;

const DEFAULT_LABELS = [
  "Free throws",
  "Three-pointers",
  "Mid-range",
  "Catch and shoot",
  "Off the dribble",
  "Game speed",
];

function parseDraft(raw: string | null): Draft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Draft;
    if (d?.v !== 1 || !Array.isArray(d.shots) || typeof d.startedAt !== "string") return null;
    return d;
  } catch {
    return null;
  }
}

export function ShootingHub({
  playerId,
  playerName,
  suggestedLabels,
  children,
}: {
  playerId: string;
  playerName: string;
  suggestedLabels: string[];
  /** The saved-session history, rendered on the server and shown while idle. */
  children: React.ReactNode;
}) {
  const router = useRouter();
  const key = draftKey(playerId);

  const [raw] = useLocalDraft(key);
  const draft = useMemo(() => parseDraft(raw), [raw]);
  const [soundRaw, setSoundRaw] = useLocalDraft(SOUND_KEY);
  const sound = soundRaw === "on";
  // Remembered between sessions: the same set size is the usual habit.
  const [stopAtRaw, setStopAtRaw] = useLocalDraft(STOP_AT_KEY);
  const stopAt = stopAtRaw && Number(stopAtRaw) > 0 ? Math.min(STOP_AT_MAX, Math.round(Number(stopAtRaw))) : null;

  const [labelInput, setLabelInput] = useState("");
  const [syncState, setSyncState] = useState<SyncState>("saved");
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState<{
    label: string | null;
    shots: Shot[];
    startedAt: string;
    endedAt: string;
  } | null>(null);

  const inFlight = useRef(false);

  // The screen stays on while a session is open — a shooter's hands are
  // busy and the phone is usually propped up, not held.
  useWakeLock(draft !== null);

  /** Apply an edit to whatever is stored right now, not to a stale render. */
  const edit = useCallback(
    (fn: (d: Draft) => Draft) => {
      const current = parseDraft(readDraft(key));
      if (!current) return;
      const next = fn(current);
      writeDraft(key, JSON.stringify({ ...next, rev: current.rev + 1 }));
    },
    [key]
  );

  const runSync = useCallback(
    async (ended: boolean): Promise<boolean> => {
      if (inFlight.current) return false;
      const d = parseDraft(readDraft(key));
      if (!d) return false;

      inFlight.current = true;
      // Once a sync has failed, stay "offline" through the retries rather
      // than flickering to "saving" every few seconds — the phone can't
      // reach the server, and saying otherwise is a small lie.
      setSyncState((prev) => (prev === "offline" ? "offline" : "saving"));
      try {
        const res = await syncShotSession({
          playerId,
          sessionId: d.sessionId,
          label: d.label || null,
          startedAt: d.startedAt,
          ended,
          shots: d.shots.map((s) => ({
            seq: s.seq,
            made: s.made,
            zone: s.zone,
            source: s.source,
            detectedMade: s.detectedMade,
          })),
        });
        if (res.error || !res.sessionId) throw new Error(res.error ?? "Sync failed");

        if (!ended) {
          // Re-read: the player may have kept shooting while this was in
          // flight, and those taps must not be marked as saved.
          const cur = parseDraft(readDraft(key));
          if (cur) {
            writeDraft(
              key,
              JSON.stringify({
                ...cur,
                sessionId: res.sessionId,
                syncedRev: Math.max(cur.syncedRev, d.rev),
              })
            );
          }
        }
        setSyncState("saved");
        return true;
      } catch {
        setSyncState("offline");
        return false;
      } finally {
        inFlight.current = false;
      }
    },
    [key, playerId]
  );

  // Background sync: a steady beat while there is something unsaved, plus
  // an immediate attempt when the app is hidden or the signal returns.
  const hasDraft = draft !== null;
  useEffect(() => {
    if (!hasDraft) return;
    const tick = () => {
      const d = parseDraft(readDraft(key));
      if (d && d.rev !== d.syncedRev) void runSync(false);
    };
    const id = setInterval(tick, 4000);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", tick);
    };
  }, [hasDraft, key, runSync]);

  function start(label: string) {
    primeAlerts();
    haptic("tap");
    setError(null);
    setFinished(null);
    writeDraft(
      key,
      JSON.stringify({
        v: 1,
        sessionId: null,
        label: label.trim(),
        startedAt: new Date().toISOString(),
        shots: [],
        zone: null,
        stopAt,
        rev: 1,
        syncedRev: 0,
      } satisfies Draft)
    );
  }

  function log(made: boolean) {
    haptic("tap");
    if (sound) blipShot(made);
    edit((d) => ({ ...d, shots: addShot(d.shots, made, d.zone) }));
  }

  function undo() {
    haptic("tap");
    edit((d) => ({ ...d, shots: undoLastShot(d.shots) }));
  }

  function flip(seq: number) {
    haptic("tap");
    edit((d) => ({ ...d, shots: toggleShot(d.shots, seq) }));
  }

  function chooseZone(zone: ZoneKey) {
    haptic("tap");
    edit((d) => ({ ...d, zone: d.zone === zone ? null : zone }));
  }

  async function finish() {
    if (!draft || draft.shots.length === 0) return;
    setEnding(true);
    setError(null);

    // Let a sync already under way land first rather than racing it.
    for (let i = 0; i < 50 && inFlight.current; i += 1) {
      await new Promise((r) => setTimeout(r, 100));
    }

    const snapshot = parseDraft(readDraft(key));
    if (!snapshot) {
      setEnding(false);
      return;
    }

    const ok = await runSync(true);
    if (!ok) {
      setError(
        "Couldn't save right now. Your session is safe on this phone — try again when you have signal."
      );
      setEnding(false);
      return;
    }

    haptic("success");
    setFinished({
      label: snapshot.label || null,
      shots: snapshot.shots,
      startedAt: snapshot.startedAt,
      endedAt: new Date().toISOString(),
    });
    writeDraft(key, null);
    setEnding(false);
    router.refresh();
  }

  async function discard() {
    if (!draft) return;
    const hasShots = draft.shots.length > 0;
    if (hasShots && !window.confirm(`Throw away these ${draft.shots.length} shots?`)) return;
    haptic("tap");
    const sessionId = draft.sessionId;
    writeDraft(key, null);
    setError(null);
    if (sessionId) {
      await deleteShotSession(sessionId, playerId);
      router.refresh();
    }
  }

  // The set is over: save it the moment the last shot is in. A ref keeps it
  // to one attempt per set; Undo below the line arms it again.
  const reachedStop = Boolean(draft?.stopAt && draft.shots.length >= draft.stopAt);
  const autoFinished = useRef(false);
  useEffect(() => {
    if (!reachedStop) {
      autoFinished.current = false;
      return;
    }
    if (autoFinished.current || ending) return;
    autoFinished.current = true;
    void finish();
    // finish reads everything it needs from storage, not from this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reachedStop, ending]);

  // ---- Just finished: the summary --------------------------------------
  if (finished) {
    return (
      <div className="theme-dark court-glow fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] text-foreground">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-foreground-mute">
            Session saved
          </p>
          <div className="mt-4 flex-1">
            <SessionSummary
              label={finished.label}
              startedAt={finished.startedAt}
              endedAt={finished.endedAt}
              shots={finished.shots}
            />
          </div>
          <div className="mt-8 flex gap-2.5">
            <button
              type="button"
              onClick={() => start(finished.label ?? "")}
              className="flex-1 rounded-xl bg-accent py-4 text-[11px] font-extrabold uppercase tracking-wide text-white"
            >
              Shoot again
            </button>
            <button
              type="button"
              onClick={() => setFinished(null)}
              className="flex-1 rounded-xl bg-raised py-4 text-[11px] font-extrabold uppercase tracking-wide text-foreground-dim"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- In a session: the counter ---------------------------------------
  if (draft) {
    const sum = summarize(draft.shots);
    const syncText =
      syncState === "offline"
        ? "Offline · kept on this phone"
        : syncState === "saving"
          ? "Saving…"
          : "Saved";

    return (
      <div className="theme-dark court-glow fixed inset-0 z-50 flex select-none flex-col overflow-y-auto bg-background px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] text-foreground">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={discard}
              className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-dim transition-colors hover:text-foreground"
            >
              Discard
            </button>
            <span
              className={`text-[10px] font-extrabold uppercase tracking-wide ${
                syncState === "offline" ? "text-accent" : "text-foreground-mute"
              }`}
              aria-live="polite"
            >
              {syncText}
            </span>
            <button
              type="button"
              onClick={() => {
                primeAlerts();
                setSoundRaw(sound ? "off" : "on");
              }}
              aria-pressed={sound}
              className={`text-[11px] font-extrabold uppercase tracking-[0.14em] transition-colors ${
                sound ? "text-accent" : "text-foreground-dim hover:text-foreground"
              }`}
            >
              Sound {sound ? "on" : "off"}
            </button>
          </div>

          <p className="mt-6 text-[11px] font-extrabold uppercase tracking-[0.14em] text-accent">
            {draft.label || "Shooting session"} · {playerName}
            {draft.stopAt ? (
              <span className="text-foreground-mute">
                {" "}
                · {Math.min(draft.shots.length, draft.stopAt)} of {draft.stopAt}
              </span>
            ) : null}
          </p>

          <div className="mt-2 flex items-end gap-4">
            <p className="font-display text-8xl leading-[0.85] tabular-nums text-foreground">
              {sum.makes}
              <span className="text-foreground-mute">/{sum.attempts}</span>
            </p>
            <p className="font-display pb-1 text-4xl leading-none tabular-nums text-accent">
              {formatPercentage(sum.pct)}
            </p>
          </div>
          <p className="mt-2 h-4 text-[11px] font-bold uppercase tracking-wide text-foreground-mute">
            {sum.currentStreak >= 3
              ? `${sum.currentStreak} in a row`
              : sum.currentStreak <= -4
                ? `${-sum.currentStreak} misses in a row — reset, breathe`
                : ""}
          </p>

          <div className="mt-4 min-h-[2rem]">
            <ShotStrip shots={draft.shots} onToggle={flip} limit={20} />
            {draft.shots.length > 0 && (
              <p className="mt-2 text-[10px] text-foreground-mute">Tap a shot to flip it.</p>
            )}
          </div>

          <div className="mt-5">
            <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">
              Spot (optional — stays until you change it)
            </p>
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {ZONES.map((z) => (
                <button
                  key={z.key}
                  type="button"
                  onClick={() => chooseZone(z.key)}
                  aria-pressed={draft.zone === z.key}
                  className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-bold transition-colors ${
                    draft.zone === z.key
                      ? "border-accent bg-accent text-white"
                      : "border-line bg-raised text-foreground-dim"
                  }`}
                >
                  {z.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-auto pt-6">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => log(false)}
                disabled={ending}
                className="h-40 touch-manipulation rounded-3xl border border-line bg-raised font-display text-5xl uppercase tracking-wide text-foreground-dim transition-transform active:scale-[0.97] disabled:opacity-40"
              >
                Miss
              </button>
              <button
                type="button"
                onClick={() => log(true)}
                disabled={ending}
                className="h-40 touch-manipulation rounded-3xl bg-accent font-display text-5xl uppercase tracking-wide text-white shadow-lg shadow-[var(--glow)] transition-transform active:scale-[0.97] disabled:opacity-40"
              >
                Make
              </button>
            </div>

            {error && <p className="mt-3 text-center text-xs text-accent">{error}</p>}

            <div className="mt-3 flex gap-2.5">
              <button
                type="button"
                onClick={undo}
                disabled={draft.shots.length === 0 || ending}
                className="flex-1 rounded-xl bg-raised py-4 text-[11px] font-extrabold uppercase tracking-wide text-foreground-dim transition-opacity disabled:opacity-30"
              >
                Undo
              </button>
              <button
                type="button"
                onClick={finish}
                disabled={draft.shots.length === 0 || ending}
                className="flex-[1.6] rounded-xl border border-accent py-4 text-[11px] font-extrabold uppercase tracking-wide text-accent transition-colors hover:bg-accent/10 disabled:opacity-30"
              >
                {ending ? "Saving…" : "End session"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Idle: start a session, then the history -------------------------
  const labels = [...new Set([...DEFAULT_LABELS, ...suggestedLabels])];

  return (
    <div className="space-y-6">
      <section className="panel-lit rounded-3xl border border-line bg-surface p-6">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-accent">New session</p>
          <p className="truncate text-[11px] font-bold text-foreground-dim">
            Shooting as <span className="text-foreground">{playerName}</span> ·{" "}
            <Link href="/" className="font-extrabold uppercase tracking-wide text-accent">
              Switch
            </Link>
          </p>
        </div>
        <h2 className="font-display mt-1.5 text-3xl uppercase leading-none tracking-wide text-foreground">
          What are you shooting?
        </h2>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {labels.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => {
                haptic("tap");
                setLabelInput((prev) => (prev === l ? "" : l));
              }}
              aria-pressed={labelInput === l}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                labelInput === l
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-line text-foreground-dim"
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        <input
          value={labelInput}
          onChange={(e) => setLabelInput(e.target.value)}
          placeholder="Or name your own"
          maxLength={60}
          className="mt-3 w-full rounded-lg border border-line bg-[var(--raised)] px-3 py-2.5 text-sm text-foreground placeholder:text-foreground-mute focus:border-accent focus:outline-none"
        />

        <div className="mt-4">
          <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">
            Stop at · the set ends and saves itself
          </p>
          <div className="flex items-center gap-1.5">
            {[null, ...STOP_AT_CHOICES].map((n) => (
              <button
                key={n ?? "off"}
                type="button"
                onClick={() => {
                  haptic("tap");
                  setStopAtRaw(n ? String(n) : null);
                }}
                aria-pressed={stopAt === n}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold tabular-nums transition-colors ${
                  stopAt === n ? "border-accent bg-accent/10 text-accent" : "border-line text-foreground-dim"
                }`}
              >
                {n ?? "No limit"}
              </button>
            ))}
            {stopAt && (
              <div className="ml-auto flex items-center gap-1">
                {[-5, 5].map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-label={d < 0 ? "Five fewer" : "Five more"}
                    onClick={() => {
                      haptic("tap");
                      setStopAtRaw(String(Math.min(STOP_AT_MAX, Math.max(5, stopAt + d))));
                    }}
                    className="h-8 w-8 rounded-full border border-line text-sm font-extrabold text-foreground-dim"
                  >
                    {d < 0 ? "−" : "+"}
                  </button>
                ))}
              </div>
            )}
          </div>
          {stopAt && !STOP_AT_CHOICES.includes(stopAt) && (
            <p className="mt-1.5 text-xs font-bold tabular-nums text-accent">{stopAt} shots</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => start(labelInput)}
          className="mt-4 w-full rounded-xl bg-accent py-3.5 text-sm font-extrabold uppercase tracking-[0.12em] text-white shadow-lg shadow-[var(--glow)] transition-colors hover:bg-accent-hover active:scale-[0.99]"
        >
          Start shooting
        </button>
        <p className="mt-2.5 text-center text-[11px] text-foreground-mute">
          Keeping the same name each time is what makes your progress line up.
        </p>
      </section>

      {children}
    </div>
  );
}
