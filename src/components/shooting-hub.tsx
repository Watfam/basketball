"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  GOAL_KINDS,
  clampGoal,
  describeGoal,
  goalSpec,
  goalState,
  parseGoal,
  type Goal,
  type GoalKind,
} from "@/lib/basketball/goals";
import { primeAlerts, blipShot } from "@/lib/alerts";
import { haptic } from "@/lib/haptics";
import { readDraft, useLocalDraft, writeDraft } from "@/lib/use-local-draft";
import { useWakeLock } from "@/lib/use-wake-lock";
import { SessionSummary, ShotStrip } from "@/components/shot-summary";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/card";
import { Input } from "@/components/ui/field";

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
   * What ends the set (src/lib/basketball/goals.ts); it saves itself the
   * moment the goal is reached. Null: no goal, ended by hand.
   */
  goal?: Goal | null;
  /** Drafts from the first version of this, which only counted shots. */
  stopAt?: number | null;
  /** Bumped on every edit; a session is synced once syncedRev catches up. */
  rev: number;
  syncedRev: number;
};

type SyncState = "saved" | "saving" | "offline";

const SOUND_KEY = "hl:shots:sound";
const GOAL_KEY = "hl:shots:goal";
/** The first version stored only a shot count, here. */
const LEGACY_STOP_AT_KEY = "hl:shots:stopAt";
const recentKey = (playerId: string) => `hl:shots:${playerId}:recent`;
/** How many recent setups are offered as one-tap starts. */
const MAX_RECENT = 4;

type Setup = { label: string; goal: Goal | null };

function draftGoal(d: Draft): Goal | null {
  if (d.goal) return parseGoal(d.goal);
  return d.stopAt ? { kind: "shots", target: d.stopAt } : null;
}

function parseRecent(raw: string | null): Setup[] {
  try {
    const list = JSON.parse(raw ?? "[]") as { label?: unknown; goal?: unknown }[];
    return Array.isArray(list)
      ? list
          .filter((x) => typeof x?.label === "string")
          .map((x) => ({ label: x.label as string, goal: parseGoal(x.goal) }))
          .slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}

const setupKey = (s: Setup) => `${s.label.trim().toLowerCase()}|${s.goal ? describeGoal(s.goal) : ""}`;
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
  averages = {},
  lastSix = {},
  children,
}: {
  playerId: string;
  playerName: string;
  suggestedLabels: string[];
  /** Make % per label over saved sessions, for the summary's comparison. */
  averages?: Record<string, { pct: number; sessions: number }>;
  /** Make % over the newest six sets per label ("*": all of them), shown while picking. */
  lastSix?: Record<string, { pct: number; sessions: number }>;
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
  const [goalRaw, setGoalRaw] = useLocalDraft(GOAL_KEY);
  const [legacyStopAt] = useLocalDraft(LEGACY_STOP_AT_KEY);
  const goal: Goal | null = useMemo(() => {
    if (goalRaw === "none") return null;
    try {
      const g = parseGoal(JSON.parse(goalRaw ?? "null"));
      if (g) return g;
    } catch {
      // Fall through to the old setting.
    }
    const n = Number(legacyStopAt);
    return n > 0 ? clampGoal({ kind: "shots", target: n }) : null;
  }, [goalRaw, legacyStopAt]);
  const setGoal = (g: Goal | null) => setGoalRaw(g ? JSON.stringify(clampGoal(g)) : "none");
  const [recentRaw, setRecentRaw] = useLocalDraft(recentKey(playerId));
  const recent = useMemo(() => parseRecent(recentRaw), [recentRaw]);

  const [labelInput, setLabelInput] = useState("");
  const [syncState, setSyncState] = useState<SyncState>("saved");
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState<{
    label: string | null;
    shots: Shot[];
    startedAt: string;
    endedAt: string;
    goal: Goal | null;
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
          goal: (() => {
            const g = draftGoal(d);
            if (!g) return null;
            // A streak that ran into the 100-shot cap ended, but wasn't reached.
            const state = goalState(g, d.shots, Date.now() - Date.parse(d.startedAt));
            return { kind: g.kind, target: g.target, reached: state.reached && !state.capped };
          })(),
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

  function start(label: string, chosen: Goal | null = goal) {
    // Remembered as a one-tap start for next time, newest first.
    const setup: Setup = { label: label.trim(), goal: chosen };
    if (setup.label || setup.goal) {
      setRecentRaw(
        JSON.stringify([setup, ...recent.filter((x) => setupKey(x) !== setupKey(setup))].slice(0, MAX_RECENT))
      );
    }
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
        goal: chosen,
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
      goal: draftGoal(snapshot),
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

  // A time goal needs a clock that ticks without any taps.
  const activeGoal = draft ? draftGoal(draft) : null;
  const [now, setNow] = useState(() => Date.now());
  const timed = activeGoal?.kind === "time";
  useEffect(() => {
    if (!timed) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [timed]);
  const progress =
    draft && activeGoal ? goalState(activeGoal, draft.shots, Math.max(0, now - Date.parse(draft.startedAt))) : null;

  // The goal is reached: save the set at once. A ref keeps it to one
  // attempt per set; an Undo back below the goal arms it again. A set with
  // no shots (time ran out first) is left for the player to discard.
  const reachedStop = Boolean(progress?.reached && draft && draft.shots.length > 0);
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
          <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-foreground-mute">
            Session saved
          </p>
          {finished.goal && <GoalResult goal={finished.goal} finished={finished} />}
          <div className="mt-4 flex-1">
            <SessionSummary
              label={finished.label}
              startedAt={finished.startedAt}
              endedAt={finished.endedAt}
              shots={finished.shots}
              average={averages[finished.label?.trim() || ""] ?? null}
            />
          </div>
          <div className="mt-8 flex gap-2.5">
            <Button onClick={() => start(finished.label ?? "", finished.goal)} className="flex-1 py-4">
              Shoot again
            </Button>
            <Button variant="secondary" onClick={() => setFinished(null)} className="flex-1 py-4">
              Done
            </Button>
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
            <Button variant="ghost" size="sm" onClick={discard} className="-ml-3">
              Discard
            </Button>
            <span
              className={`text-[11px] font-extrabold uppercase tracking-wide ${
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
            {activeGoal && <span className="text-foreground-mute"> · {describeGoal(activeGoal)}</span>}
          </p>
          {progress && activeGoal && (
            <div className="mt-2">
              <p
                className={`text-sm font-extrabold tabular-nums ${
                  activeGoal.kind === "time" && progress.fraction > 0.85 ? "text-accent" : "text-foreground"
                }`}
              >
                {progress.reached && draft.shots.length === 0 ? "Time's up" : progress.label}
              </p>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-raised">
                <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${progress.fraction * 100}%` }} />
              </div>
            </div>
          )}

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
              <p className="mt-2 text-[11px] text-foreground-mute">Tap a shot to flip it.</p>
            )}
          </div>

          <div className="mt-5">
            <Eyebrow className="mb-1.5">
              Spot (optional — stays until you change it)
            </Eyebrow>
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {ZONES.map((z) => (
                <button
                  key={z.key}
                  type="button"
                  onClick={() => chooseZone(z.key)}
                  aria-pressed={draft.zone === z.key}
                  className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-bold transition-colors ${
                    draft.zone === z.key
                      ? "border-accent bg-accent text-on-accent"
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
                className="h-40 touch-manipulation rounded-3xl bg-accent font-display text-5xl uppercase tracking-wide text-on-accent shadow-lg shadow-[var(--glow)] transition-transform active:scale-[0.97] disabled:opacity-40"
              >
                Make
              </button>
            </div>

            {error && <p className="mt-3 text-center text-xs text-accent">{error}</p>}

            <div className="mt-3 flex gap-2.5">
              <Button
                variant="secondary"
                onClick={undo}
                disabled={draft.shots.length === 0 || ending}
                className="flex-1 py-4"
              >
                Undo
              </Button>
              <Button
                variant="secondary"
                onClick={finish}
                disabled={draft.shots.length === 0 || ending}
                className="flex-[1.6] py-4"
              >
                {ending ? "Saving…" : "End session"}
              </Button>
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
        <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent">New session</p>
        {recent.length > 0 && (
          <div className="mt-3">
            <Eyebrow className="mb-1.5">
              Go again · one tap starts
            </Eyebrow>
            <div className="flex flex-wrap gap-1.5">
              {recent.map((r) => (
                <button
                  key={setupKey(r)}
                  type="button"
                  onClick={() => start(r.label, r.goal)}
                  className="rounded-full bg-accent/10 px-3 py-1.5 text-xs font-bold text-accent ring-1 ring-accent/40"
                >
                  {[r.label || "Shooting", r.goal ? describeGoal(r.goal) : null].filter(Boolean).join(" · ")}
                </button>
              ))}
            </div>
          </div>
        )}

        <h2 className="font-display mt-4 text-3xl uppercase leading-none tracking-wide text-foreground">
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

        <Input
          value={labelInput}
          onChange={(e) => setLabelInput(e.target.value)}
          placeholder="Or name your own"
          maxLength={60}
          className="mt-3"
        />

        {(() => {
          const name = labelInput.trim();
          const six = name ? lastSix[name] : lastSix["*"];
          if (!six) return null;
          return (
            <p className="mt-2.5 text-xs font-semibold text-foreground-dim">
              Last {six.sessions === 1 ? "set" : `${six.sessions} sets`}
              {name ? ` of ${name}` : ""}:{" "}
              <span className="font-extrabold text-accent">{formatPercentage(six.pct)}</span>
            </p>
          );
        })()}

        <div className="mt-5">
          <Eyebrow className="mb-1.5">
            How to count
          </Eyebrow>
          <div className="grid grid-cols-2 gap-2">
            <div
              aria-current="true"
              className="rounded-xl border border-accent bg-accent/10 px-3 py-2.5"
            >
              <p className="text-xs font-extrabold uppercase tracking-wide text-accent">Tap counter</p>
              <p className="mt-0.5 text-[11px] text-foreground-dim">Tap make or miss yourself</p>
            </div>
            <div aria-disabled="true" className="rounded-xl border border-dashed border-line px-3 py-2.5 opacity-70">
              <p className="text-xs font-extrabold uppercase tracking-wide text-foreground-dim">Camera · soon</p>
              <p className="mt-0.5 text-[11px] text-foreground-mute">Phone on a stand counts for you</p>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <Eyebrow className="mb-1.5">
            Goal · the set ends and saves itself
          </Eyebrow>
          <div className="grid grid-cols-5 gap-1 rounded-xl bg-raised p-1">
            {([null, ...GOAL_KINDS.map((k) => k.kind)] as (GoalKind | null)[]).map((kind) => {
              const active = (goal?.kind ?? null) === kind;
              return (
                <button
                  key={kind ?? "none"}
                  type="button"
                  onClick={() => {
                    haptic("tap");
                    if (!kind) setGoal(null);
                    else if (goal?.kind !== kind) setGoal({ kind, target: goalSpec(kind).choices[1] });
                  }}
                  aria-pressed={active}
                  className={`rounded-lg px-1 py-2 text-[11px] font-extrabold uppercase tracking-wide transition-colors ${
                    active ? "bg-surface text-accent shadow-sm" : "text-foreground-dim"
                  }`}
                >
                  {kind ? goalSpec(kind).label : "None"}
                </button>
              );
            })}
          </div>

          {goal && (
            <div className="mt-2.5 flex items-center gap-1.5">
              {goalSpec(goal.kind).choices.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    haptic("tap");
                    setGoal({ kind: goal.kind, target: n });
                  }}
                  aria-pressed={goal.target === n}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold tabular-nums transition-colors ${
                    goal.target === n ? "border-accent bg-accent/10 text-accent" : "border-line text-foreground-dim"
                  }`}
                >
                  {n}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-1">
                {[-1, 1].map((sign) => (
                  <button
                    key={sign}
                    type="button"
                    aria-label={sign < 0 ? "Fewer" : "More"}
                    onClick={() => {
                      haptic("tap");
                      setGoal({ kind: goal.kind, target: goal.target + sign * goalSpec(goal.kind).step });
                    }}
                    className="h-8 w-8 rounded-full border border-line text-sm font-extrabold text-foreground-dim"
                  >
                    {sign < 0 ? "−" : "+"}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="mt-2 text-xs font-bold text-foreground">
            {goal ? describeGoal(goal) : "No goal: end the set yourself"}
            {goal?.kind === "streak" && (
              <span className="font-normal text-foreground-mute"> · stops at 100 shots if it doesn&rsquo;t come</span>
            )}
          </p>
        </div>

        <Button size="lg" block onClick={() => start(labelInput)} className="mt-4">
          Start shooting
        </Button>
        <p className="mt-2.5 text-center text-[11px] text-foreground-mute">
          Keeping the same name each time is what makes your progress line up.
        </p>
      </section>

      {children}
    </div>
  );
}

/** One line on the summary: did the set reach its goal, and how. */
function GoalResult({
  goal,
  finished,
}: {
  goal: Goal;
  finished: { shots: Shot[]; startedAt: string; endedAt: string };
}) {
  const elapsed = Date.parse(finished.endedAt) - Date.parse(finished.startedAt);
  const state = goalState(goal, finished.shots, elapsed);
  const n = finished.shots.length;
  const text = !state.reached
    ? `${describeGoal(goal)} · ended early, ${state.label}`
    : goal.kind === "makes"
      ? `${describeGoal(goal)} · done in ${n} shots`
      : goal.kind === "streak"
        ? state.capped
          ? `${describeGoal(goal)} · not this time, stopped at ${n} shots`
          : `${describeGoal(goal)} · got it on shot ${n}`
        : goal.kind === "time"
          ? `${describeGoal(goal)} · ${n} shots`
          : `${describeGoal(goal)} · done`;
  return (
    <p className={`mt-1 text-sm font-extrabold ${state.reached && !state.capped ? "text-accent" : "text-foreground-dim"}`}>
      {text}
    </p>
  );
}
