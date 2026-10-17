"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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

      {open === "drill" && <DrillSheet labels={labels} label={label} recent={otherRecent(recent, label ?? "", goal)} lastSix={lastSix} onLabel={(l) => { onLabel(l); close(); }} onUseSetup={(s) => { onUseSetup(s); close(); }} onClose={close} opener={opener} />}
      {open === "count" && (
        <Sheet title="How do you want to count?" onClose={close} opener={opener}>
          <Options>
            <Opt selected={countWithCamera} title="Camera" sub="Phone on a stand counts. You check the unsure ones." onPick={() => { onCount(true); close(); }} />
            <Opt selected={!countWithCamera} title="Tap counter" sub="Tap make or miss yourself. No stand needed." onPick={() => { onCount(false); close(); }} />
          </Options>
        </Sheet>
      )}
      {open === "goal" && <GoalSheet goal={goal} onGoal={onGoal} onClose={close} opener={opener} />}
    </>
  );
}

function Sheet({ title, onClose, opener, children, footer }: { title: string; onClose: () => void; opener: HTMLElement | null; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    const back = opener;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", key); document.body.style.overflow = overflow; back?.focus(); };
  }, [opener]);
  // Drawn on the page itself, not inside the setup's own layout: a parent that spaces its children would otherwise shift a full-screen sheet.
  return createPortal(
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 h-full w-full cursor-default bg-black/45" />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="animate-rise absolute inset-x-0 bottom-0 mx-auto max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-line bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2.5 outline-none">
        <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" />
        <h2 className="font-display text-2xl uppercase leading-none tracking-wide text-foreground">{title}</h2>
        <div className="mt-3">{children}</div>
        {footer && <div className="mt-3">{footer}</div>}
      </div>
    </div>,
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

function DrillSheet({ labels, label, recent, lastSix, onLabel, onUseSetup, onClose, opener }: { labels: string[]; label: string | null; recent: Setup[]; lastSix: Record<string, Six>; onLabel: (l: string) => void; onUseSetup: (s: Setup) => void; onClose: () => void; opener: HTMLElement | null }) {
  const [own, setOwn] = useState("");
  const use = () => { const t = own.trim(); if (t) onLabel(t); };
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
    <Sheet title="Set a goal?" onClose={onClose} opener={opener} footer={goal ? <Button size="lg" block onClick={onClose}>Done</Button> : undefined}>
      <p className="-mt-1 mb-2.5 text-sm text-foreground-dim">The set ends and saves itself when you reach it.</p>
      <Options label="Goal">
        <Opt selected={!goal} title="No goal" sub="I will end the set myself" onPick={() => { onGoal(null); onClose(); }} />
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
