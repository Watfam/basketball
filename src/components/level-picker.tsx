"use client";

import { useState, useTransition } from "react";
import { setPreferredLevel } from "@/app/actions";
import { SKILL_LEVELS, type SkillLevel } from "@/lib/basketball/assessment";
import { haptic } from "@/lib/haptics";

export function LevelPicker({
  playerId,
  currentLevel,
  isSuggested,
}: {
  playerId: string;
  currentLevel: SkillLevel;
  // True when currentLevel came from the assessment rather than a
  // player-chosen override — shown as a small hint, not nagging.
  isSuggested: boolean;
}) {
  const [level, setLevel] = useState(currentLevel);
  const [pending, startTransition] = useTransition();

  function pick(next: SkillLevel) {
    if (next === level) return;
    haptic("tap");
    setLevel(next);
    startTransition(async () => {
      await setPreferredLevel(playerId, next);
    });
  }

  return (
    <div>
      <div className="flex gap-2">
        {SKILL_LEVELS.map((l) => (
          <button
            key={l.value}
            type="button"
            onClick={() => pick(l.value)}
            disabled={pending}
            className={`flex-1 rounded-lg border px-2 py-2 text-xs font-bold uppercase tracking-wide transition-colors disabled:opacity-50 ${
              level === l.value
                ? "border-accent bg-accent text-white"
                : "border-line bg-elevated text-foreground-dim hover:border-accent/50"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>
      {isSuggested && level === currentLevel && (
        <p className="mt-1.5 text-xs text-foreground-dim">Suggested from the assessment — tap to change it.</p>
      )}
    </div>
  );
}
