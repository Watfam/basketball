"use client";

import { Sheet } from "@/components/ui/sheet";
import { haptic } from "@/lib/haptics";
import { COVERAGES, COVERAGE_LABEL, type Coverage } from "@/lib/plays/coverage";
import type { DefenseId, DefensePlayer, Frame, OffenseId } from "@/lib/plays/types";

const PICKABLE_COVERAGES = COVERAGES.filter((c) => c !== "manual");

export function PlayerSheet({
  frame,
  selected,
  opener,
  onClose,
  onSetCoverage,
  onSetMan,
  onGiveBall,
}: {
  frame: Frame;
  selected: OffenseId | DefenseId;
  opener: HTMLElement | null;
  onClose: () => void;
  onSetCoverage: (id: DefenseId, coverage: Coverage) => void;
  onSetMan: (id: DefenseId, man: OffenseId) => void;
  onGiveBall: (id: OffenseId) => void;
}) {
  const defender = frame.defense.find((d) => d.id === selected) as DefensePlayer | undefined;

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
    </Sheet>
  );
}
