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
import { CameraStage } from "@/components/camera-stage";
import { useCameraCounter } from "@/lib/vision/use-camera-counter";
import { MODEL_VERSION, RULE_VERSION } from "@/lib/vision/lab-calls";
import { CAMERA_SWITCH_KEY } from "@/lib/vision/camera-switch";
import { clearReplays } from "@/lib/vision/replay-store";
import { ShotReview } from "@/components/shot-review";
import { SoundCheck } from "@/components/sound-controls";
import { liveCall, type ShotCall } from "@/lib/vision/shotRules";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { clockStart, draftGoal, draftKey, parseDraft, type Draft } from "@/lib/basketball/shot-draft";
import { buildCameraReport, formatCameraReport } from "@/lib/basketball/camera-report";

/**
 * The session lives on the phone first.
 *
 * Every tap is written to local storage synchronously and a snapshot is
 * pushed to the server in the background. So a dropped signal, a locked
 * screen or a closed tab costs nothing: the session is still there when
 * the app reopens, and the next sync (idempotent on shot number) brings
 * the server up to date. Nothing waits on the network to register a tap.
 */

type SyncState = "saved" | "saving" | "offline";

const SOUND_KEY = "hl:shots:sound";
/** "camera" or "tap": the last way of counting chosen. */
const COUNT_KEY = "hl:shots:count";
const GOAL_KEY = "hl:shots:goal";
/** The first version stored only a shot count, here. */
const LEGACY_STOP_AT_KEY = "hl:shots:stopAt";
const recentKey = (playerId: string) => `hl:shots:${playerId}:recent`;
/** How many recent setups are offered as one-tap starts. */
const MAX_RECENT = 4;

type Setup = { label: string; goal: Goal | null };

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

const DEFAULT_LABELS = [
  "Free throws",
  "Three-pointers",
  "Mid-range",
  "Catch and shoot",
  "Off the dribble",
  "Game speed",
];

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

  const [switchRaw] = useLocalDraft(CAMERA_SWITCH_KEY);
  const cameraAllowed = switchRaw !== "off";
  const [countRaw, setCountRaw] = useLocalDraft(COUNT_KEY);
  const countWithCamera = cameraAllowed && countRaw === "camera";
  // The last call, shown big for a moment: the shooter is 15 feet away.
  const [lastCall, setLastCall] = useState<{ made: boolean; flagged: boolean; at: number } | null>(null);

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

  /** A shot the camera decided: added like a tap, marked as the camera's. */
  const onCameraShot = useCallback(
    (call: ShotCall, replayId: string) => {
      const made = liveCall(call) === "make";
      // The call's clock is performance.now(); the set's is the wall clock.
      const wallAt = Date.now() - (performance.now() - call.firstMs);
      edit((d) => ({
        ...d,
        ...(d.clockStartedAt === null ? { clockStartedAt: new Date(wallAt).toISOString() } : {}),
        shots: addShot(d.shots, made, d.zone, "camera", made, {
          flagged: call.flagged,
          flagReasons: call.flagReasons,
          tMs: Math.max(0, wallAt - Date.parse(d.startedAt)),
          replayId,
        }),
      }));
      if (readDraft(SOUND_KEY) === "on") blipShot(made);
      haptic(made ? "success" : "tap");
      setLastCall({ made, flagged: call.flagged, at: Date.now() });
    },
    [edit]
  );
  const camera = useCameraCounter({ onShot: onCameraShot });
  const reviewing = Boolean(draft?.mode === "camera" && draft.reviewing);
  // How the camera ran this set: speed and size, kept as it goes and noted in the set when it ends.
  const runRef = useRef({ n: 0, sum: 0, min: Number.POSITIVE_INFINITY, slowSeen: false, scale: null as number | null, ballWidth: null as number | null });
  useEffect(() => {
    const h = camera.health;
    if (!h) return;
    const r = runRef.current;
    r.n += 1;
    r.sum += h.fps;
    r.min = Math.min(r.min, h.fps);
    if (h.slow) r.slowSeen = true;
    if (h.sizing?.kind === "set") {
      r.scale = h.sizing.scale;
      r.ballWidth = h.sizing.ballWidth;
    }
  }, [camera.health]);
  // Remember where the rim was once counting starts, for the saved set.
  useEffect(() => {
    if (camera.phase !== "counting") return;
    try {
      const aim = JSON.parse(readDraft("hl:lab:rim") ?? "null") as { x: number; y: number } | null;
      if (aim) edit((d) => ({ ...d, camera: { rimX: aim.x, rimY: aim.y } }));
    } catch {
      // No aim saved; the set is kept without it.
    }
  }, [camera.phase, edit]);
  useEffect(() => {
    if (!lastCall) return;
    const id = setTimeout(() => setLastCall(null), 1800);
    return () => clearTimeout(id);
  }, [lastCall]);

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
            const c0 = clockStart(d);
            const state = goalState(g, d.shots, c0 === null ? 0 : Date.now() - c0);
            return { kind: g.kind, target: g.target, reached: state.reached && !state.capped };
          })(),
          shots: d.shots.map((s) => ({
            seq: s.seq,
            made: s.made,
            zone: s.zone,
            source: s.source,
            detectedMade: s.detectedMade,
            flagged: s.flagged,
            tMs: s.tMs ?? null,
            addedByHand: s.addedByHand,
          })),
          camera:
            d.mode === "camera" && d.camera
              ? { ruleVersion: RULE_VERSION, modelVersion: MODEL_VERSION, rimX: d.camera.rimX, rimY: d.camera.rimY, report: currentReport(d) }
              : null,
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
        clockStartedAt: null,
        shots: [],
        zone: null,
        goal: chosen,
        ...(countWithCamera ? { mode: "camera" as const, camera: null } : {}),
        rev: 1,
        syncedRev: 0,
      } satisfies Draft)
    );
    // Replays belong to one set; anything left from an earlier one goes.
    void clearReplays();
    if (countWithCamera) {
      // Calls are heard, not watched: sound on for a camera set.
      setSoundRaw("on");
      runRef.current = { n: 0, sum: 0, min: Number.POSITIVE_INFINITY, slowSeen: false, scale: null, ballWidth: null };
      // The tap on Start shooting is the gesture that lets the camera open, so open it now: no second "Open the camera" step.
      void camera.start();
    }
  }

  function log(made: boolean) {
    haptic("tap");
    if (sound) blipShot(made);
    // In a camera set, a tap is a shot the camera missed.
    edit((d) => ({
      ...d,
      ...(d.clockStartedAt === null ? { clockStartedAt: new Date().toISOString() } : {}),
      shots: addShot(d.shots, made, d.zone, "manual", null, d.mode === "camera" ? { addedByHand: true } : {}),
    }));
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

  /** End a camera set: decide the shots still in the air, then review the calls before saving. */
  function endCameraSet() {
    camera.stop();
    const d = parseDraft(readDraft(key));
    // Always a look before saving, on a screen of its own: the unsure calls up front, every shot a tap away.
    if (d && d.shots.length > 0) {
      const r = runRef.current;
      edit((x) => ({
        ...x,
        reviewing: true,
        cameraStats: r.n > 0 ? { avgFps: r.sum / r.n, minFps: r.min, slowSeen: r.slowSeen, scale: r.scale, ballWidth: r.ballWidth } : x.cameraStats,
      }));
    } else void finish();
  }

  /** The phone is too slow for the camera: carry on this set by tapping, keeping what is counted so far. */
  function switchToTaps() {
    haptic("tap");
    camera.stop();
    edit((d) => ({ ...d, mode: undefined, camera: null }));
    void clearReplays();
  }

  /** Back from the review to the counter (ended too soon). */
  function keepShooting() {
    haptic("tap");
    edit((d) => ({ ...d, reviewing: false }));
  }

  /** The numbers behind a camera set, from this phone's draft. */
  function currentReport(d: Draft) {
    let aim: string | null = null;
    try {
      aim = readDraft("hl:lab:rim");
    } catch {
      // No aim saved.
    }
    return buildCameraReport(d, {
      ruleVersion: RULE_VERSION,
      modelVersion: MODEL_VERSION,
      build: process.env.NEXT_PUBLIC_BUILD ?? "?",
      aim,
      phone: typeof navigator === "undefined" ? "?" : navigator.userAgent,
    });
  }

  /** The same numbers as text, to paste into a message when something looks off. */
  function cameraReport(): string {
    const d = parseDraft(readDraft(key));
    if (!d) return "";
    return formatCameraReport(currentReport(d), { shots: d.shots.length, makes: d.shots.filter((s) => s.made).length });
  }

  async function finish() {
    if (camera.phase !== "idle") camera.stop();
    const fresh = parseDraft(readDraft(key));
    if (!fresh || fresh.shots.length === 0) return;
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
      startedAt: new Date(clockStart(snapshot) ?? Date.parse(snapshot.startedAt)).toISOString(),
      endedAt: new Date().toISOString(),
      goal: draftGoal(snapshot),
    });
    writeDraft(key, null);
    // Saved: the replays have done their job and are deleted from the phone.
    void clearReplays();
    setEnding(false);
    router.refresh();
  }

  async function discard() {
    if (!draft) return;
    const hasShots = draft.shots.length > 0;
    if (hasShots && !window.confirm(`Throw away these ${draft.shots.length} shots?`)) return;
    camera.stop();
    void clearReplays();
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
  // A camera set shows its clock whether or not it has a time goal.
  const ticking = timed || draft?.mode === "camera";
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [ticking]);
  const progress =
    draft && activeGoal
      ? goalState(activeGoal, draft.shots, (() => { const c0 = clockStart(draft); return c0 === null ? 0 : Math.max(0, now - c0); })())
      : null;

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
    // A camera set still gets its calls reviewed before it saves.
    // (Out of the effect's own pass, like finish's awaits, so it doesn't set state mid-render.)
    if (parseDraft(readDraft(key))?.mode === "camera") setTimeout(endCameraSet, 0);
    else void finish();
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

  // ---- A camera set that has ended: review it before it is saved --------
  if (draft && reviewing) {
    return (
      <ShotReview
        shots={draft.shots}
        label={draft.label}
        playerName={playerName}
        saving={ending}
        error={error}
        onFlip={flip}
        onSave={() => void finish()}
        onKeepShooting={keepShooting}
        report={cameraReport}
      />
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

    if (draft.mode === "camera") {
      const c0 = clockStart(draft);
      return (
        <CameraStage
          camera={camera}
          shots={draft.shots}
          label={draft.label}
          playerName={playerName}
          goal={activeGoal}
          elapsedMs={c0 === null ? null : Math.max(0, now - c0)}
          lastCall={lastCall}
          sound={sound}
          onToggleSound={() => setSoundRaw(sound ? "off" : "on")}
          zone={draft.zone}
          onZone={chooseZone}
          syncText={syncText}
          syncOffline={syncState === "offline"}
          error={error}
          ending={ending}
          onLog={log}
          onUndo={undo}
          onFlip={flip}
          onEnd={endCameraSet}
          onDiscard={discard}
          onUseTaps={switchToTaps}
        />
      );
    }

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
                {progress.reached && draft.shots.length === 0
                  ? "Time's up"
                  : activeGoal.kind === "time" && clockStart(draft) === null
                    ? `${progress.label} · starts with your first shot`
                    : progress.label}
              </p>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-raised">
                <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${progress.fraction * 100}%` }} />
              </div>
            </div>
          )}

          <div className="relative mt-2 flex items-end gap-4">
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
              <p className="mt-2 text-[11px] text-foreground-mute">
                Tap a shot to flip it.
              </p>
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

        {cameraAllowed && (
        <div className="mt-5">
          <Eyebrow className="mb-1.5">
            How to count
          </Eyebrow>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { id: "tap", title: "Tap counter", sub: "Tap make or miss yourself" },
                { id: "camera", title: "Camera", sub: "Phone on a stand counts; you check the unsure ones" },
              ] as const
            ).map((opt) => {
              const selected = opt.id === "camera" ? countWithCamera : !countWithCamera;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    haptic("tap");
                    setCountRaw(opt.id);
                  }}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    selected ? "border-accent bg-accent/10" : "border-line"
                  }`}
                >
                  <p className={`text-xs font-extrabold uppercase tracking-wide ${selected ? "text-accent" : "text-foreground-dim"}`}>
                    {opt.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-foreground-dim">{opt.sub}</p>
                </button>
              );
            })}
          </div>
        </div>
        )}

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
        <SoundCheck className="mt-3 flex flex-col items-center" />
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
