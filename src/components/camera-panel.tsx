"use client";

import type { useCameraCounter } from "@/lib/vision/use-camera-counter";
import { haptic } from "@/lib/haptics";
import { Button } from "@/components/ui/button";

type Camera = ReturnType<typeof useCameraCounter>;

/**
 * The camera inside a shooting set: where to put the phone, aiming at the
 * rim, then a small live picture with the camera's state while it counts.
 * The video element lives here for the whole set; only its size changes.
 */
export function CameraPanel({ camera }: { camera: Camera }) {
  const { phase, health, error, tight, loadingStep, videoRef, zoomRef } = camera;

  if (phase === "idle" || phase === "error") {
    return (
      <section className="rounded-2xl border border-line bg-surface p-4">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-accent">Set up the camera</p>
        <ol className="mt-2 space-y-1.5 text-sm text-foreground">
          <li>1. Phone on a stand or fence, sideways, behind the shooter.</li>
          <li>2. The hoop in the top half of the picture, with sky or wall above the rim.</li>
          <li>3. The whole net in view, and the phone out of the sun.</li>
        </ol>
        {error && <p className="mt-3 text-xs font-semibold text-danger">{error}</p>}
        <Button size="lg" block className="mt-4" onClick={() => void camera.start()}>
          {error ? "Try the camera again" : "Open the camera"}
        </Button>
        <video ref={videoRef} className="hidden" muted playsInline />
      </section>
    );
  }

  const aiming = phase === "aiming" || phase === "starting";

  return (
    <section className="space-y-3">
      <div className={`relative overflow-hidden rounded-2xl bg-black ${aiming ? "" : "h-28"}`}>
        <video
          ref={videoRef}
          muted
          playsInline
          className={`block w-full ${aiming ? "aspect-video object-contain" : "h-full object-cover"}`}
          onPointerDown={(e) => {
            if (phase !== "aiming") return;
            const r = e.currentTarget.getBoundingClientRect();
            camera.aimAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
            haptic("tap");
          }}
        />
        {phase === "starting" && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">Opening the camera…</p>
        )}
        {phase === "counting" && <CountingBadge health={health} loadingStep={loadingStep} />}
      </div>

      {aiming && (
        <div className="space-y-3 rounded-2xl border border-line bg-surface p-3">
          <p className="text-sm font-semibold text-foreground">
            Tap the hoop in the picture. Then tap the front of the rim in the close-up: anywhere inside the ring is fine.
          </p>
          <canvas
            ref={zoomRef}
            width={416}
            height={416}
            className="block aspect-square w-full touch-none rounded-xl bg-black"
            onPointerDown={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              camera.aimInZoom((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
              haptic("tap");
            }}
          />
          {tight && (
            <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
              The rim is too near the top of the picture, so the ball&rsquo;s way in is cut off. Tilt the phone down or
              step back.
            </p>
          )}
          <Button size="lg" block disabled={phase !== "aiming"} onClick={() => void camera.startCounting()}>
            Start counting
          </Button>
          <p className="text-center text-xs text-foreground-mute">
            It sets the size itself from the first few shots. Nothing is recorded.
          </p>
        </div>
      )}
    </section>
  );
}

function CountingBadge({ health, loadingStep }: { health: Camera["health"]; loadingStep: string | null }) {
  let text = "Watching the hoop";
  let warn = false;
  if (loadingStep) text = "Getting ready…";
  else if (health?.slow) {
    text = "The phone is slowing down (warm?). Shots may be missed: shade it or take a break.";
    warn = true;
  } else if (health?.noBall) {
    text = "No ball seen for a minute. Is the hoop still in the picture?";
    warn = true;
  } else if (health?.sizing?.kind === "measuring") text = `Watching · sizing up the first shots (${health.sizing.have} of ${health.sizing.need})`;
  else if (health?.sizing?.kind === "checking") text = "Watching · adjusting the size";
  return (
    <p
      role="status"
      className={`absolute inset-x-2 bottom-2 rounded-md px-2 py-1 text-center text-xs font-bold text-white ${
        warn ? "bg-red-700/90" : "bg-black/65"
      }`}
    >
      {text}
    </p>
  );
}
