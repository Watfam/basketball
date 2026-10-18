"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { haptic } from "@/lib/haptics";

const SheetClose = createContext<() => void>(() => {});

/** Closes the sheet it is in, the way a swipe would. */
export const useSheetClose = () => useContext(SheetClose);

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
export function Sheet({ title, onClose, opener, children, done = true }: { title: string; onClose: () => void; opener: HTMLElement | null; children: ReactNode; done?: boolean }) {
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
          {done && <div className="mt-4"><DoneButton /></div>}
        </div>
      </div>
    </SheetClose.Provider>,
    document.body
  );
}

export function Options({ children, label }: { children: ReactNode; label?: string }) {
  return <div role="radiogroup" aria-label={label} className="space-y-1.5">{children}</div>;
}

/** One choice. The chosen one is tinted, in orange, with a check, in every list. */
export function Opt({ selected, title, sub, right, onPick }: { selected: boolean; title: string; sub?: string; right?: string; onPick: () => void }) {
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


/** One choice that goes to another address (a date range, a drill filter). Choosing it closes the sheet, because the page behind changes. Same look as `Opt`. */
export function PickLink({ href, selected, title, sub }: { href: string; selected: boolean; title: string; sub?: string }) {
  const close = useSheetClose();
  return (
    <Link href={href} scroll={false} aria-current={selected ? "true" : undefined} onClick={() => { haptic("tap"); close(); }}
      className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left ${selected ? "border-accent bg-accent/10" : "border-line bg-surface hover:border-line-strong"}`}>
      <span className="min-w-0">
        <span className={`block text-[15px] font-bold ${selected ? "text-accent-hover" : "text-foreground"}`}>{title}</span>
        {sub && <span className={`block text-xs ${selected ? "text-accent-hover" : "text-foreground-dim"}`}>{sub}</span>}
      </span>
      {selected && <span aria-hidden className="shrink-0 text-base font-extrabold text-accent-hover">✓</span>}
    </Link>
  );
}

/** A row that says what is chosen and opens a sheet to change it: no sideways scrolling lists of chips, and every choice is on one screen. */
export function SheetPicker({ label, value, title, children, done = false }: { label: string; value: string; title: string; children: ReactNode; done?: boolean }) {
  const [open, setOpen] = useState(false);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  return (
    <>
      <button type="button" aria-haspopup="dialog" onClick={(e) => { haptic("tap"); setOpener(e.currentTarget); setOpen(true); }}
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-2 text-left hover:border-line-strong">
        <span className="shrink-0 text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">{label}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-foreground"><span className="truncate">{value}</span><span aria-hidden className="text-foreground-mute">›</span></span>
      </button>
      {open && <Sheet title={title} onClose={() => setOpen(false)} opener={opener} done={done}>{children}</Sheet>}
    </>
  );
}
