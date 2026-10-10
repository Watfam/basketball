/**
 * Live shot counting, without the camera or the screen.
 *
 * Given the rim's place in the picture and the ball boxes the model finds
 * in each frame, it decides makes and misses: the hoop window
 * (src/lib/vision/roi.ts), sizing from the ball (autoSize.ts) and the
 * make/miss rule (shotRules.ts), put together the way the camera lab
 * counts live. The Shoot screen and the lab both run this, so what the lab
 * measures is what a player gets.
 *
 * Live sizing: counting starts at once at the remembered size. When the
 * ball says the size is off, the new size waits for a moment with no shot
 * under way (the rule's rim can't move mid-shot), then the window changes
 * and counting carries on.
 */
import { hoopWindow, type Crop } from "./roi.ts";
import { AUTO_SIZE, createAutoSizer } from "./autoSize.ts";
import { createShotCounter, type Box, type ShotCall } from "./shotRules.ts";

export const SCALE_LIMITS = [0.5, 4] as const;

export type SizingStatus =
  | { kind: "measuring"; have: number; need: number }
  | { kind: "checking"; scale: number }
  | { kind: "set"; scale: number; ballWidth: number }
  | { kind: "fixed"; scale: number };

export type CountingWindow = { crop: Crop; rim: { x: number; y: number }; roomAbove: number };

export function createCountingCore(options: {
  frameW: number;
  frameH: number;
  /** The rim, as fractions of the frame. */
  rim: { x: number; y: number };
  /** The remembered size (1 is the training setup). */
  scale: number;
  /** Measure the size from the ball; off for the exam clips. */
  autoSize: boolean;
}) {
  const { frameW, frameH, rim } = options;
  const clamp = (s: number) => Math.min(SCALE_LIMITS[1], Math.max(SCALE_LIMITS[0], s));
  let scale = clamp(options.scale);
  let win: CountingWindow = hoopWindow(frameW, frameH, rim, scale);
  let counter = createShotCounter(win.rim);
  const sizer = options.autoSize ? createAutoSizer() : null;
  let sizerDone = !sizer;
  let pending: number | null = null;
  let sizing: SizingStatus = sizer ? { kind: "measuring", have: 0, need: AUTO_SIZE.flights } : { kind: "fixed", scale };

  return {
    /** The window to cut from the next frame (camera pixels). */
    get window(): CountingWindow {
      return win;
    },
    get scale(): number {
      return scale;
    },
    get sizing(): SizingStatus {
      return sizing;
    },

    /**
     * One frame: its time and the ball boxes found in the current window.
     * Returns the shots decided on this frame (counted and not; callers
     * keep `counted` ones) and whether the window changed for the next.
     */
    push(timeMs: number, balls: Box[]): { calls: ShotCall[]; windowChanged: boolean } {
      // Not while a new size waits: those sightings are at the old size.
      if (sizer && !sizerDone && pending === null) {
        const st = sizer.push(timeMs, balls, win.rim);
        if (st.kind === "collecting") {
          if (sizing.kind !== "measuring" || sizing.have !== st.have) sizing = { kind: "measuring", have: st.have, need: st.need };
        } else if (st.kind === "rescale") {
          pending = clamp(scale * st.factor);
          sizing = { kind: "checking", scale: pending };
        } else {
          sizerDone = true;
          sizing = { kind: "set", scale, ballWidth: st.ballWidth };
        }
      }

      const calls = counter.push(timeMs, balls);

      let windowChanged = false;
      if (pending !== null && counter.isIdle()) {
        scale = pending;
        pending = null;
        win = hoopWindow(frameW, frameH, rim, scale);
        // Idle, so nothing is lost: the new counter watches the rim where
        // it now sits in the window.
        counter = createShotCounter(win.rim);
        windowChanged = true;
      }
      return { calls, windowChanged };
    },

    /** End of the set: decide whatever is still waiting. */
    flush(): ShotCall[] {
      return counter.flush();
    },
  };
}
