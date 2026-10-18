"use client";

import { useEffect, useRef, useState } from "react";
import type { useCameraCounter } from "@/lib/vision/use-camera-counter";
import { ZONES, type Shot, type ZoneKey } from "@/lib/basketball/shooting";
import type { Goal } from "@/lib/basketball/goals";
import { describeGoal } from "@/lib/basketball/goals";
import { scoreBug, type ScoreBug } from "@/lib/basketball/score-bug";
import { haptic } from "@/lib/haptics";
import { primeAlerts } from "@/lib/alerts";
import { containedRect } from "@/lib/vision/contain";
import { AimCanvas } from "@/components/aim-canvas";
import { TouchDiag } from "@/components/touch-diag";
import { BrandMark } from "@/components/brand";
import { Button } from "@/components/ui/button";

type Camera = ReturnType<typeof useCameraCounter>;

export type StageProps = {
  camera: Camera;
  shots: Shot[];
  label: string;
  playerName: string;
  goal: Goal | null;
  /** Ms since the set's first shot; null until it has one. */
  elapsedMs: number | null;
  lastCall: { made: boolean; flagged: boolean; at: number } | null;
  sound: boolean;
  onToggleSound: () => void;
  zone: ZoneKey | null;
  onZone: (z: ZoneKey) => void;
  syncText: string;
  syncOffline: boolean;
  /** A problem saving, from the hub. */
  error: string | null;
  ending: boolean;
  onLog: (made: boolean) => void;
  onUndo: () => void;
  onFlip: (seq: number) => void;
  onEnd: () => void;
  onDiscard: () => void;
  /** Give up on the camera for this set and count by tapping, keeping any shots so far. */
  onUseTaps: () => void;
};

/**
 * The camera set's screen: the live picture with a score bar over its lower
 * third on a sideways phone (the phone sits on a stand, so the picture gets the
 * whole screen), and the same pieces stacked under the picture when held upright.
 */
export function CameraStage(props: StageProps) {
  const { camera, shots, goal, elapsedMs, lastCall } = props;
  const { phase, videoRef } = camera;
  const bug = scoreBug(shots, goal, elapsedMs);
  const [menu, setMenu] = useState(false);
  const [diag, setDiag] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const aiming = phase === "aiming" || phase === "starting";
  // An iPhone turned sideways in an installed app can be left with the page scrolled up by a status bar (-59), after which the screen is drawn
  // that far from where it answers touches (the tag, Start). Nothing here needs the page to scroll, so it is put back whenever it moves.
  useEffect(() => {
    const html = document.documentElement, body = document.body;
    const before = [html.style.overscrollBehavior, body.style.overscrollBehavior];
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";
    const level = () => {
      const vv = window.visualViewport;
      if (window.scrollY !== 0 || window.scrollX !== 0 || (vv && (vv.offsetTop !== 0 || vv.offsetLeft !== 0))) window.scrollTo(0, 0);
    };
    level();
    const id = setInterval(level, 300);
    const events: [EventTarget | undefined, string][] = [[window, "scroll"], [window, "resize"], [window, "orientationchange"], [window.visualViewport ?? undefined, "scroll"], [window.visualViewport ?? undefined, "resize"]];
    events.forEach(([t, n]) => t?.addEventListener(n, level));
    window.addEventListener("pointerdown", level, true);
    return () => {
      clearInterval(id);
      events.forEach(([t, n]) => t?.removeEventListener(n, level));
      window.removeEventListener("pointerdown", level, true);
      html.style.overscrollBehavior = before[0];
      body.style.overscrollBehavior = before[1];
    };
  }, []);
  const showSetup = phase === "idle" || phase === "error";

  return (
    <div className="theme-dark fixed inset-0 z-50 flex select-none flex-col overflow-y-auto bg-background text-foreground landscape:overflow-hidden">
      {/* The picture. Sideways it fills the screen; upright it is a 16:9 strip at the top. */}
      <div className="relative w-full shrink-0 bg-black pt-[env(safe-area-inset-top)] landscape:absolute landscape:inset-0 landscape:pt-0">
        <div className="relative aspect-video w-full landscape:aspect-auto landscape:h-full">
          <video
            ref={videoRef}
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-contain"
          />
          {aiming && (
            <AimCanvas
              videoRef={videoRef}
              getAim={camera.getAim}
              onAim={camera.aimAt}
              active={phase === "aiming"}
              shieldRef={panelRef}
              onSecret={() => setDiag((d) => !d)}
              tone={camera.find.kind === "strong" || camera.find.kind === "fair" ? "found" : "hand"}
            />
          )}
          {phase === "starting" && (
            <p className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-foreground-dim">
              Opening the camera…
            </p>
          )}
          {phase === "counting" && <RimCheck camera={camera} />}
          {showSetup && <SetupCard error={camera.error} start={camera.start} />}
          {lastCall && <CallFlash call={lastCall} />}
          <TopBar {...props} aiming={aiming} menuOpen={menu} setMenu={setMenu} onDiag={() => setDiag((d) => !d)} />
          {diag && <TouchDiag />}
        </div>
      </div>

      {aiming ? (
        <AimPanel camera={camera} panelRef={panelRef} bug={bug} onDiscard={props.onDiscard} onUseTaps={props.onUseTaps} onEnd={props.onEnd} ending={props.ending} />
      ) : (
        <>
          <Bar {...props} bug={bug} />
          <Dots shots={shots} onFlip={props.onFlip} />
          <Controls {...props} />
        </>
      )}

      {menu && <Menu {...props} close={() => setMenu(false)} />}
    </div>
  );
}

/* ---- The picture's overlays -------------------------------------------- */

function TopBar({ camera, sound, syncText, syncOffline, setMenu, menuOpen, aiming, onDiag }: StageProps & { aiming: boolean; menuOpen: boolean; setMenu: (v: boolean) => void; onDiag: () => void }) {
  const status = cameraStatus(camera);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearHold = () => { if (hold.current) clearTimeout(hold.current); hold.current = null; };
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-2 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] landscape:pt-[max(0.5rem,env(safe-area-inset-top))]">
      <span
        role="status"
        onPointerDown={() => { clearHold(); hold.current = setTimeout(onDiag, 900); }}
        onPointerUp={clearHold}
        onPointerCancel={clearHold}
        onPointerLeave={clearHold}
        className={`pointer-events-auto min-w-0 truncate rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide ${
          status.warn ? "bg-danger text-on-accent" : "bg-background/70 text-foreground-dim"
        }`}
      >
        {status.text}
      </span>
      <span className={`flex items-center gap-2 ${aiming ? "hidden" : ""}`}>
        <span
          aria-live="polite"
          className={`rounded-full bg-background/70 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${
            syncOffline ? "text-accent" : "text-foreground-mute"
          }`}
        >
          {syncText}
        </span>
        <button
          type="button"
          aria-label="More: sound, spot, undo, discard"
          aria-expanded={menuOpen}
          onClick={() => {
            haptic("tap");
            setMenu(!menuOpen);
          }}
          className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full bg-background/70 text-lg font-extrabold leading-none text-foreground"
        >
          <span aria-hidden="true">⋯</span>
          <span className="sr-only">{sound ? "Sound on" : "Sound off"}</span>
        </button>
      </span>
    </div>
  );
}

function cameraStatus(camera: Camera): { text: string; warn: boolean } {
  const { phase, health, loadingStep, error, find } = camera;
  if (phase === "error") return { text: error ? "Camera stopped" : "Camera off", warn: true };
  if (phase === "idle") return { text: "Camera off", warn: false };
  if (phase === "starting") return { text: "Opening…", warn: false };
  if (phase === "aiming") {
    if (find.kind === "searching") return { text: "Looking for the hoop…", warn: false };
    if (find.kind === "strong") return { text: "Hoop found", warn: false };
    if (find.kind === "fair") return { text: "Is this the rim?", warn: false };
    return { text: "Aim at the rim", warn: false };
  }
  if (loadingStep) return { text: "Getting ready…", warn: false };
  if (health?.slow) return { text: "Phone slowing down: shade it or rest", warn: true };
  if (health?.noBall) return { text: "No ball seen for a minute: is the hoop in view?", warn: true };
  if (health?.sizing?.kind === "measuring") return { text: `Sizing up · ${health.sizing.have} of ${health.sizing.need}`, warn: false };
  if (health?.sizing?.kind === "checking") return { text: "Adjusting the size", warn: false };
  return { text: "Watching the hoop", warn: false };
}

function CallFlash({ call }: { call: { made: boolean; flagged: boolean; at: number } }) {
  return (
    <p
      key={call.at}
      aria-live="assertive"
      className={`pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-2xl px-8 py-3 font-display text-6xl uppercase leading-none shadow-lg landscape:left-[18%] landscape:top-[38%] landscape:text-7xl ${
        call.made ? "bg-data-positive text-on-accent" : "bg-raised text-foreground"
      }`}
    >
      {call.made ? "Make" : "Miss"}
      {call.flagged ? "?" : ""}
    </p>
  );
}

/** For three seconds after counting starts, a ring where the camera is counting around, so a rim that was aimed in the wrong place is seen at once. */
function RimCheck({ camera }: { camera: Camera }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const on = setTimeout(() => {
      const v = camera.videoRef.current;
      if (!v?.videoWidth) return;
      const r = containedRect(v.clientWidth, v.clientHeight, v.videoWidth, v.videoHeight);
      const a = camera.getAim();
      setPos({ x: r.x + a.x * r.w, y: r.y + a.y * r.h });
    }, 0);
    const off = setTimeout(() => setPos(null), 3200);
    return () => {
      clearTimeout(on);
      clearTimeout(off);
    };
  }, [camera]);
  if (!pos) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute z-10 motion-safe:animate-pulse" style={{ left: pos.x, top: pos.y }}>
      <div className="-ml-5 -mt-5 h-10 w-10 rounded-full border-[3px] border-accent shadow-[0_0_0_2px_rgba(0,0,0,0.5)]" />
      <p className="-ml-14 mt-1 w-28 text-center text-[11px] font-extrabold uppercase tracking-wide text-accent [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">Counting here</p>
    </div>
  );
}

function SetupCard({ error, start }: { error: string | null; start: Camera["start"] }) {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center overflow-y-auto bg-background/85 p-3 landscape:p-4 landscape:pb-28 landscape:pt-12">
      <section className="w-full max-w-sm rounded-2xl border border-line bg-surface p-3 landscape:p-4">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-accent">Set up the camera</p>
        <ol className="mt-2 space-y-1 text-sm text-foreground">
          <li>1. Phone on a stand or fence, sideways, behind the shooter.</li>
          <li className="hidden landscape:list-item">2. The hoop in the top half of the picture, sky or wall above the rim.</li>
          <li className="hidden landscape:list-item">3. The whole net in view, and the phone out of the sun.</li>
        </ol>
        {error && <p className="mt-3 text-xs font-semibold text-danger">{error}</p>}
        <Button
          size="lg"
          block
          className="mt-3"
          onClick={() => {
            // A tap: unlocks the make/miss blips, which a page reload had lost.
            primeAlerts();
            void start();
          }}
        >
          {error ? "Try the camera again" : "Open the camera"}
        </Button>
      </section>
    </div>
  );
}

/* ---- Aiming -------------------------------------------------------------- */

function AimPanel({ camera, panelRef, bug, onDiscard, onUseTaps, onEnd, ending }: { camera: Camera; panelRef: React.RefObject<HTMLDivElement | null>; bug: ScoreBug; onDiscard: () => void; onUseTaps: () => void; onEnd: () => void; ending: boolean }) {
  const { phase, tight, find, autoIn, aimed, speed, reaiming } = camera;
  const slow = speed.kind === "slow";
  const ready = phase === "aiming";
  // A button that does nothing looks broken. Tapping Start before it can start says why, instead of being swallowed.
  const blocked = !ready || !aimed;
  const [nudge, setNudge] = useState<string | null>(null);
  useEffect(() => {
    if (!nudge) return;
    const id = setTimeout(() => setNudge(null), 3500);
    return () => clearTimeout(id);
  }, [nudge]);
  let message: string;
  if (reaiming) message = `Paused: ${bug.makes} of ${bug.attempts} so far. Move the phone if you need to. Then touch the front of the rim and lift. Counting is off until you press Resume.`;
  else if (!ready) message = "Opening the camera…";
  else if (find.kind === "searching") message = "Looking for your hoop… or touch the picture and slide to the front of the rim.";
  else if (find.kind === "strong") message = speed.kind === "checking" ? "Hoop found. Checking this phone is fast enough…" : `Hoop found. Counting starts in ${autoIn ?? 0}…`;
  else if (find.kind === "fair") message = "Is this the rim? If not, touch the picture and slide it there, then lift.";
  else message = aimed ? "Slide to move the ring onto the front of the rim, then lift. Ready when it is." : "Touch the picture and slide to the front of the rim, then lift.";

  return (
    <div ref={panelRef} data-aim-panel className="flex flex-col gap-3 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] landscape:absolute landscape:inset-x-0 landscape:bottom-0 landscape:z-30 landscape:flex-row landscape:items-center landscape:gap-4 landscape:bg-background/85 landscape:pl-[max(0.75rem,env(safe-area-inset-left))] landscape:pr-[max(0.75rem,env(safe-area-inset-right))] landscape:backdrop-blur">
      <div className="min-w-0 flex-1">
        <p role="status" className="text-sm font-semibold text-foreground">
          {message}
        </p>
        {speed.kind === "checking" && find.kind !== "strong" && ready && (
          <p className="mt-1 text-xs text-foreground-mute">Checking this phone is fast enough for the camera…</p>
        )}
        {slow && (
          <p className="mt-1.5 rounded-lg bg-danger/10 px-3 py-1.5 text-xs font-semibold text-danger">
            This phone runs the camera at about {Math.round(speed.fps)} frames a second, and it needs 10 or more to catch every shot
            (a warm phone does this: shade it or let it cool). Counting by tapping is safer for this set.
          </p>
        )}
        {nudge && (
          <p role="alert" className="mt-1.5 rounded-lg bg-accent/15 px-3 py-1.5 text-xs font-bold text-accent-hover">
            {nudge}
          </p>
        )}
        {tight && (
          <p className="mt-1.5 rounded-lg bg-danger/10 px-3 py-1.5 text-xs font-semibold text-danger">
            The rim is too near the top of the picture, so the ball&rsquo;s way in is cut off. Tilt the phone down or step back.
          </p>
        )}
      </div>
      <div className="grid shrink-0 grid-cols-2 items-center gap-2 landscape:flex">
        {reaiming ? (
          <Button variant="ghost" size="sm" onClick={onEnd} disabled={bug.attempts === 0 || ending} className="order-2 min-h-11 landscape:order-none">
            End set
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={onDiscard} className="order-2 min-h-11 landscape:order-none">
            Cancel set
          </Button>
        )}
        {find.kind === "strong" && (
          <Button variant="secondary" size="md" onClick={camera.cancelAuto} className="order-2 landscape:order-none">
            Aim again
          </Button>
        )}
        {slow && (
          <Button size="lg" onClick={onUseTaps} className="order-1 col-span-2 landscape:order-none landscape:min-w-44">
            Count by tapping
          </Button>
        )}
        <Button
          variant={slow ? "secondary" : "primary"}
          size={slow ? "md" : "lg"}
          aria-disabled={blocked}
          onClick={() => {
            if (blocked) {
              haptic("tap");
              setNudge(!ready ? "The camera is still opening." : "Touch the picture on the front of the rim first, then press Start.");
              return;
            }
            primeAlerts();
            void camera.startCounting(slow);
          }}
          className={`${slow ? "order-2 landscape:order-none" : "order-1 col-span-2 landscape:order-none landscape:min-w-44"} ${blocked ? "opacity-50" : ""}`}
        >
          {reaiming ? "Resume counting" : slow ? "Count anyway" : find.kind === "strong" ? "Start now" : "Start counting"}
        </Button>
      </div>
    </div>
  );
}

/* ---- The score bar ------------------------------------------------------- */

function Cell({ label, children, tone = "normal", className = "" }: { label: string; children: React.ReactNode; tone?: "normal" | "hot" | "dim"; className?: string }) {
  const color = tone === "hot" ? "text-accent" : tone === "dim" ? "text-foreground-mute" : "text-foreground";
  return (
    <div className={`flex min-w-0 flex-col justify-center px-3 ${className}`}>
      <span className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-foreground-mute">{label}</span>
      <span className={`font-display text-3xl leading-none tabular-nums ${color} landscape:text-[1.7rem]`}>{children}</span>
    </div>
  );
}

function Bar(p: StageProps & { bug: ScoreBug }) {
  const { bug, label, playerName, goal } = p;
  const streakLabel = bug.streak.kind === "miss" ? "Misses" : "Streak";
  const clock = bug.clock;
  const progress = clock.fraction ?? bug.goal?.fraction ?? null;
  return (
    <section
      aria-label="Score"
      className="relative shrink-0 border-t border-line bg-background/90 backdrop-blur pb-[env(safe-area-inset-bottom)] landscape:absolute landscape:inset-x-0 landscape:bottom-0 landscape:z-20 landscape:pl-[env(safe-area-inset-left)] landscape:pr-[env(safe-area-inset-right)]"
    >
      {progress !== null && (
        <div className="absolute inset-x-0 top-0 h-[3px] bg-raised">
          <div className="h-full bg-accent transition-[width]" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      <p className="truncate px-4 pt-2.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-accent landscape:hidden">
        {label || "Shooting session"} · {playerName}
        {goal && <span className="text-foreground-mute"> · {describeGoal(goal)}</span>}
      </p>
      <div className="grid grid-cols-3 gap-y-2.5 py-2.5 landscape:flex landscape:items-stretch landscape:gap-0 landscape:divide-x landscape:divide-line landscape:py-1.5">
        <div className="hidden min-w-0 items-center gap-2.5 pl-3 pr-4 landscape:flex">
          <BrandMark size={28} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[11px] font-extrabold uppercase tracking-[0.12em] text-foreground">{label || "Shooting"}</span>
            <span className="truncate text-[10px] font-bold uppercase tracking-wide text-foreground-mute">
              {playerName}
              {goal && ` · ${describeGoal(goal)}`}
            </span>
          </span>
        </div>
        <Cell label="Makes">
          {bug.makes}
          <span className="text-foreground-mute">/{bug.attempts}</span>
        </Cell>
        <Cell label="FG" tone={bug.attempts === 0 ? "dim" : "normal"}>
          {bug.pct}
        </Cell>
        <Cell label={clock.mode === "down" ? "Left" : "Time"} tone={clock.urgent ? "hot" : clock.mode === "waiting" ? "dim" : "normal"} className={clock.urgent ? "motion-safe:animate-pulse" : ""}>
          {clock.text}
        </Cell>
        <Cell label={streakLabel} tone={bug.streak.hot ? "hot" : bug.streak.kind === "none" ? "dim" : "normal"}>
          {bug.streak.kind === "none" ? "—" : bug.streak.n}
        </Cell>
        <Cell label="Best run" tone={bug.best === 0 ? "dim" : "normal"}>
          {bug.best}
        </Cell>
        {bug.goal && (
          <Cell label="Goal" className="landscape:min-w-0">
            <span className="text-xl landscape:text-[1.15rem]">{bug.goal.label}</span>
          </Cell>
        )}
        <div className="hidden flex-1 items-center justify-end pl-3 pr-3 landscape:flex">
          <Button onClick={p.onEnd} disabled={p.shots.length === 0 || p.ending} size="md">
            End
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ---- Recent shots, add/undo/end ------------------------------------------- */

function Dots({ shots, onFlip }: { shots: Shot[]; onFlip: (seq: number) => void }) {
  const visible = shots.slice(-16);
  if (visible.length === 0) return <div className="hidden" />;
  return (
    <div className="px-4 pt-3 landscape:absolute landscape:bottom-[4.6rem] landscape:left-3 landscape:z-20 landscape:p-0 landscape:pl-[env(safe-area-inset-left)]">
      <div
        role="list"
        aria-label="Recent shots. Tap one to flip it."
        className="inline-flex gap-1.5 rounded-full px-0.5 py-1 landscape:bg-background/70 landscape:px-2.5 landscape:py-1.5"
      >
        {visible.map((s) => (
          <button
            key={s.seq}
            type="button"
            role="listitem"
            aria-label={`Shot ${s.seq}: ${s.made ? "made" : "missed"}${s.flagged ? ", camera not sure" : ""}. Tap to change.`}
            onClick={() => onFlip(s.seq)}
            className={`h-6 w-6 shrink-0 rounded-full border-2 transition-transform active:scale-90 landscape:h-5 landscape:w-5 ${
              s.made ? "border-[var(--data-positive)] bg-[var(--data-positive)]" : "border-foreground-mute bg-transparent"
            }${s.flagged ? " ring-2 ring-accent ring-offset-2 ring-offset-background" : ""}`}
          />
        ))}
      </div>
      {visible.some((s) => s.flagged) && <p className="mt-1.5 text-[11px] text-foreground-mute landscape:hidden">Ringed: the camera wasn&rsquo;t sure.</p>}
    </div>
  );
}

function Controls({ onLog, onUndo, onEnd, shots, ending, error }: StageProps) {
  return (
    <div className="mt-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 landscape:absolute landscape:right-0 landscape:top-1/2 landscape:z-20 landscape:-translate-y-[60%] landscape:p-0 landscape:pr-[max(0.5rem,env(safe-area-inset-right))]">
      <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute landscape:hidden">Camera missed one? Add it</p>
      <div className="grid grid-cols-2 gap-2.5 landscape:flex landscape:flex-col landscape:gap-2">
        <Button variant="secondary" onClick={() => onLog(true)} disabled={ending} className="landscape:bg-background/75 landscape:px-3">
          + Make
        </Button>
        <Button variant="secondary" onClick={() => onLog(false)} disabled={ending} className="landscape:bg-background/75 landscape:px-3">
          + Miss
        </Button>
        <Button variant="secondary" onClick={onUndo} disabled={shots.length === 0 || ending} className="col-span-2 landscape:col-span-1 landscape:bg-background/75 landscape:px-3">
          Undo
        </Button>
      </div>
      {error && <p className="mt-3 text-center text-xs text-accent landscape:absolute landscape:right-2 landscape:top-full landscape:w-48 landscape:rounded-lg landscape:bg-background/90 landscape:p-2">{error}</p>}
      <Button onClick={onEnd} disabled={shots.length === 0 || ending} size="lg" block className="mt-3 landscape:hidden">
        {ending ? "Saving…" : "End session"}
      </Button>
    </div>
  );
}

/* ---- ⋯ menu ----------------------------------------------------------------- */

function Menu({ camera, goal, sound, onToggleSound, zone, onZone, onUndo, onDiscard, shots, ending, syncText, close }: StageProps & { close: () => void }) {
  const timed = goal?.kind === "time";
  return (
    <>
      <button type="button" aria-label="Close menu" className="fixed inset-0 z-40 cursor-default" onClick={close} />
      <div
        role="dialog"
        aria-label="More"
        className="fixed right-2 top-14 z-50 max-h-[calc(100dvh-4rem)] w-72 space-y-4 overflow-y-auto rounded-2xl border border-line bg-surface p-4 shadow-xl landscape:right-[max(0.5rem,env(safe-area-inset-right))] landscape:top-12"
      >
        <button
          type="button"
          onClick={() => {
            primeAlerts();
            onToggleSound();
          }}
          aria-pressed={sound}
          className="flex w-full items-center justify-between rounded-xl bg-raised px-4 py-3 text-sm font-bold text-foreground"
        >
          <span>Make / miss sound</span>
          <span className={sound ? "text-accent" : "text-foreground-mute"}>{sound ? "On" : "Off"}</span>
        </button>

        {camera.phase === "counting" && (
          <div>
            <Button
              variant="secondary"
              size="md"
              block
              disabled={timed}
              onClick={() => {
                haptic("tap");
                close();
                camera.reaim();
              }}
            >
              Pause and re-aim the camera
            </Button>
            <p className="mt-1 text-[11px] text-foreground-mute">
              {timed ? "Not during a timed set: the clock would keep running." : "Counting stops while you move the phone to a new spot. Your shots so far are kept and the set carries on."}
            </p>
          </div>
        )}

        <div>
          <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-foreground-mute">Spot (stays until you change it)</p>
          <div className="flex flex-wrap gap-1.5">
            {ZONES.map((z) => (
              <button
                key={z.key}
                type="button"
                onClick={() => onZone(z.key)}
                aria-pressed={zone === z.key}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                  zone === z.key ? "border-accent bg-accent text-on-accent" : "border-line bg-raised text-foreground-dim"
                }`}
              >
                {z.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" size="md" className="flex-1" disabled={shots.length === 0 || ending} onClick={onUndo}>
            Undo last
          </Button>
          <Button variant="danger" size="md" className="flex-1" onClick={onDiscard}>
            Discard set
          </Button>
        </div>
        <p className="text-center text-[11px] text-foreground-mute">{syncText}</p>
      </div>
    </>
  );
}
