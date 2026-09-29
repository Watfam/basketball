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

  if (ctx) {
    if (ctx.state === "suspended") void ctx.resume();
    return;
  }

  const AudioCtor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
  if (!AudioCtor) return;

  try {
    ctx = new AudioCtor();
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
  { frequency = 880, duration = 0.14, gap = 0.2, volume = 0.3 } = {}
) {
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();

  const start = ctx.currentTime;
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
