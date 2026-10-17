"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { GOAL_KINDS, describeGoal, goalSpec, type Goal, type GoalKind } from "@/lib/basketball/goals";
import { GOAL_HELP, cardDetail, cardEyebrow, countingName, drillName, goalName, otherRecent, type Setup } from "@/lib/basketball/shoot-setup";
import { formatPercentage } from "@/lib/basketball/shooting";
import { haptic } from "@/lib/haptics";

type Six = { pct: number; sessions: number };
type Which = "drill" | "count" | "goal";

/**
 * The Shoot tab's setup, start first. One card says what Start will do (the drill, how it is counted, the goal, how the last sets went), and
 * Start sits right under it. Each setting is a row that opens a short list in a sheet: the choice applies when tapped, so there is no Done to find
 * (the goal also needs an amount, so it has one). A new player has no drill yet, so the card is replaced by the drill choices. The choices,
 * their storage and Start itself are the hub's; this only draws them and reports what was picked.
 */
export function ShootSetup({
  labels, label, hasPicked, recent, lastSix, goal, cameraAllowed, countWithCamera,
  onLabel, onUseSetup, onGoal, onCount, onStart, children,
}: {
  labels: string[];
  /** The drill on the card, or null when there is none yet (a new player). */
  label: string | null;
  /** The player changed something this visit. */
  hasPicked: boolean;
  recent: Setup[];
  lastSix: Record<string, Six>;
  goal: Goal | null;
  cameraAllowed: boolean;
  countWithCamera: boolean;
  onLabel: (label: string) => void;
  onUseSetup: (setup: Setup) => void;
  onGoal: (goal: Goal | null) => void;
  onCount: (camera: boolean) => void;
  onStart: () => void;
  /** Quiet things under Start (the sound check, the tracking history entry). */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState<Which | null>(null);
  // The button that opened the sheet, so focus goes back to it when the sheet closes.
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const show = (w: Which) => (e: React.MouseEvent<HTMLElement>) => {
    haptic("tap");
    setOpener(e.currentTarget);
    setOpen(w);
  };
  const close = () => setOpen(null);
  const name = label === null ? "" : label.trim();
  const six = label === null ? null : name ? lastSix[name] ?? null : lastSix["*"] ?? null;

  const row = (w: Which, title: string, value: string) => (
    <button key={w} type="button" onClick={show(w)} aria-haspopup="dialog" className="flex min-h-14 w-full items-center justify-between gap-3 border-t border-line px-4 py-3 text-left first:border-t-0 hover:bg-raised">
      <span className="text-sm text-foreground-dim">{title}</span>
      <span className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-foreground"><span className="truncate">{value}</span><span aria-hidden className="text-foreground-mute">›</span></span>
    </button>
  );

  return (
    <>
      <section className="panel-lit rounded-3xl border border-line bg-surface p-5" aria-label="New session">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-accent-hover">New session</p>

        {label === null ? (
          <div className="mt-3">
            <h2 className="font-display text-3xl uppercase leading-none tracking-wide text-foreground">What are you shooting?</h2>
            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Drills">
              {labels.map((l) => (
                <button key={l} type="button" onClick={() => { haptic("tap"); onLabel(l); }} className="flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-bold text-foreground-dim hover:border-line-strong">{l}</button>
              ))}
            </div>
            <button type="button" onClick={show("drill")} aria-haspopup="dialog" className="mt-2 flex min-h-11 items-center text-xs font-extrabold uppercase tracking-[0.12em] text-accent-hover">Name your own ›</button>
          </div>
        ) : (
          <div className="mt-3 rounded-2xl border border-accent bg-surface p-4" aria-label="What Start will do">
            <Eyebrow className="text-accent-hover">{cardEyebrow(hasPicked, recent.length > 0)}</Eyebrow>
            <p className="mt-1 font-display text-4xl uppercase leading-none tracking-wide text-foreground">{drillName(label)}</p>
            <p className="mt-1.5 text-sm text-foreground-dim">{cardDetail({ camera: cameraAllowed ? countWithCamera : null, goal, six, name })}</p>
          </div>
        )}

        <Eyebrow className="mb-1.5 mt-5">Change something</Eyebrow>
        <div className="overflow-hidden rounded-2xl border border-line">
          {label !== null && row("drill", "What you are shooting", drillName(label))}
          {cameraAllowed && row("count", "How to count", countingName(countWithCamera))}
          {row("goal", "Goal", goalName(goal))}
        </div>

        <div className="sticky bottom-[calc(4.6rem+env(safe-area-inset-bottom))] z-10 -mx-5 mt-4 bg-gradient-to-t from-surface via-surface to-transparent px-5 pb-1 pt-3">
          <Button size="lg" block onClick={onStart}>Start shooting</Button>
        </div>
        <p className="mt-2 text-center text-[11px] text-foreground-mute">Keeping the same name each time is what makes your progress line up.</p>
        {children}
      </section>

      {open === "drill" && <DrillSheet labels={labels} label={label} recent={otherRecent(recent, label ?? "", goal)} lastSix={lastSix} onLabel={onLabel} onUseSetup={onUseSetup} onClose={close} opener={opener} />}
      {open === "count" && (
        <Sheet title="How do you want to count?" onClose={close} opener={opener}>
          <Options>
            <Opt selected={countWithCamera} title="Camera" sub="Phone on a stand counts. You check the unsure ones." onPick={() => onCount(true)} />
            <Opt selected={!countWithCamera} title="Tap counter" sub="Tap make or miss yourself. No stand needed." onPick={() => onCount(false)} />
          </Options>
        </Sheet>
      )}
      {open === "goal" && <GoalSheet goal={goal} onGoal={onGoal} onClose={close} opener={opener} />}
    </>
  );
}

const SheetClose = createContext<() => void>(() => {});

/** Closes the sheet the way a swipe would: it slides away, then goes. */
function DoneButton() {
  const close = useContext(SheetClose);
  return <Button size="lg" block onClick={() => { haptic("tap"); close(); }}>Done</Button>;
}

const SLIDE_MS = 280;
const CLOSE_PX = 110;
const CLOSE_SPEED = 0.55;

/**
 * A bottom sheet that behaves like one on a phone: it slides up, follows a finger that pulls it down, and either slides away (a long enough pull, or a quick
 * flick) or springs back. Choosing something in it does not close it; swiping down, Done, a tap outside or Escape do. The pull works from the grab handle and
 * title, and from anywhere on the sheet when its list is scrolled to the top. Respects "reduce motion".
 */
function Sheet({ title, onClose, opener, children }: { title: string; onClose: () => void; opener: HTMLElement | null; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  const [shown, setShown] = useState(false);
  const [closing, setClosing] = useState(false);
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [height, setHeight] = useState(500);
  const closingRef = useRef(false);
  const ms = () => (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : SLIDE_MS);

  const requestClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setTimeout(() => closeRef.current(), ms());
  };
  const closeNow = useRef(requestClose);
  useEffect(() => { closeNow.current = requestClose; });

  useEffect(() => {
    const back = opener;
    const id = requestAnimationFrame(() => { setHeight(ref.current?.offsetHeight ?? 500); setShown(true); });
    ref.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") closeNow.current(); };
    window.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { cancelAnimationFrame(id); window.removeEventListener("keydown", key); document.body.style.overflow = overflow; back?.focus(); };
  }, [opener]);

  // The pull. Native listeners, because a pull has to stop the page's own scrolling and React's touch handlers cannot.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let startY = 0, lastY = 0, lastT = 0, speed = 0, active = false, pulling = false, fromTop = false, pull = 0;
    const onStart = (e: TouchEvent) => {
      if (closingRef.current || e.touches.length !== 1) return;
      const t = e.touches[0];
      const inHead = t.clientY - el.getBoundingClientRect().top < 72;
      const onField = (e.target as HTMLElement).closest("input, textarea");
      active = !onField;
      fromTop = inHead || el.scrollTop <= 0;
      pulling = false; pull = 0; startY = lastY = t.clientY; lastT = performance.now(); speed = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!active) return;
      const y = e.touches[0].clientY, now = performance.now();
      const d = y - startY;
      if (!pulling) {
        if (d > 8 && fromTop && el.scrollTop <= 0) { pulling = true; setDragging(true); }
        else if (d < -8 || (d > 8 && !fromTop)) { active = false; return; }
        else return;
      }
      e.preventDefault();
      if (now > lastT) speed = (y - lastY) / (now - lastT);
      lastY = y; lastT = now;
      pull = Math.max(0, d - 8);
      setDy(pull);
    };
    const onEnd = () => {
      if (!pulling) { active = false; return; }
      active = false; pulling = false;
      setDragging(false);
      if (pull > CLOSE_PX || (speed > CLOSE_SPEED && pull > 24)) { haptic("tap"); closeNow.current(); } else setDy(0);
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => { el.removeEventListener("touchstart", onStart); el.removeEventListener("touchmove", onMove); el.removeEventListener("touchend", onEnd); el.removeEventListener("touchcancel", onEnd); };
  }, []);

  const away = closing || !shown;
  const dur = dragging ? 0 : ms();
  const fade = away ? 0 : Math.max(0, 1 - dy / Math.max(1, height));
  // Drawn on the page itself, not inside the setup's own layout: a parent that spaces its children would otherwise shift a full-screen sheet.
  return createPortal(
    <SheetClose.Provider value={requestClose}>
      <div className="fixed inset-0 z-50">
        <button type="button" aria-label="Close" tabIndex={-1} onClick={requestClose} className="absolute inset-0 h-full w-full cursor-default bg-black/45" style={{ opacity: fade, transition: dragging ? "none" : `opacity ${dur}ms ease-out` }} />
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          tabIndex={-1}
          className="absolute inset-x-0 bottom-0 mx-auto max-h-[88dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-3xl border border-line bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1 outline-none will-change-transform"
          style={{ transform: away ? "translateY(100%)" : `translateY(${dy}px)`, transition: dragging ? "none" : `transform ${dur}ms cubic-bezier(0.22, 1, 0.36, 1)` }}
        >
          <div aria-hidden className="mx-auto flex h-6 w-16 items-center justify-center"><span className="h-1 w-10 rounded-full bg-line-strong" /></div>
          <h2 className="font-display text-2xl uppercase leading-none tracking-wide text-foreground">{title}</h2>
          <div className="mt-3">{children}</div>
          <div className="mt-4"><DoneButton /></div>
        </div>
      </div>
    </SheetClose.Provider>,
    document.body
  );
}

function Options({ children, label }: { children: ReactNode; label?: string }) {
  return <div role="radiogroup" aria-label={label} className="space-y-1.5">{children}</div>;
}

/** One choice. The chosen one is tinted, in orange, with a check, in every list. */
function Opt({ selected, title, sub, right, onPick }: { selected: boolean; title: string; sub?: string; right?: string; onPick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={() => { haptic("tap"); onPick(); }}
      className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left ${selected ? "border-accent bg-accent/10" : "border-line bg-surface hover:border-line-strong"}`}>
      <span className="min-w-0">
        <span className={`block text-[15px] font-bold ${selected ? "text-accent-hover" : "text-foreground"}`}>{title}</span>
        {sub && <span className={`block text-xs ${selected ? "text-accent-hover" : "text-foreground-dim"}`}>{sub}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {right && <span className="text-xs font-bold tabular-nums text-foreground-dim">{right}</span>}
        {selected && <span aria-hidden className="text-base font-extrabold text-accent-hover">✓</span>}
      </span>
    </button>
  );
}

function DrillSheet({ labels, label, recent: recentNow, lastSix, onLabel, onUseSetup, onClose, opener }: { labels: string[]; label: string | null; recent: Setup[]; lastSix: Record<string, Six>; onLabel: (l: string) => void; onUseSetup: (s: Setup) => void; onClose: () => void; opener: HTMLElement | null }) {
  // The recent setups are read once when the sheet opens, so the list does not shuffle under a finger as choices are made.
  const [recent] = useState(recentNow);
  const [own, setOwn] = useState("");
  const use = () => { const t = own.trim(); if (t) { onLabel(t); setOwn(""); } };
  const current = label === null ? null : label.trim();
  const all = [...new Set([...(current && !labels.includes(current) ? [current] : []), ...labels])];
  return (
    <Sheet title="What are you shooting?" onClose={onClose} opener={opener}>
      {recent.length > 0 && (
        <>
          <Eyebrow className="mb-1.5">Recent</Eyebrow>
          <div className="mb-4 space-y-1.5">
            {recent.map((r) => (
              <button key={`${r.label}|${r.goal ? describeGoal(r.goal) : ""}`} type="button" onClick={() => { haptic("tap"); onUseSetup(r); }} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 text-left hover:border-line-strong">
                <span className="text-[15px] font-bold text-foreground">{drillName(r.label)}</span>
                <span className="text-xs font-bold text-foreground-dim">{r.goal ? describeGoal(r.goal) : "No goal"}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <Eyebrow className="mb-1.5">Drills</Eyebrow>
      <Options label="Drills">
        {all.map((l) => <Opt key={l} selected={current === l} title={l} right={lastSix[l] ? formatPercentage(lastSix[l].pct) : undefined} onPick={() => onLabel(l)} />)}
        <Opt selected={current === ""} title="No name" sub="Just shooting" onPick={() => onLabel("")} />
      </Options>
      <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); use(); }}>
        <Input value={own} onChange={(e) => setOwn(e.target.value)} placeholder="Or name your own" maxLength={60} enterKeyHint="done" aria-label="Name your own drill" className="min-w-0 flex-1" />
        <Button type="submit" variant="secondary" size="md" className="min-h-11 shrink-0" aria-disabled={!own.trim()}>Use</Button>
      </form>
    </Sheet>
  );
}

function GoalSheet({ goal, onGoal, onClose, opener }: { goal: Goal | null; onGoal: (g: Goal | null) => void; onClose: () => void; opener: HTMLElement | null }) {
  const kinds = GOAL_KINDS.map((k) => k.kind) as GoalKind[];
  return (
    <Sheet title="Set a goal?" onClose={onClose} opener={opener}>
      <p className="-mt-1 mb-2.5 text-sm text-foreground-dim">The set ends and saves itself when you reach it.</p>
      <Options label="Goal">
        <Opt selected={!goal} title="No goal" sub="I will end the set myself" onPick={() => onGoal(null)} />
        {kinds.map((kind) => (
          <Opt key={kind} selected={goal?.kind === kind} title={goalSpec(kind).label} sub={GOAL_HELP[kind]} onPick={() => { if (goal?.kind !== kind) onGoal({ kind, target: goalSpec(kind).choices[1] }); }} />
        ))}
      </Options>
      {goal && (
        <div className="mt-3">
          <div className="flex items-center gap-1.5" role="group" aria-label="How many">
            {goalSpec(goal.kind).choices.map((n) => (
              <button key={n} type="button" aria-pressed={goal.target === n} onClick={() => { haptic("tap"); onGoal({ kind: goal.kind, target: n }); }}
                className={`flex min-h-11 items-center rounded-full border px-4 text-sm font-bold tabular-nums ${goal.target === n ? "border-accent bg-accent/10 text-accent-hover" : "border-line text-foreground-dim"}`}>{n}</button>
            ))}
          </div>
          <div className="mt-2.5 flex items-center justify-between rounded-xl border border-line p-1.5">
            <button type="button" aria-label="Fewer" onClick={() => { haptic("tap"); onGoal({ kind: goal.kind, target: goal.target - goalSpec(goal.kind).step }); }} className="grid h-11 w-11 place-items-center rounded-lg bg-raised text-xl font-bold text-foreground">−</button>
            <p className="text-base font-bold text-foreground" aria-live="polite">{describeGoal(goal)}</p>
            <button type="button" aria-label="More" onClick={() => { haptic("tap"); onGoal({ kind: goal.kind, target: goal.target + goalSpec(goal.kind).step }); }} className="grid h-11 w-11 place-items-center rounded-lg bg-raised text-xl font-bold text-foreground">+</button>
          </div>
          {goal.kind === "streak" && <p className="mt-2 text-xs text-foreground-mute">Stops at 100 shots if it does not come.</p>}
        </div>
      )}
    </Sheet>
  );
}
