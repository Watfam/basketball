"use client";

import { useLocalDraft } from "@/lib/use-local-draft";
import { haptic } from "@/lib/haptics";
import { CAMERA_SWITCH_KEY } from "@/lib/vision/camera-switch";
import { Card } from "@/components/ui/card";

/**
 * Camera counting on this phone. It is on for everyone by default; this is
 * the off switch, for a phone that gets too hot, can't run the model, or
 * has a broken camera. It is per phone, like the aim.
 */
export function CameraSwitchToggle() {
  const [raw, setRaw] = useLocalDraft(CAMERA_SWITCH_KEY);
  const on = raw !== "off";
  return (
    <Card className="flex items-center justify-between gap-4 p-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">Players can count with the camera</p>
        <p className="mt-0.5 text-xs text-foreground-dim">
          On this phone. Players choose Camera when they start a set. Every camera set saves its calls, and the ones the camera
          wasn&rsquo;t sure of are checked before saving. Turn off if this phone runs hot or the camera acts up.
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
