"use client";

import { useLocalDraft } from "@/lib/use-local-draft";
import { haptic } from "@/lib/haptics";
import { CAMERA_TRIAL_KEY } from "@/lib/vision/camera-trial";
import { Card } from "@/components/ui/card";

/**
 * Lets players count with the camera on this phone. Off until the coach
 * turns it on: the camera counts well on the driveway it was measured on,
 * and a second 10-minute test on the stand is still to come
 * (docs/camera-shot-counting-plan.md). It is per phone, like the aim.
 */
export function CameraTrialToggle() {
  const [raw, setRaw] = useLocalDraft(CAMERA_TRIAL_KEY);
  const on = raw === "on";
  return (
    <Card className="flex items-center justify-between gap-4 p-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">Players can count with the camera</p>
        <p className="mt-0.5 text-xs text-foreground-dim">
          On this phone only. A trial: every set saves its camera calls, and unsure ones are checked before saving.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Players can count with the camera"
        onClick={() => {
          haptic("tap");
          setRaw(on ? "off" : "on");
        }}
        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-line-strong"}`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-[left] ${on ? "left-7" : "left-1"}`}
        />
      </button>
    </Card>
  );
}
