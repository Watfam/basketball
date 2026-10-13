/**
 * Audible drill alerts.
 *
 * Sound rather than vibration is the primary channel here on purpose:
 * iOS Safari doesn't implement the Vibration API at all (see haptics.ts),
 * so on an iPhone — the only device this app is actually used on courtside
 * — a buzz is silently nothing. A beep works everywhere, and carries
 * across a gym besides.
 *
 * Built with the Web Audio API rather than an <audio> file so there's no
 * asset to load, no network dependency mid-practice, and no latency
 * between "time's up" and the sound.
 */

let ctx: AudioContext | null = null;

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

/**
 * Tells iOS this page's sound is media, like a music app's, not a ringtone.
 * Without it the phone's silent switch mutes Web Audio completely, and a
 * shooter or a drill timer on a phone left on silent hears nothing (the
 * Audio Session API, Safari 16.4 and later; elsewhere there is no switch to
 * obey and this does nothing).
 */
function setMediaAudioSession() {
  try {
    const session = (navigator as AudioSessionNavigator).audioSession;
    if (session && session.type !== "playback") session.type = "playback";
  } catch {
    // Not supported here.
  }
}

/** Starts the audio clock again if the phone paused it (a call, another app, the screen locking); Safari calls that state "interrupted". */
function ensureRunning() {
  if (ctx && (ctx.state as string) !== "running" && (ctx.state as string) !== "closed") void ctx.resume().catch(() => {});
}

/**
 * Must be called from inside a real user gesture (a tap), once, before
 * any beep can be heard: mobile browsers create every AudioContext
 * suspended and only allow a gesture to resume it. Called when the coach
 * taps into Run Practice, which is the last guaranteed tap before the
 * first timer starts.
 *
 * Safe to call repeatedly — later calls just resume an existing context.
 */
export function primeAlerts() {
  if (typeof window === "undefined") return;
  setMediaAudioSession();

  if (ctx) {
    ensureRunning();
    return;
  }

  const AudioCtor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
  if (!AudioCtor) return;

  try {
    ctx = new AudioCtor();
    // Coming back to the app after another app or the lock screen had the audio: start it again.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") ensureRunning();
    });
    // Playing one silent sample inside the gesture is what actually
    // unlocks playback on iOS; constructing the context isn't enough.
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    ctx = null;
  }
}

/**
 * A short run of beeps. Scheduled on the audio clock rather than with
 * setTimeout, so the spacing stays exact even if the main thread is busy
 * rendering.
 */
export function beep(
  times = 1,
  { frequency = 880, duration = 0.14, gap = 0.2, volume = 0.3, delay = 0 } = {}
) {
  if (!ctx) return;
  ensureRunning();

  const start = ctx.currentTime + delay;
  for (let i = 0; i < times; i += 1) {
    const at = start + i * gap;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = frequency;

    // A tiny fade in and out — a bare square edge on a sine wave clicks.
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.012);
    gain.gain.setValueAtTime(volume, at + duration - 0.03);
    gain.gain.linearRampToValueAtTime(0, at + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }
}

/** Ten seconds left: three quick high beeps. */
export function beepWarning() {
  beep(3, { frequency: 880, duration: 0.1, gap: 0.16, volume: 0.25 });
}

/** Time's up: two longer, lower beeps — clearly different from the warning. */
export function beepDone() {
  beep(2, { frequency: 620, duration: 0.3, gap: 0.38, volume: 0.35 });
}

/**
 * A very short tick for logging a shot, distinct for a make and a miss.
 * For a shooter watching the rim rather than the phone: a high blip
 * confirms a make, a low one a miss, so a tap can be trusted unseen.
 */
export function blipShot(made: boolean) {
  beep(1, {
    frequency: made ? 1040 : 330,
    duration: made ? 0.08 : 0.12,
    volume: 0.2,
  });
}

/** What the sound system is doing right now, for the sound check and for reports. */
export function audioStatus(): { state: string; session: string | null } {
  const session = typeof navigator === "undefined" ? undefined : (navigator as AudioSessionNavigator).audioSession;
  return { state: ctx ? String(ctx.state) : "not started", session: session?.type ?? null };
}

/**
 * Plays what a player is promised: a high blip (make), a low blip (miss) and
 * the three warning beeps, a moment apart. Call it from a tap. The phone's
 * silent switch can't be read from a web page, so this is the one way to
 * know the sound is really coming out.
 */
export function soundCheck() {
  setMediaAudioSession();
  beep(1, { frequency: 1040, duration: 0.08, volume: 0.3 });
  beep(1, { frequency: 330, duration: 0.12, volume: 0.3, delay: 0.5 });
  beep(3, { frequency: 880, duration: 0.1, gap: 0.16, volume: 0.3, delay: 1.0 });
  return audioStatus();
}
