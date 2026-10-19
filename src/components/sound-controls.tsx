"use client";

import { useState } from "react";
import { blipShot, primeAlerts, soundCheck } from "@/lib/alerts";
import { SOUND_LEVELS, SOUND_LEVEL_KEY, parseSoundLevel, type SoundLevel } from "@/lib/sound-level";
import { useLocalDraft } from "@/lib/use-local-draft";
import { haptic } from "@/lib/haptics";
import { useDrillSound } from "@/lib/use-drill-sound";
import { Button } from "@/components/ui/button";

/**
 * A tap that plays every sound the app promises (a high blip for a make, a
 * low one for a miss, three beeps for ten seconds left), so a player can
 * hear that sound works before a set or a drill. A phone's silent switch
 * can't be read from a web page; hearing it is the only proof.
 */
export function SoundCheck({ className }: { className?: string }) {
  const [said, setSaid] = useState<string | null>(null);
  return (
    <div className={className}>
      <SoundLevelPicker />
      <Button
        variant="secondary"
        size="sm"
        className="mt-2 min-h-11"
        onClick={() => {
          primeAlerts();
          haptic("tap");
          const s = soundCheck();
          setSaid(
            `Played a high blip (make), a low blip (miss) and three beeps. Audio is ${s.state}${s.session ? ` in ${s.session} mode` : ""}. Heard nothing, or too quiet? Choose Loud above and press the phone's volume button up.`
          );
        }}
      >
        Sound check
      </Button>
      {said && (
        <p role="status" className="mt-1.5 text-[11px] leading-snug text-foreground-mute">
          {said}
        </p>
      )}
    </div>
  );
}

/** For a drill timer: sound on or off, and the check. */
export function DrillSoundControls() {
  const [on, setOn] = useDrillSound();
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      <button
        type="button"
        aria-pressed={on}
        onClick={() => {
          primeAlerts();
          haptic("tap");
          setOn(!on);
        }}
        className={`text-[11px] font-extrabold uppercase tracking-[0.14em] ${on ? "text-accent" : "text-foreground-dim"}`}
      >
        Sound {on ? "on" : "off"}
      </button>
      <SoundCheck />
    </div>
  );
}

/**
 * How loud the app's own sounds are: Normal or Loud (the default). Picking one plays a make and a miss at that level. The phone's own
 * volume still sets the ceiling, so Loud only helps with the volume buttons turned up.
 */
export function SoundLevelPicker({ className = "w-full max-w-xs" }: { className?: string }) {
  const [raw, setRaw] = useLocalDraft(SOUND_LEVEL_KEY);
  const level = parseSoundLevel(raw);
  const pick = (l: SoundLevel) => {
    primeAlerts();
    haptic("tap");
    setRaw(l);
    blipShot(true);
    setTimeout(() => blipShot(false), 350);
  };
  return (
    <div className={className}>
      <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground-mute">Sound level</p>
      <div role="radiogroup" aria-label="Sound level" className="mt-1.5 grid grid-cols-2 gap-1.5">
        {SOUND_LEVELS.map((l) => (
          <button
            key={l.value}
            type="button"
            role="radio"
            aria-checked={level === l.value}
            onClick={() => pick(l.value)}
            className={`min-h-11 rounded-lg border px-2 text-xs font-extrabold ${level === l.value ? "border-accent bg-accent/10 text-accent-hover" : "border-line bg-surface text-foreground-dim"}`}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}
