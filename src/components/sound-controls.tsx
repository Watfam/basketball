"use client";

import { useState } from "react";
import { primeAlerts, soundCheck } from "@/lib/alerts";
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
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          primeAlerts();
          haptic("tap");
          const s = soundCheck();
          setSaid(
            `Played a high blip (make), a low blip (miss) and three beeps. Audio is ${s.state}${s.session ? ` in ${s.session} mode` : ""}. Heard nothing? Turn the volume up, and tell your coach.`
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
