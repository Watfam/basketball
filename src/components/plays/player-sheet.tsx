"use client";

import { Sheet } from "@/components/ui/sheet";
import { haptic } from "@/lib/haptics";
import { COVERAGES, COVERAGE_LABEL, type Coverage } from "@/lib/plays/coverage";
import type { DefenseId, DefensePlayer, Frame, OffenseId } from "@/lib/plays/types";

const PICKABLE_COVERAGES = COVERAGES.filter((c) => c !== "manual");

function NudgePad({ onNudge }: { onNudge: (dx: number, dy: number) => void }) {
  const btn = "flex h-10 w-10 items-center justify-center rounded-lg border border-line-strong text-foreground-dim hover:border-accent hover:text-accent";
  const arrow = (d: "up" | "down" | "left" | "right") => {
    const rotate = { up: 0, right: 90, down: 180, left: 270 }[d];
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ transform: `rotate(${rotate}deg)` }} aria-hidden>
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    );
  };
  return (
    <div className="inline-grid grid-cols-3 grid-rows-3 gap-1">
      <div />
      <button type="button" aria-label="Nudge up" className={btn} onClick={() => onNudge(0, -0.5)}>{arrow("up")}</button>
      <div />
      <button type="button" aria-label="Nudge left" className={btn} onClick={() => onNudge(-0.5, 0)}>{arrow("left")}</button>
      <div className="flex h-10 w-10 items-center justify-center text-[9px] font-extrabold uppercase text-foreground-mute">0.5ft</div>
      <button type="button" aria-label="Nudge right" className={btn} onClick={() => onNudge(0.5, 0)}>{arrow("right")}</button>
      <div />
      <button type="button" aria-label="Nudge down" className={btn} onClick={() => onNudge(0, 0.5)}>{arrow("down")}</button>
      <div />
    </div>
  );
}

export function PlayerSheet({
  frame,
  selected,
  opener,
  onClose,
  onSetCoverage,
  onSetMan,
  onGiveBall,
  onNudge,
  onSwap,
}: {
  frame: Frame;
  selected: OffenseId | DefenseId;
  opener: HTMLElement | null;
  onClose: () => void;
  onSetCoverage: (id: DefenseId, coverage: Coverage) => void;
  onSetMan: (id: DefenseId, man: OffenseId) => void;
  onGiveBall: (id: OffenseId) => void;
  onNudge: (id: OffenseId | DefenseId, dx: number, dy: number) => void;
  onSwap: (a: OffenseId | DefenseId, b: OffenseId | DefenseId) => void;
}) {
  const defender = frame.defense.find((d) => d.id === selected) as DefensePlayer | undefined;
  const sameSideIds = (defender ? frame.defense.map((d) => d.id) : frame.offense.map((o) => o.id)).filter((id) => id !== selected);

  const positionControls = (
    <div className="mt-5 flex items-start justify-between gap-4 border-t border-line pt-4">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">Nudge</p>
        <div className="mt-2">
          <NudgePad onNudge={(dx, dy) => onNudge(selected, dx, dy)} />
        </div>
      </div>
      {sameSideIds.length > 0 && (
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">Swap with</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {sameSideIds.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  haptic("tap");
                  onSwap(selected, id);
                }}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-line-strong bg-surface text-sm font-extrabold text-foreground hover:border-accent hover:text-accent"
              >
                {id}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  if (defender) {
    return (
      <Sheet title={`${defender.id} — guarding ${defender.man}`} onClose={onClose} opener={opener} done={false}>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">Guarding</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {frame.offense.map((o) => o.id).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => {
                haptic("tap");
                onSetMan(defender.id, o);
                onClose();
              }}
              className={`flex h-11 w-11 items-center justify-center rounded-full border text-sm font-extrabold ${
                defender.man === o ? "border-accent bg-accent/10 text-accent-hover" : "border-line bg-surface text-foreground"
              }`}
            >
              {o}
            </button>
          ))}
        </div>

        <p className="mt-5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">Coverage</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {PICKABLE_COVERAGES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                haptic("tap");
                onSetCoverage(defender.id, c);
                onClose();
              }}
              className={`min-h-14 rounded-xl border px-3 py-2.5 text-left text-[15px] font-bold ${
                defender.coverage === c ? "border-accent bg-accent/10 text-accent-hover" : "border-line bg-surface text-foreground"
              }`}
            >
              {COVERAGE_LABEL[c]}
            </button>
          ))}
        </div>
        {defender.coverage === "manual" && (
          <p className="mt-3 text-xs text-foreground-dim">Placed by hand — pick a coverage above to hand it back to the formula.</p>
        )}
        {positionControls}
      </Sheet>
    );
  }

  const offenseId = selected as OffenseId;
  const hasBall = frame.ballHolder === offenseId;
  return (
    <Sheet title={offenseId} onClose={onClose} opener={opener} done={false}>
      <button
        type="button"
        disabled={hasBall}
        onClick={() => {
          haptic("tap");
          onGiveBall(offenseId);
          onClose();
        }}
        className="flex min-h-14 w-full items-center justify-center rounded-xl border border-accent bg-accent/10 px-4 text-[15px] font-bold text-accent-hover disabled:opacity-50"
      >
        {hasBall ? "Has the ball" : "Give him the ball"}
      </button>
      {positionControls}
    </Sheet>
  );
}
