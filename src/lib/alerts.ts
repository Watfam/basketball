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

import { readDraft } from "@/lib/use-local-draft";
import { SOUND_LEVEL_KEY, levelSettings, parseSoundLevel, type SoundLevel } from "@/lib/sound-level";

let ctx: AudioContext | null = null;
/** Everything goes through one level control and a limiter, so a loud sound is loud without a pile of beeps clipping. */
let out: AudioNode | null = null;

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
    out = buildOutput(ctx, ctx.destination);
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
    out = null;
  }
}

/** Master level into a limiter that only acts on the loudest peaks (just under full scale), then the speaker. */
function buildOutput(c: BaseAudioContext, dest: AudioNode): AudioNode {
  const master = c.createGain();
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -1;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.05;
  master.connect(limiter);
  limiter.connect(dest);
  return master;
}

export function currentSoundLevel(): SoundLevel {
  return parseSoundLevel(readDraft(SOUND_LEVEL_KEY));
}

export type BeepOptions = { frequency?: number; duration?: number; gap?: number; /** Loudness of this sound relative to the loudest (1). */ volume?: number; delay?: number };

/** Schedules beeps on any audio context (the live one, or an offline one for measuring), at a sound level. */
function schedule(c: BaseAudioContext, to: AudioNode, level: SoundLevel, times: number, { frequency = 880, duration = 0.14, gap = 0.2, volume = 1, delay = 0 }: BeepOptions) {
  const { peak, wave } = levelSettings(level);
  const loudness = peak * volume;
  const start = c.currentTime + delay;
  for (let i = 0; i < times; i += 1) {
    const at = start + i * gap;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = wave;
    osc.frequency.value = frequency;
    // A tiny fade in and out: a bare edge clicks.
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(loudness, at + 0.008);
    gain.gain.setValueAtTime(loudness, at + duration - 0.02);
    gain.gain.linearRampToValueAtTime(0, at + duration);
    osc.connect(gain);
    gain.connect(to);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }
}

/**
 * A short run of beeps. Scheduled on the audio clock rather than with
 * setTimeout, so the spacing stays exact even if the main thread is busy
 * rendering.
 */
export function beep(times = 1, options: BeepOptions = {}) {
  if (!ctx || !out) return;
  ensureRunning();
  schedule(ctx, out, currentSoundLevel(), times, options);
}

// Pitches sit where a phone speaker is strongest (well above 500 Hz): the old 330 Hz miss tone was nearly lost outdoors.
const MAKE: BeepOptions = { frequency: 1400, duration: 0.1 };
const MISS: BeepOptions = { frequency: 620, duration: 0.15 };
const WARNING: BeepOptions = { frequency: 1500, duration: 0.11, gap: 0.17 };
const DONE: BeepOptions = { frequency: 760, duration: 0.34, gap: 0.42 };

/** Ten seconds left: three quick high beeps. */
export function beepWarning() {
  beep(3, WARNING);
}

/** Time's up: two longer, lower beeps, clearly different from the warning. */
export function beepDone() {
  beep(2, DONE);
}

/**
 * A very short tick for logging a shot, distinct for a make and a miss.
 * For a shooter watching the rim rather than the phone: a high blip
 * confirms a make, a low one a miss, so a tap can be trusted unseen.
 */
export function blipShot(made: boolean) {
  beep(1, made ? MAKE : MISS);
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
  beep(1, MAKE);
  beep(1, { ...MISS, delay: 0.5 });
  beep(3, { ...WARNING, delay: 1.0 });
  return audioStatus();
}

/** For tests in a browser: one sound rendered offline at a level, as samples, through the same output chain. */
export async function renderForTest(level: SoundLevel, kind: "make" | "miss" | "warning" | "done"): Promise<Float32Array> {
  const rate = 44100;
  const c = new OfflineAudioContext(1, rate * 2, rate);
  const to = buildOutput(c, c.destination);
  const o = { make: MAKE, miss: MISS, warning: WARNING, done: DONE }[kind];
  schedule(c, to, level, kind === "warning" ? 3 : kind === "done" ? 2 : 1, o);
  return (await c.startRendering()).getChannelData(0);
}
